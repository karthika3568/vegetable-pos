const incomeService = require('../services/income.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, category, fromDate, toDate, sortBy, sortOrder, page, limit } = req.query;
  const result = await incomeService.list({
    search,
    category,
    fromDate,
    toDate,
    sortBy,
    sortOrder,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const income = await incomeService.getById(Number(req.params.id));
  response.ok(res, income);
});

const create = asyncHandler(async (req, res) => {
  const income = await incomeService.create({
    ...req.body,
    createdBy: req.user.id,
    ipAddress: req.ip,
  });
  response.created(res, income, 'Income recorded');
});

const update = asyncHandler(async (req, res) => {
  const income = await incomeService.update(Number(req.params.id), req.body, {
    userId: req.user.id,
    ipAddress: req.ip,
  });
  response.ok(res, income, 'Income updated');
});

module.exports = { list, getById, create, update };