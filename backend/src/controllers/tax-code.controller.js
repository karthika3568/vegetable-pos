const taxCodeService = require('../services/tax-code.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query;

  const result = await taxCodeService.list({
    search,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getActiveAll = asyncHandler(async (req, res) => {
  const items = await taxCodeService.getActiveAll();
  response.ok(res, items);
});

const getById = asyncHandler(async (req, res) => {
  const taxCode = await taxCodeService.getById(Number(req.params.id));
  response.ok(res, taxCode);
});

const create = asyncHandler(async (req, res) => {
  const taxCode = await taxCodeService.create({
    code: req.body.code,
    name: req.body.name,
    cgstRate: req.body.cgstRate,
    sgstRate: req.body.sgstRate,
    igstRate: req.body.igstRate,
  });

  response.created(res, taxCode, 'Tax code created');
});

const update = asyncHandler(async (req, res) => {
  const taxCode = await taxCodeService.update(Number(req.params.id), {
    code: req.body.code,
    name: req.body.name,
    cgstRate: req.body.cgstRate,
    sgstRate: req.body.sgstRate,
    igstRate: req.body.igstRate,
  });

  response.ok(res, taxCode, 'Tax code updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const taxCode = await taxCodeService.setStatus(Number(req.params.id), req.body.status);
  response.ok(res, taxCode, 'Tax code status updated');
});

module.exports = {
  list,
  getActiveAll,
  getById,
  create,
  update,
  setStatus,
};
