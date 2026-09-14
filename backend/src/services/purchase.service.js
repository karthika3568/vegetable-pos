/**
 * Purchase service - business rules for the purchase module.
 *
 * Handles:
 * - Server-side invoice total calculation (quantity * purchase price,
 *   rounded to the 2-decimal DECIMAL(12,2) convention used by
 *   purchase_items.line_total and purchases.total_amount). The frontend
 *   total is never trusted.
 * - Supplier must exist and be active before a new purchase is recorded
 * - Each item product must exist and be active
 * - Invoice number uniqueness per supplier (409)
 * - Validation happens BEFORE the repository opens its transaction, so
 *   any failed purchase leaves zero rows behind; the repository's
 *   single transaction additionally guarantees header + items + stock
 *   updates + stock_transactions ledger rows commit atomically.
 * - Stock integration: a completed purchase increases stock and writes
 *   the ledger rows in the same transaction as the purchase; status
 *   changes reconcile stock idempotently (see
 *   stockRepository.syncPurchaseStock). Payments are owned by their own
 *   module.
 */

const purchaseRepository = require('../repositories/purchase.repository');
const supplierRepository = require('../repositories/supplier.repository');
const productRepository = require('../repositories/product.repository');
const ApiError = require('../utils/ApiError');
const imageFile = require('../utils/imageFile');

function toDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest('invalid date format');
  }
  return date.toISOString().slice(0, 10);
}

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function list({
  search,
  supplierId,
  fromDate,
  toDate,
  status,
  page = 1,
  limit = 20,
}) {
  const offset = (page - 1) * limit;

  const { rows, total } = await purchaseRepository.findAll({
    search,
    supplierId,
    fromDate: fromDate ? toDateString(fromDate) : undefined,
    toDate: toDate ? toDateString(toDate) : undefined,
    status,
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
  const purchase = await purchaseRepository.findById(id);

  if (!purchase) {
    throw ApiError.notFound(`Purchase ${id} not found`);
  }

  return purchase;
}

async function ensureSupplierActive(supplierId) {
  const supplier = await supplierRepository.findById(supplierId);

  if (!supplier) {
    throw ApiError.notFound(`Supplier ${supplierId} not found`);
  }

  if (supplier.status !== 'active') {
    throw ApiError.badRequest(
      'Purchases can only be recorded against an active supplier'
    );
  }

  return supplier;
}

async function ensureInvoiceAvailable(supplierId, invoiceNumber) {
  const existing = await purchaseRepository.findByInvoiceNumber(
    supplierId,
    invoiceNumber
  );

  if (existing) {
    throw ApiError.conflict(
      `Purchase with invoice number "${invoiceNumber}" already exists for this supplier`
    );
  }
}

async function ensureProductActive(productId) {
  const product = await productRepository.findById(productId);

  if (!product) {
    throw ApiError.notFound(`Product ${productId} not found`);
  }

  if (product.status !== 'active') {
    throw ApiError.badRequest(
      `Purchases can only be recorded against active products`
    );
  }

  return product;
}

async function create({ supplierId, invoiceNumber, purchaseDate, paymentType = 'credit', notes, items, invoiceImageFile, createdBy }) {
  await ensureSupplierActive(supplierId);
  await ensureInvoiceAvailable(supplierId, invoiceNumber);

  let imageExt = null;
  if (invoiceImageFile) {
    if (!invoiceImageFile.buffer || !Buffer.isBuffer(invoiceImageFile.buffer)) {
      throw ApiError.badRequest('Invalid image file data.');
    }
    imageExt = imageFile.detectImageExt(invoiceImageFile.buffer);
    if (!imageExt) {
      throw ApiError.badRequest(
        'Only JPEG, PNG, GIF or WebP images are supported. The uploaded file does not look like an image.'
      );
    }
  }

  const purchaseDateStr = toDateString(purchaseDate);

  const normalizedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const quantity = Number(item.quantity);
    const purchasePrice = Number(item.purchasePrice);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw ApiError.badRequest('each item quantity must be a positive number');
    }

    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      throw ApiError.badRequest('each item purchasePrice must be a non-negative number');
    }

    await ensureProductActive(item.productId);

    const lineTotal = toMoney(quantity * purchasePrice);
    totalAmount = toMoney(totalAmount + lineTotal);

    normalizedItems.push({
      productId: item.productId,
      quantity,
      purchasePrice,
      lineTotal,
    });
  }

  const purchase = await purchaseRepository.create({
    supplierId,
    invoiceNumber,
    purchaseDate: purchaseDateStr,
    paymentType,
    notes,
    totalAmount,
    items: normalizedItems,
    invoiceImage: invoiceImageFile ? { buffer: invoiceImageFile.buffer, ext: imageExt } : null,
    createdBy,
  });

  return purchase;
}

async function setStatus(id, status, createdBy) {
  const purchase = await getById(id);

  const items = purchase.items.map((item) => ({
    productId: Number(item.product_id),
    quantity: Number(item.quantity),
  }));

  return purchaseRepository.setStatus(id, status, {
    items,
    createdBy,
  });
}

module.exports = {
  list,
  getById,
  create,
  setStatus,
};