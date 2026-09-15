/**
 * Stock service - business rules for stock management.
 *
 * Handles:
 * - Server-side stock reads (list, single product, transaction history)
 * - Manual adjustment (delta-based, reason required). The frontend never
 *   sends a final stock figure - only a signed delta applied by the
 *   backend against the database value inside a transaction with a
 *   FOR UPDATE row lock. Resulting stock can never go negative.
 * - Purchase integration is done by the purchase repository, which calls
 *   stockRepository.syncPurchaseStock() inside the same DB transaction.
 *
 * Every stock change writes an immutable stock_transactions row with
 * source (reference_table/reference_id), reason (note), quantity change,
 * resulting quantity and the responsible user.
 */

const { pool } = require('../config/db');
const stockRepository = require('../repositories/stock.repository');
const productRepository = require('../repositories/product.repository');
const ApiError = require('../utils/ApiError');

function toDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest('invalid date format');
  }
  return date.toISOString().slice(0, 10);
}

async function list({ search, productStatus, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await stockRepository.findAll({
    search,
    productStatus,
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

async function getByProductId(productId) {
  const stock = await stockRepository.findByProductId(productId);

  if (!stock) {
    throw ApiError.notFound(`Product ${productId} not found`);
  }

  return stock;
}

async function ensureProductForAdjustment(productId) {
  const product = await productRepository.findById(productId);

  if (!product) {
    throw ApiError.notFound(`Product ${productId} not found`);
  }

  if (product.status !== 'active') {
    throw ApiError.badRequest('Stock can only be adjusted for an active product');
  }

  return product;
}

async function adjustProduct({ productId, delta, note, createdBy }) {
  const change = Number(delta);

  if (!Number.isFinite(change) || change === 0) {
    throw ApiError.badRequest('delta must be a non-zero number');
  }

  await ensureProductForAdjustment(productId);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await stockRepository.applyChange({
      conn: connection,
      productId,
      change,
      transactionType: 'adjustment',
      note: note || 'Manual stock adjustment',
      referenceTable: null,
      referenceId: null,
      createdBy,
    });

    await connection.commit();

    const updated = await stockRepository.findByProductId(productId);

    return { ...updated, movement: result };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Record damage / wastage: a pure stock-reduction movement.
 *
 * Reuses the exact same architecture as a manual adjustment - one
 * signed change applied atomically through stockRepository.applyChange()
 * (FOR UPDATE row lock, quantity can never go below zero, immutable
 * ledger row written in the same transaction). Damage is NEVER a sale,
 * purchase, return, credit transaction or invoice.
 *
 * A damage loss amount is derived from the product's recorded purchase
 * cost (products.cost_price) - real cost data, never hardcoded - and
 * returned to the caller so the UI/history can report the financial
 * impact. The ledger row itself stays quantity-only (matching the
 * existing stock_transactions schema).
 */
async function recordDamage({ productId, quantity, reason, note, createdBy }) {
  const qty = Number(quantity);

  if (!Number.isFinite(qty) || qty <= 0) {
    throw ApiError.badRequest('quantity must be a positive number');
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  if (!trimmedReason) {
    throw ApiError.badRequest('reason is required');
  }

  if (trimmedReason === 'Other' && !trimmedNote) {
    throw ApiError.badRequest('a note is required when reason is "Other"');
  }

  const product = await ensureProductForAdjustment(productId);

  const ledgerNote =
    trimmedReason === 'Other'
      ? trimmedNote
      : trimmedNote
        ? `${trimmedReason} - ${trimmedNote}`
        : trimmedReason;

  const lossAmount = Math.round(qty * Number(product.purchase_price) * 100) / 100;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await stockRepository.applyChange({
      conn: connection,
      productId,
      change: -qty,
      transactionType: 'damage',
      note: ledgerNote,
      referenceTable: null,
      referenceId: null,
      createdBy,
    });

    await connection.commit();

    const updated = await stockRepository.findByProductId(productId);

    return {
      ...updated,
      movement: result,
      reason: trimmedReason,
      note: trimmedNote,
      lossAmount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listTransactions({
  productId,
  type,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) {
  await getByProductId(productId);

  const offset = (page - 1) * limit;

  const { rows, total } = await stockRepository.findTransactions({
    productId,
    type,
    fromDate: fromDate ? toDateString(fromDate) : undefined,
    toDate: toDate ? toDateString(toDate) : undefined,
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

module.exports = {
  list,
  getByProductId,
  adjustProduct,
  recordDamage,
  listTransactions,
};