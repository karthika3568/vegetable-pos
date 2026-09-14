const supplierService = require('../services/supplier.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query;
  const result = await supplierService.list({
    search,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const supplier = await supplierService.getById(Number(req.params.id));
  response.ok(res, supplier);
});

const create = asyncHandler(async (req, res) => {
  const supplier = await supplierService.create({ ...req.body, actorId: req.user.id });
  response.created(res, supplier, 'Supplier created');
});

const update = asyncHandler(async (req, res) => {
  const supplier = await supplierService.update(Number(req.params.id), {
    ...req.body,
    actorId: req.user.id,
  });
  response.ok(res, supplier, 'Supplier updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const supplier = await supplierService.setStatus(
    Number(req.params.id),
    req.body.status,
    req.user.id
  );
  response.ok(res, supplier, 'Supplier status updated');
});

module.exports = { list, getById, create, update, setStatus };