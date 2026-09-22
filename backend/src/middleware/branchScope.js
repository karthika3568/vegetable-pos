/**
 * Branch-scoping middleware.
 *
 * Reads a branch id from the `X-Branch-Id` request header (query param
 * `branchId` as a fallback, for GET links/reports that cannot set custom
 * headers), validates it against the `branches` table, and attaches it
 * as `req.branchId`. Must run AFTER `authenticate`.
 *
 * The frontend sending a branch id is never trusted on its own - every
 * branch-scoped repository query filters `WHERE branch_id = ?` using
 * this value, so a request for data outside the resolved branch simply
 * returns nothing rather than relying on the client to behave.
 *
 * Two variants are exported:
 *   requireBranch - 400 when no branch id is supplied, 404 when it does
 *                   not resolve to an active branch. Use on every
 *                   branch-scoped write (stock/sales/purchases/
 *                   purchase orders/pre-bookings) and on branch-scoped
 *                   reads that make no sense without a branch.
 *   resolveBranch - same validation, but a missing header simply leaves
 *                   req.branchId undefined instead of rejecting the
 *                   request. Use on reads that may reasonably run
 *                   unscoped (e.g. the branch-agnostic product master).
 */

const branchRepository = require('../repositories/branch.repository');
const ApiError = require('../utils/ApiError');

function extractBranchId(req) {
  const raw = req.headers['x-branch-id'] ?? req.query.branchId;

  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  const branchId = Number(raw);

  if (!Number.isInteger(branchId) || branchId < 1) {
    throw ApiError.badRequest('X-Branch-Id must be a positive integer');
  }

  return branchId;
}

async function resolveAndAttach(req) {
  const branchId = extractBranchId(req);

  if (branchId === null) {
    return null;
  }

  const branch = await branchRepository.findById(branchId);

  if (!branch) {
    throw ApiError.notFound(`Branch ${branchId} not found`);
  }

  if (branch.status !== 'active') {
    throw ApiError.badRequest(`Branch "${branch.name}" is not active`);
  }

  req.branchId = branchId;
  req.branch = branch;

  return branch;
}

function requireBranch(req, res, next) {
  resolveAndAttach(req)
    .then((branch) => {
      if (!branch) {
        return next(ApiError.badRequest('X-Branch-Id header (or branchId query param) is required'));
      }
      next();
    })
    .catch(next);
}

function resolveBranch(req, res, next) {
  resolveAndAttach(req)
    .then(() => next())
    .catch(next);
}

module.exports = { requireBranch, resolveBranch };
