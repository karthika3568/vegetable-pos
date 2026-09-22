/**
 * Pre-Booking service - business rules for the pre-bookings module.
 *
 * Creating/listing/cancelling a pre-booking has NO stock, sales, or
 * payment effect - see pre-booking.repository.js. Converting one MUST
 * go through the existing sale-creation service (saleService.create),
 * never a duplicated stock/pricing/invoice implementation, so a
 * converted booking behaves exactly like any other POS sale (real
 * stock deduction, real GST calculation, real gap-free invoice number).
 */

const preBookingRepository = require('../repositories/pre-booking.repository');
const productRepository = require('../repositories/product.repository');
const customerRepository = require('../repositories/customer.repository');
const saleService = require('./sale.service');
const ApiError = require('../utils/ApiError');

async function list({ branchId, status, customerId, search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await preBookingRepository.findAll({
    branchId,
    status,
    customerId,
    search,
    limit,
    offset,
  });

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  const booking = await preBookingRepository.findById(id);

  if (!booking) {
    throw ApiError.notFound(`Pre-booking ${id} not found`);
  }

  return booking;
}

async function create({
  branchId,
  customerId,
  customerName,
  customerPhone,
  neededByDate,
  notes,
  items,
  createdBy,
}) {
  if (!branchId) {
    throw ApiError.badRequest('branchId is required to create a pre-booking');
  }

  if (!items || items.length === 0) {
    throw ApiError.badRequest('at least one item is required');
  }

  if (customerId) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw ApiError.notFound(`Customer ${customerId} not found`);
    }
  } else if (!customerName) {
    throw ApiError.badRequest('either customerId or customerName is required');
  }

  const normalizedItems = [];
  for (const raw of items) {
    const productId = Number(raw.productId);
    const variantId = raw.variantId !== undefined && raw.variantId !== null ? Number(raw.variantId) : 0;
    const quantity = Number(raw.quantity);

    if (!Number.isInteger(productId) || productId < 1) {
      throw ApiError.badRequest('each item productId must be a positive integer');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw ApiError.badRequest('each item quantity must be a positive number');
    }

    const product = await productRepository.findById(productId);
    if (!product) {
      throw ApiError.notFound(`Product ${productId} not found`);
    }

    // Indicative price only (order-slip display) - real price is
    // resolved fresh at conversion time by the sale module. Never
    // invented: falls back to the product's real current selling price.
    const unitPrice = raw.unitPrice !== undefined && raw.unitPrice !== null && raw.unitPrice !== ''
      ? Number(raw.unitPrice)
      : Number(product.selling_price);

    normalizedItems.push({ productId, variantId, quantity, unitPrice });
  }

  return preBookingRepository.create({
    branchId,
    customerId: customerId || null,
    customerName: customerName || null,
    customerPhone: customerPhone || null,
    neededByDate: neededByDate || null,
    notes: notes || null,
    items: normalizedItems,
    createdBy,
  });
}

async function cancel(id) {
  return preBookingRepository.cancel(id);
}

/**
 * Convert a pending pre-booking into a real sale via the existing
 * sale-creation service. The booking's items become the sale's line
 * items; the booking's branch and customer carry over. Payment details
 * (payments array, creditRequested, saleType, discount) are supplied
 * by the caller at conversion time - a booking carries no payment
 * information of its own to duplicate.
 */
async function convert(id, { payments = [], creditRequested = false, saleType = 'retail', discount = 0, createdBy, hasCreditPermission = false }) {
  const booking = await getById(id);

  if (booking.status !== 'pending') {
    throw ApiError.badRequest(`Pre-booking is "${booking.status}" and cannot be converted`);
  }

  if (!booking.items || booking.items.length === 0) {
    throw ApiError.badRequest('This pre-booking has no items and cannot be converted');
  }

  const sale = await saleService.create({
    branchId: Number(booking.branch_id),
    customerId: booking.customer_id ? Number(booking.customer_id) : undefined,
    saleType,
    discount,
    items: booking.items.map((item) => ({
      productId: Number(item.product_id),
      variantId: Number(item.variant_id) || null,
      quantity: Number(item.quantity),
      discount: 0,
    })),
    payments,
    creditRequested,
    createdBy,
    hasCreditPermission,
  });

  await preBookingRepository.markConverted(id, sale.id);

  return getById(id);
}

module.exports = {
  list,
  getById,
  create,
  cancel,
  convert,
};
