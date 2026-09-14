const saleService = require('../services/sale.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const {
    search,
    customerId,
    fromDate,
    toDate,
    status,
    paymentType,
    page,
    limit,
  } = req.query;

  const result = await saleService.list({
    search,
    customerId: customerId ? Number(customerId) : undefined,
    fromDate,
    toDate,
    status,
    paymentType,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const sale = await saleService.getById(
    Number(req.params.id)
  );

  response.ok(res, sale);
});

const create = asyncHandler(async (req, res) => {
  const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

  const sale = await saleService.create({
    customerId: req.body.customerId
      ? Number(req.body.customerId)
      : undefined,
    saleDate: req.body.saleDate,
    saleType: req.body.saleType || 'retail',
    discount: req.body.discount !== undefined
      ? Number(req.body.discount)
      : 0,
    items: req.body.items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      discount: item.discount !== undefined
        ? Number(item.discount)
        : 0,
    })),
    payments: req.body.payments
      ? req.body.payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
          notes: payment.notes,
        }))
      : [],
    creditRequested: req.body.creditRequested === true,
    createdBy: req.user.id,
    hasCreditPermission: permissions.includes('credit.create'),
  });

  response.created(res, sale, 'Sale completed');
});

const cancel = asyncHandler(async (req, res) => {
  const sale = await saleService.cancel({
    saleId: Number(req.params.saleId),
    createdBy: req.user.id,
  });

  response.ok(res, sale, 'Sale cancelled');
});

const returnSale = asyncHandler(async (req, res) => {
  const sale = await saleService.returnGoods({
    saleId: Number(req.params.saleId),
    items: req.body.items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
    })),
    reason: req.body.reason,
    createdBy: req.user.id,
  });

  response.ok(res, sale, 'Return recorded');
});

module.exports = {
  list,
  getById,
  create,
  cancel,
  returnSale,
};