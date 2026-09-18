const purchaseService = require('../services/purchase.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const {
    search,
    supplierId,
    fromDate,
    toDate,
    status,
    page,
    limit,
  } = req.query;

  const result = await purchaseService.list({
    search,
    supplierId: supplierId ? Number(supplierId) : undefined,
    fromDate,
    toDate,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.getById(
    Number(req.params.id)
  );

  response.ok(res, purchase);
});

const create = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.create({
    supplierId: Number(req.body.supplierId),
    invoiceNumber: req.body.invoiceNumber,
    purchaseDate: req.body.purchaseDate,
    paymentType: req.body.paymentType,
    notes: req.body.notes,
    items: req.body.items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
      purchasePrice: Number(item.purchasePrice),
    })),
    invoiceImageFile: req.file || null,
    createdBy: req.user.id,
  });

  response.created(res, purchase, 'Purchase created');
});

const setStatus = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.setStatus(
    Number(req.params.id),
    req.body.status,
    req.user.id
  );

  response.ok(
    res,
    purchase,
    'Purchase status updated'
  );
});

const recordPayment = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.recordPayment({
    purchaseId: Number(req.params.id),
    amount: Number(req.body.amount),
    method: req.body.method,
    paymentDate: req.body.paymentDate,
    notes: req.body.notes,
    receivedBy: req.user.id,
  });

  response.ok(res, purchase, 'Supplier payment recorded');
});

const getPayments = asyncHandler(async (req, res) => {
  const payments = await purchaseService.getPayments(
    Number(req.params.id)
  );

  response.ok(res, payments, 'Payment history retrieved');
});

const setActualAmount = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.setActualAmount({
    purchaseId: Number(req.params.id),
    items: (req.body.items || []).map((item) => ({
      productId: Number(item.productId),
      unitPrice: Number(item.unitPrice),
    })),
    damages: (req.body.damages || []).map((damage) => ({
      productId: Number(damage.productId),
      quantity: Number(damage.quantity),
    })),
    damageAdjustmentAccepted: Boolean(req.body.damageAdjustmentAccepted),
    createdBy: req.user.id,
  });

  response.ok(res, purchase, 'Actual purchase amount recorded');
});

const history = asyncHandler(async (req, res) => {
  const {
    search,
    type,
    status,
    fromDate,
    toDate,
    page,
    limit,
  } = req.query;

  const result = await purchaseService.listHistory({
    search,
    type,
    status,
    fromDate,
    toDate,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

module.exports = {
  list,
  getById,
  create,
  setStatus,
  recordPayment,
  setActualAmount,
  getPayments,
  history,
};