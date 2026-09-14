const expenseService = require('../services/expense.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, category, fromDate, toDate, sortBy, sortOrder, page, limit } = req.query;
  const result = await expenseService.list({
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
  const expense = await expenseService.getById(Number(req.params.id));
  response.ok(res, expense);
});

const create = asyncHandler(async (req, res) => {
  const expense = await expenseService.create({
    ...req.body,
    createdBy: req.user.id,
    ipAddress: req.ip,
  });
  response.created(res, expense, 'Expense recorded');
});

const update = asyncHandler(async (req, res) => {
  const expense = await expenseService.update(Number(req.params.id), req.body, {
    userId: req.user.id,
    ipAddress: req.ip,
  });
  response.ok(res, expense, 'Expense updated');
});

module.exports = { list, getById, create, update };