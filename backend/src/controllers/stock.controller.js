const stockService = require('../services/stock.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const {
    search,
    productStatus,
    page,
    limit,
  } = req.query;

  const result = await stockService.list({
    search,
    productStatus,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getByProduct = asyncHandler(async (req, res) => {
  const stock = await stockService.getByProductId(
    Number(req.params.productId)
  );

  response.ok(res, stock);
});

const adjust = asyncHandler(async (req, res) => {
  const stock = await stockService.adjustProduct({
    productId: Number(req.params.productId),
    delta: Number(req.body.delta),
    note: req.body.note,
    createdBy: req.user.id,
  });

  response.ok(res, stock, 'Stock adjusted');
});

const transactions = asyncHandler(async (req, res) => {
  const {
    type,
    fromDate,
    toDate,
    page,
    limit,
  } = req.query;

  const result = await stockService.listTransactions({
    productId: Number(req.params.productId),
    type,
    fromDate,
    toDate,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

module.exports = {
  list,
  getByProduct,
  adjust,
  transactions,
};