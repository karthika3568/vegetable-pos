const creditService = require('../services/credit.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, outstanding, status, page, limit } = req.query;

  const result = await creditService.list({
    search,
    outstanding,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination, 'Credit balances retrieved');
});

const getCustomerCredit = asyncHandler(async (req, res) => {
  const credit = await creditService.getCustomerCredit(
    Number(req.params.customerId)
  );

  response.ok(res, credit);
});

const createFromSale = asyncHandler(async (req, res) => {
  const credit = await creditService.createFromSale({
    saleId: Number(req.body.saleId),
    createdBy: req.user.id,
  });

  if (credit.alreadyRecorded) {
    return response.ok(res, credit, 'Credit already recorded for this sale');
  }

  response.created(res, credit, 'Credit recorded');
});

const collect = asyncHandler(async (req, res) => {
  const result = await creditService.collect({
    customerId: Number(req.params.customerId),
    amount: Number(req.body.amount),
    method: req.body.method,
    notes: req.body.notes,
    receivedBy: req.user.id,
  });

  response.created(res, result, 'Credit collected');
});

const getTransactions = asyncHandler(async (req, res) => {
  const result = await creditService.getTransactions({
    customerId: Number(req.params.customerId),
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination, 'Credit history retrieved');
});

module.exports = {
  list,
  getCustomerCredit,
  createFromSale,
  collect,
  getTransactions,
};