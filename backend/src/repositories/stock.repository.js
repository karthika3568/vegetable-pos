/**
 * Stock repository - all raw SQL for stock lives here.
 *
 * Uses the existing schema (database/schema.sql):
 *   stock                 - one row per product (UNIQUE product_id):
 *                           product_id, quantity DECIMAL(10,3),
 *                           updated_at. CHECK quantity >= 0.
 *   stock_transactions    - immutable ledger: product_id, transaction_type
 *                           ENUM('purchase','sale','return_purchase',
 *                           'return_sale','adjustment','cancellation_reversal'),
 *                           quantity_change (signed), quantity_before,
 *                           quantity_after, reference_table, reference_id,
 *                           note, created_by, created_at.
 *
 * Stock is product-level: `stock` and `stock_transactions` have NO
 * variant_id column. Product variants are master data only; stock and
 * purchases are scoped to products.
 *
 * The reconciliation helper syncPurchaseStock() is the idempotency
 * mechanism used by the purchase module: it computes the CURRENT net
 * effect already recorded in the ledger for a purchase
 * (transaction_type IN purchase/cancellation_reversal) and applies only
 * the difference needed to reach the target status. Because it runs
 * inside the SAME transaction that writes the purchase, a completed
 * purchase can never double-increase stock and cancels/reversals can
 * never double-run - even if the same status request repeats.
 *
 * Row safety: every movement reads `stock` with SELECT ... FOR UPDATE
 * inside the caller's transaction, so concurrent movements on one
 * product serialize and can never read stale quantities (e.g. lost
 * updates from two simultaneous adjustments). The CHECK constraint
 * (quantity >= 0, quantity_after >= 0) is the final backstop.
 */

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

function to3(value) {
  const n = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
}

/**
 * Connection-aware internals (must run inside a caller-owned
 * transaction so movements + ledger rows commit together).
 */

async function ensureStockRow(conn, productId) {
  await conn.query(
    `INSERT INTO stock (product_id, quantity)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE id = id`,
    [productId]
  );
}

/**
 * Apply one signed quantity change to a product's stock and record the
 * matching immutable ledger row. Uses FOR UPDATE so concurrent
 * movements serialize on the product row. Rejects any movement that
 * would push quantity below zero (before the CHECK constraint backs us
 * up). Returns { before, after, change }.
 */
async function applyChange({
  conn,
  productId,
  change,
  transactionType,
  note,
  referenceTable,
  referenceId,
  createdBy,
}) {
  const delta = to3(change);

  if (delta === 0) {
    throw ApiError.badRequest('stock change cannot be zero');
  }

  await ensureStockRow(conn, productId);

  const [[row]] = await conn.query(
    `SELECT quantity FROM stock WHERE product_id = ? FOR UPDATE`,
    [productId]
  );

  const before = Number(row.quantity);
  const after = to3(before + delta);

  if (after < 0) {
    throw ApiError.badRequest(
      `Stock for product ${productId} cannot go negative (${before} ${delta < 0 ? '-' : '+'} ${Math.abs(delta)} would result in ${after})`
    );
  }

  await conn.query(
    `UPDATE stock SET quantity = ? WHERE product_id = ?`,
    [after, productId]
  );

  await conn.query(
    `INSERT INTO stock_transactions
       (product_id, transaction_type, quantity_change, quantity_before, quantity_after,
        reference_table, reference_id, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, transactionType, delta, before, after, referenceTable || null, referenceId || null, note || null, createdBy]
  );

  return { productId, before, after, change: delta };
}

/**
 * Current net stock effect already recorded in the ledger for a given
 * reference (e.g. all purchase/cancellation_reversal rows of one
 * purchase for one product).
 */
async function getNetEffect({ conn, productId, referenceTable, referenceId }) {
  const [[row]] = await conn.query(
    `SELECT COALESCE(SUM(quantity_change), 0) AS net
     FROM stock_transactions
     WHERE product_id = ? AND reference_table = ? AND reference_id = ?`,
    [productId, referenceTable, referenceId]
  );
  return Number(row.net);
}

/**
 * Reconcile a purchase's stock effect to match its status.
 *
 *   targetStatus 'completed' -> desired net effect = +item.quantity
 *   targetStatus 'cancelled' -> desired net effect = 0
 *
 * Only the difference (ledger net vs desired) is applied, so:
 *   - create-as-completed applies each item exactly once (net 0)
 *   - re-completing after a cancellation re-applies exactly once
 *   - cancelling reverses exactly the amount previously applied
 *   - repeating the same status request changes nothing
 */
async function syncPurchaseStock({
  conn,
  purchaseId,
  items,
  targetStatus,
  createdBy,
}) {
  for (const item of items) {
    const quantity = Number(item.quantity);
    const net = await getNetEffect({
      conn,
      productId: item.productId,
      referenceTable: 'purchases',
      referenceId: purchaseId,
    });

    const desired = targetStatus === 'completed' ? quantity : 0;
    const change = to3(desired - net);

    if (change === 0) {
      continue;
    }

    await applyChange({
      conn,
      productId: item.productId,
      change,
      transactionType: change > 0 ? 'purchase' : 'cancellation_reversal',
      note: change > 0 ? 'Purchase received' : 'Purchase cancelled',
      referenceTable: 'purchases',
      referenceId: purchaseId,
      createdBy,
    });
  }
}

/**
 * Read-side queries (own pool, SELECT-only).
 */

const STOCK_SELECT = `
  SELECT
    p.id AS product_id,
    p.sku AS product_code,
    p.name AS product_name,
    p.unit,
    p.selling_price,
    p.reorder_level AS minimum_stock,
    COALESCE(s.quantity, 0) AS quantity,
    s.updated_at AS stock_updated_at,
    CASE
      WHEN p.is_active = 1 THEN 'active'
      ELSE 'inactive'
    END AS status
  FROM products p
  LEFT JOIN stock s ON s.product_id = p.id
`;

async function findAll({ search, productStatus, limit, offset }) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      p.name LIKE ?
      OR p.sku LIKE ?
    )`);
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  if (productStatus) {
    where.push(
      productStatus === 'active'
        ? 'p.is_active = 1'
        : 'p.is_active = 0'
    );
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [rows] = await pool.query(
    `${STOCK_SELECT}
     ${whereSql}
     ORDER BY p.name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM products p
     ${whereSql}`,
    params
  );

  return { rows, total: Number(total) };
}

async function findByProductId(productId) {
  const [rows] = await pool.query(
    `${STOCK_SELECT}
     WHERE p.id = ?`,
    [productId]
  );

  return rows[0] || null;
}

async function findTransactions({
  productId,
  type,
  fromDate,
  toDate,
  limit,
  offset,
}) {
  const where = ['st.product_id = ?'];
  const params = [productId];

  if (type) {
    where.push('st.transaction_type = ?');
    params.push(type);
  }

  if (fromDate) {
    where.push('st.created_at >= ?');
    params.push(`${fromDate} 00:00:00`);
  }

  if (toDate) {
    where.push('st.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(toDate);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT
       st.id,
       st.product_id,
       p.name AS product_name,
       st.transaction_type,
       st.quantity_change,
       st.quantity_before,
       st.quantity_after,
       st.reference_table,
       st.reference_id,
       st.note,
       st.created_by,
       u.username AS created_by_name,
       st.created_at
     FROM stock_transactions st
     JOIN products p ON p.id = st.product_id
     LEFT JOIN users u ON u.id = st.created_by
     ${whereSql}
     ORDER BY st.created_at DESC, st.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM stock_transactions st
     ${whereSql}`,
    params
  );

  return { rows, total: Number(total) };
}

module.exports = {
  findAll,
  findByProductId,
  findTransactions,
  applyChange,
  getNetEffect,
  syncPurchaseStock,
  to3,
};