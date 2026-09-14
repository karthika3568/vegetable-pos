/**
 * Authorization middleware structure (Phase 2 foundation).
 *
 * Must run AFTER `authenticate`. Checks that req.user carries every
 * required permission code, matching the user_permissions design in
 * the database (fine-grained, per-user, backend-enforced - never
 * trusted from the frontend).
 *
 * Usage:
 *   router.post('/products', authenticate, authorize('products.manage'), controller.create)
 */

const ApiError = require('../utils/ApiError');

function authorize(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }

    next();
  };
}

module.exports = authorize;
