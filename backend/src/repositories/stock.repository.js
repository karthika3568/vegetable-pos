/**
 * Stock repository - all raw SQL for stock lives here.
 *
 * Uses the schema (database/schema.sql, migration 021):
 *   stock                 - one row per (branch_id, product_id, variant_id):
 *                           quantity DECIMAL(10,3), updated_at.
 *                           CHECK quantity >= 0.
 *   stock_transactions    - immutable ledger: branch_id, product_id,
 *                           variant_id, transaction_type ENUM('purchase',
 *                           'sale','return_purchase','return_sale',
 *                           'adjustment','cancellation_reversal','damage'),
 *                           quantity_change (signed), quantity_before,
 *                           quantity_after, reference_table, reference_id,
 *                           note, created_by, created_at.
 *
 * Multi-branch (migration 021): stock is now scoped PER BRANCH - the
 * same product has an independent quantity in every branch it is
 * available in (uq_stock_branch_product_variant = branch_id + product_id
 * + variant_id). Every function here takes a branchId and every SQL
 * statement filters/writes by it; there is no "global" stock row.
 *
 * The reconciliation helper syncPurchaseStock() is the idempotency
 * mechanism used by the purchase module: it computes the CURRENT net
 * effect already recorded in the ledger for a purchase (transaction_type
 * IN purchase/cancellation_reversal) and applies only the difference
 * needed to reach the target status. Because it runs inside the SAME
 * transaction that writes the purchase, a completed purchase can never
 * double-increase stock and cancels/reversals can never double-run -
 * even if the same status request repeats.
 *
 * Row safety: every movement reads `stock` with SELECT ... FOR UPDATE
 * inside the caller's transaction, so concurrent movements on one
 * (branch, product, variant) serialize and can never read stale
 * quantities. The CHECK constraint (quantity >= 0, quantity_after >= 0)
 * is the final backstop.
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

async function ensureStockRow(conn, branchId, productId, variantId = 0) {
  await conn.query(
    `INSERT INTO stock (branch_id, product_id, variant_id, quantity)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE id = id`,
    [branchId, productId, variantId ?? 0]
  );
}

/**
 * Apply one signed quantity change to a product's stock IN ONE BRANCH
 * and record the matching immutable ledger row. Uses FOR UPDATE so
 * concurrent movements serialize on the (branch, product, variant) row.
 * Rejects any movement that would push quantity below zero (before the
 * CHECK constraint backs us up). Returns { before, after, change }.
 */
async function applyChange({
  conn,
  branchId,
  productId,
  variantId = 0,
  change,
  transactionType,
  note,
  referenceTable,
  referenceId,
  createdBy,
}) {
  if (!branchId) {
    throw ApiError.badRequest('branchId is required for a stock movement');
  }

  const delta = to3(change);

  if (delta === 0) {
    throw ApiError.badRequest('stock change cannot be zero');
  }

  const resolvedVariantId = Number(variantId ?? 0);
  await ensureStockRow(conn, branchId, productId, resolvedVariantId);

  const [[row]] = await conn.query(
    `SELECT quantity FROM stock WHERE branch_id = ? AND product_id = ? AND variant_id = ? FOR UPDATE`,
    [branchId, productId, resolvedVariantId]
  );

  const before = Number(row.quantity);
  const after = to3(before + delta);

  if (after < 0) {
    throw ApiError.badRequest(
      `Stock for product ${productId}${variantId ? ` variant ${variantId}` : ''} in branch ${branchId} cannot go negative (${before} ${delta < 0 ? '-' : '+'} ${Math.abs(delta)} would result in ${after})`
    );
  }

  await conn.query(
    `UPDATE stock SET quantity = ? WHERE branch_id = ? AND product_id = ? AND variant_id = ?`,
    [after, branchId, productId, resolvedVariantId]
  );

  await conn.query(
    `INSERT INTO stock_transactions
       (branch_id, product_id, variant_id, transaction_type, quantity_change, quantity_before, quantity_after,
        reference_table, reference_id, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [branchId, productId, resolvedVariantId, transactionType, delta, before, after, referenceTable || null, referenceId || null, note || null, createdBy]
  );

  return { branchId, productId, variantId: resolvedVariantId, before, after, change: delta };
}

/**
 * Current net stock effect already recorded in the ledger for a given
 * reference (e.g. all purchase/cancellation_reversal rows of one
 * purchase for one product), scoped to one branch.
 */
async function getNetEffect({ conn, branchId, productId, variantId = 0, referenceTable, referenceId }) {
  const resolvedVariantId = Number(variantId ?? 0);
  const [[row]] = await conn.query(
    `SELECT COALESCE(SUM(quantity_change), 0) AS net
     FROM stock_transactions
     WHERE branch_id = ?
       AND product_id = ?
       AND variant_id = ?
       AND reference_table = ?
       AND reference_id = ?`,
    [branchId, productId, resolvedVariantId, referenceTable, referenceId]
  );
  return Number(row.net);
}

/**
 * Reconcile a purchase's stock effect (in the purchase's own branch) to
 * match its status.
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
  branchId,
  purchaseId,
  items,
  targetStatus,
  createdBy,
}) {
  if (!branchId) {
    throw ApiError.badRequest('branchId is required to reconcile purchase stock');
  }

  for (const item of items) {
    const quantity = Number(item.quantity);
    const net = await getNetEffect({
      conn,
      branchId,
      productId: item.productId,
      variantId: item.variantId ?? 0,
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
      branchId,
      productId: item.productId,
      variantId: item.variantId ?? 0,
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
 * Read-side queries (own pool, SELECT-only). All branch-scoped.
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
  LEFT JOIN stock s ON s.product_id = p.id AND s.branch_id = ?
`;

async function findAll({ branchId, search, productStatus, limit, offset }) {
  if (!branchId) {
    throw ApiError.badRequest('branchId is required to list stock');
  }

  const where = [];
  const params = [branchId];

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
    where.length ? params.slice(1) : []
  );

  return { rows, total: Number(total) };
}

async function findByProductId(branchId, productId) {
  if (!branchId) {
    throw ApiError.badRequest('branchId is required to read stock');
  }

  const [rows] = await pool.query(
    `${STOCK_SELECT}
     WHERE p.id = ?`,
    [branchId, productId]
  );

  return rows[0] || null;
}

async function findTransactions({
  branchId,
  productId,
  type,
  fromDate,
  toDate,
  limit,
  offset,
}) {
  if (!branchId) {
    throw ApiError.badRequest('branchId is required to list stock transactions');
  }

  const where = ['st.branch_id = ?', 'st.product_id = ?'];
  const params = [branchId, productId];

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
       st.branch_id,
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
       st.created_at,
       -- Additive references for the movement ledger: the originating
       -- invoice / purchase number and the party it belongs to. Keeps the
       -- existing column set unchanged so callers stay source-compatible.
       COALESCE(si.invoice_number, pi.invoice_number, po.po_number) AS reference_number,
       COALESCE(cu.name, su.name, po_su.name) AS party_name,
       CASE
         WHEN st.reference_table = 'sales' AND cu.name IS NOT NULL THEN 'customer'
         WHEN st.reference_table = 'purchases' AND su.name IS NOT NULL THEN 'supplier'
         WHEN st.reference_table = 'purchase_orders' AND po_su.name IS NOT NULL THEN 'supplier'
         ELSE NULL
       END AS party_type
     FROM stock_transactions st
     JOIN products p ON p.id = st.product_id
     LEFT JOIN users u ON u.id = st.created_by
     -- Resolve sale-linked movements (sales, return_sale, etc.) to their
     -- invoice + customer.
     LEFT JOIN sales si ON st.reference_table = 'sales' AND si.id = st.reference_id
     LEFT JOIN customers cu ON cu.id = si.customer_id
     -- Resolve purchase-linked movements to their invoice + supplier.
     LEFT JOIN purchases pi ON st.reference_table = 'purchases' AND pi.id = st.reference_id
     LEFT JOIN suppliers su ON su.id = pi.supplier_id
     -- Resolve purchase-order-linked movements to their PO number + supplier.
     LEFT JOIN purchase_orders po ON st.reference_table = 'purchase_orders' AND po.id = st.reference_id
     LEFT JOIN suppliers po_su ON po_su.id = po.supplier_id
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
