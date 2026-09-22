const preBookingService = require('../services/pre-booking.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { status, customerId, search, page, limit } = req.query;

  const result = await preBookingService.list({
    branchId: req.branchId,
    status,
    customerId: customerId ? Number(customerId) : undefined,
    search,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const booking = await preBookingService.getById(Number(req.params.id));

  response.ok(res, booking);
});

const create = asyncHandler(async (req, res) => {
  const booking = await preBookingService.create({
    branchId: req.branchId,
    customerId: req.body.customerId ? Number(req.body.customerId) : undefined,
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    neededByDate: req.body.neededByDate,
    notes: req.body.notes,
    items: req.body.items.map((item) => ({
      productId: Number(item.productId),
      variantId: item.variantId !== undefined && item.variantId !== null && item.variantId !== ''
        ? Number(item.variantId)
        : 0,
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== ''
        ? Number(item.unitPrice)
        : undefined,
    })),
    createdBy: req.user.id,
  });

  response.created(res, booking, 'Pre-booking created');
});

const cancel = asyncHandler(async (req, res) => {
  const booking = await preBookingService.cancel(Number(req.params.id));

  response.ok(res, booking, 'Pre-booking cancelled');
});

const convert = asyncHandler(async (req, res) => {
  const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

  const booking = await preBookingService.convert(Number(req.params.id), {
    payments: req.body.payments
      ? req.body.payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
          notes: payment.notes,
        }))
      : [],
    creditRequested: req.body.creditRequested === true,
    saleType: req.body.saleType || 'retail',
    discount: req.body.discount !== undefined ? Number(req.body.discount) : 0,
    createdBy: req.user.id,
    hasCreditPermission: permissions.includes('credit.create'),
  });

  response.ok(res, booking, 'Pre-booking converted to sale');
});

module.exports = {
  list,
  getById,
  create,
  cancel,
  convert,
};
