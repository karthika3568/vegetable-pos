const customerService = require('../services/customer.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query;
  const result = await customerService.list({
    search,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const customer = await customerService.getById(Number(req.params.id));
  response.ok(res, customer);
});

const create = asyncHandler(async (req, res) => {
  const customer = await customerService.create({
    ...req.body,
    actorId: req.user.id,
  });
  response.created(res, customer, 'Customer created');
});

const update = asyncHandler(async (req, res) => {
  const customer = await customerService.update(Number(req.params.id), {
    ...req.body,
    actorId: req.user.id,
  });
  response.ok(res, customer, 'Customer updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const customer = await customerService.setStatus(
    Number(req.params.id),
    req.body.status,
    req.user.id
  );
  response.ok(res, customer, 'Customer status updated');
});

module.exports = { list, getById, create, update, setStatus };