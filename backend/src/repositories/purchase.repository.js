/**
 * Purchase repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly.
 *
 * Uses the existing database/schema.sql purchases + purchase_items
 * tables. A purchase is created atomically inside ONE transaction
 * (header + all items); extraction of line totals and the invoice
 * total are computed by the service layer.
 *
 * Notes on the live schema:
 *   - purchase_items has NO variant_id column, so purchases are
 *     product-scoped (no product-variant support in purchases).
 *   - purchase_items.line_total is a generated STORED column
 *     (quantity * unit_cost) computed by MySQL itself.
 *   - purchases UNIQUE(supplier_id, invoice_number) is enforced by the
 *     database; the service pre-checks it to return a clean 409.
 *   - Stock integration: a completed purchase increases stock and writes
 *     the matching stock_transactions ledger rows in this SAME
 *     transaction (via stockRepository.syncPurchaseStock). Status changes
 *     reconcile stock to the purchase status idempotently. Stock and
 *     payments are otherwise owned by their own modules.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');
const stockRepository = require('./stock.repository');
const ApiError = require('../utils/ApiError');
const {
  purchaseInvoicesUploadsRoot,
  purchaseInvoicesUrlBase,
} = require('../config/storage');

const BASE_SELECT = `
  SELECT
    pu.id,
    pu.supplier_id,
    s.name AS supplier_name,
    pu.purchase_order_id,
    po.po_number,
    pu.invoice_number,
    pu.purchase_date,
    pu.total_amount,
    pu.paid_amount,
    pu.payment_status,
    pu.status,
    pu.notes,
    pu.invoice_image_path,
    pu.created_by,
    u.username AS created_by_name,
    pu.created_at,
    pu.updated_at
  FROM purchases pu
  JOIN suppliers s ON s.id = pu.supplier_id
  LEFT JOIN purchase_orders po ON po.id = pu.purchase_order_id
  LEFT JOIN users u ON u.id = pu.created_by
`;

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return toMoney(value).toFixed(2);
}

/**
 * Backend/database-driven search + filter + pagination.
 *
 * Search:
 *   - Supplier name
 *   - Invoice number
 *
 * Filters:
 *   - supplierId
 *   - fromDate / toDate (purchase_date range)
 *   - status
 */
async function findAll({
  search,
  supplierId,
  fromDate,
  toDate,
  status,
  limit,
  offset,
}) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      s.name LIKE ?
      OR pu.invoice_number LIKE ?
      OR po.po_number LIKE ?
    )`);

    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (supplierId) {
    where.push('pu.supplier_id = ?');
    params.push(supplierId);
  }

  if (fromDate) {
    where.push('pu.purchase_date >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('pu.purchase_date <= ?');
    params.push(toDate);
  }

  if (status) {
    where.push('pu.status = ?');
    params.push(status);
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM purchases pu
     JOIN suppliers s ON s.id = pu.supplier_id
     LEFT JOIN purchase_orders po ON po.id = pu.purchase_order_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY pu.purchase_date DESC, pu.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE pu.id = ?`,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const [items] = await pool.query(
    `SELECT
       pi.id,
       pi.product_id,
       p.name AS product_name,
       p.sku AS product_code,
       pi.quantity,
       pi.unit_cost AS purchase_price,
       pi.line_total
     FROM purchase_items pi
     JOIN products p ON p.id = pi.product_id
     WHERE pi.purchase_id = ?
     ORDER BY pi.id ASC`,
    [id]
  );

  return { ...rows[0], items };
}

async function findByInvoiceNumber(supplierId, invoiceNumber) {
  const [rows] = await pool.query(
    `SELECT id
     FROM purchases
     WHERE supplier_id = ? AND invoice_number = ?`,
    [supplierId, invoiceNumber]
  );

  return rows[0] || null;
}

/**
 * Append-only payment history for one purchase, backed by the shared
 * payments ledger (payment_type = 'purchase_payment'). Read-only.
 */
async function findPayments(purchaseId) {
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.amount,
       p.payment_method,
       p.payment_type,
       p.payment_date,
       p.notes,
       p.received_by,
       u.username AS received_by_name,
       p.created_at
     FROM payments p
     LEFT JOIN users u ON u.id = p.received_by
     WHERE p.purchase_id = ?
     ORDER BY p.payment_date ASC, p.id ASC`,
    [purchaseId]
  );

  return rows;
}

/**
 * Record a supplier payment against a purchase. The purchase row is
 * locked FOR UPDATE so concurrent payments serialize; paid_amount and
 * payment_status are DERIVED from the actual payment_transactions in
 * the shared payments ledger (never from the request body), so the
 * stored payment status can never be "edited" by hand and always
 * reflects real money recorded:
 *
 *   - paid = 0                    -> 'unpaid'
 *   - 0 < paid < total            -> 'partial'
 *   - paid >= total               -> 'paid'
 *
 * Overpayments are rejected BEFORE any write (amount > balance), so
 * balance (total - paid) can never go negative. A cancelled purchase
 * is not eligible for payment.
 */
async function recordPayment({ purchaseId, amount, method, paymentDate, notes, receivedBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [purchaseRows] = await connection.query(
      `SELECT id, status, total_amount
       FROM purchases
       WHERE id = ?
       FOR UPDATE`,
      [purchaseId]
    );
    const purchase = purchaseRows[0];

    if (!purchase) {
      throw ApiError.notFound(`Purchase ${purchaseId} not found`);
    }

    if (purchase.status !== 'completed') {
      throw ApiError.badRequest(
        'Payments can only be recorded against a completed purchase'
      );
    }

    const totalAmount = toMoney(purchase.total_amount);

    const [[{ paid }]] = await connection.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM payments
       WHERE purchase_id = ?`,
      [purchaseId]
    );

    const sumPaid = toMoney(paid);
    const balance = toMoney(totalAmount - sumPaid);

    if (balance <= 0) {
      throw ApiError.badRequest('This purchase is already fully paid');
    }

    if (amount > balance) {
      throw ApiError.badRequest(
        `Payment of ${money(amount)} cannot exceed the outstanding balance of ${money(balance)}`
      );
    }

    await connection.query(
      `INSERT INTO payments
         (purchase_id, supplier_id, amount, payment_method, payment_type, payment_date, notes, received_by)
       VALUES (?, ?, ?, ?, 'purchase_payment', ?, ?, ?)`,
      [purchaseId, purchase.supplier_id, amount, method, paymentDate, notes || null, receivedBy]
    );

    const newPaid = toMoney(sumPaid + amount);
    const paymentStatus = newPaid >= totalAmount ? 'paid' : 'partial';

    await connection.query(
      `UPDATE purchases
       SET paid_amount = ?, payment_status = ?
       WHERE id = ?`,
      [newPaid, paymentStatus, purchaseId]
    );

    await connection.commit();

    return findById(purchaseId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Record/confirm the ACTUAL supplier purchase amount after goods are
 * received. A PO/receipt is created with total 0 (order quantities
 * only); the real price comes from the supplier's bill once the goods
 * arrive.
 *
 * Rules:
 *   - only a completed purchase can be priced
 *   - the actual amount is frozen once any payment exists (changing it
 *     afterwards would desync paid_amount from total_amount)
 *   - every purchase line must be given an actual unit price
 *   - line_total is a stored generated column, so setting unit_cost
 *     updates quantity * unit_cost; total_amount is the sum of lines.
 *
 * The purchase row is locked FOR UPDATE so pricing serializes with
 * concurrent payments/receives.
 */
async function setActualAmount({ purchaseId, items, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, status, total_amount, paid_amount
       FROM purchases
       WHERE id = ?
       FOR UPDATE`,
      [purchaseId]
    );
    const purchase = rows[0];

    if (!purchase) {
      throw ApiError.notFound(`Purchase ${purchaseId} not found`);
    }

    if (purchase.status !== 'completed') {
      throw ApiError.badRequest(
        'The actual amount can only be recorded against a completed purchase'
      );
    }

    if (toMoney(purchase.total_amount) > 0) {
      throw ApiError.badRequest(
        'The actual amount has already been recorded for this purchase'
      );
    }

    if (toMoney(purchase.paid_amount) > 0) {
      throw ApiError.badRequest(
        'The actual amount cannot be changed after a supplier payment has been recorded'
      );
    }

    const [purchaseItems] = await connection.query(
      `SELECT id, product_id, quantity
       FROM purchase_items
       WHERE purchase_id = ?
       FOR UPDATE`,
      [purchaseId]
    );

    if (purchaseItems.length === 0) {
      throw ApiError.badRequest('Purchase has no items to price');
    }

    const priceByProduct = new Map();
    for (const item of items) {
      const productId = Number(item.productId);
      const unitPrice = Number(item.unitPrice);

      if (!Number.isInteger(productId) || productId < 1) {
        throw ApiError.badRequest('each item productId must be a positive integer');
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw ApiError.badRequest('each item unitPrice must be a non-negative number');
      }
      if (priceByProduct.has(productId)) {
        throw ApiError.badRequest(`duplicate product ${productId} in actual amount`);
      }
      priceByProduct.set(productId, toMoney(unitPrice));
    }

    const knownProducts = new Set(purchaseItems.map((row) => Number(row.product_id)));

    for (const productId of priceByProduct.keys()) {
      if (!knownProducts.has(productId)) {
        throw ApiError.badRequest(`Product ${productId} does not belong to this purchase`);
      }
    }

    let total = 0;

    for (const row of purchaseItems) {
      const productId = Number(row.product_id);

      if (!priceByProduct.has(productId)) {
        throw ApiError.badRequest(
          `Missing actual unit price for every received product (product ${productId})`
        );
      }

      const unitPrice = priceByProduct.get(productId);
      const lineTotal = toMoney(Number(row.quantity) * unitPrice);
      total = toMoney(total + lineTotal);

      await connection.query(
        `UPDATE purchase_items SET unit_cost = ? WHERE id = ?`,
        [unitPrice, row.id]
      );
    }

    await connection.query(
      `UPDATE purchases SET total_amount = ? WHERE id = ?`,
      [total, purchaseId]
    );

    await connection.commit();

    return findById(purchaseId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Atomic purchase creation: header + all items in ONE transaction.
 * A purchase is always created as `completed`, so this transaction also
 * increases stock for every item and writes the stock_transactions
 * ledger rows (exactly once - the ledger is the idempotency guard).
 * Any failure rolls everything back - a partial purchase or a partial
 * stock update can never be left behind.
 */
async function create({
  supplierId,
  invoiceNumber,
  purchaseDate,
  paymentType,
  notes,
  totalAmount,
  items,
  invoiceImage,
  createdBy,
}) {
  const connection = await pool.getConnection();
  let diskFilePath = null;

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO purchases
        (supplier_id, invoice_number, purchase_date, total_amount, paid_amount, payment_status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplierId,
        invoiceNumber,
        purchaseDate,
        totalAmount,
        paymentType === 'credit' ? 0 : totalAmount,
        paymentType === 'credit' ? 'unpaid' : 'paid',
        notes || null,
        createdBy,
      ]
    );

    const purchaseId = result.insertId;

    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost)
         VALUES (?, ?, ?, ?)`,
        [purchaseId, item.productId, item.quantity, item.purchasePrice]
      );
    }

    if (paymentType !== 'credit') {
      await connection.query(
        `INSERT INTO payments
          (purchase_id, supplier_id, amount, payment_method, payment_type, received_by)
         VALUES (?, ?, ?, ?, 'purchase_payment', ?)`,
        [purchaseId, supplierId, totalAmount, paymentType, createdBy]
      );
    }

    await stockRepository.syncPurchaseStock({
      conn: connection,
      purchaseId,
      items,
      targetStatus: 'completed',
      createdBy,
    });

    if (invoiceImage && invoiceImage.buffer) {
      const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(invoiceImage.ext)
        ? invoiceImage.ext
        : 'jpg';
      const filename = `purchase-${purchaseId}-${crypto.randomBytes(8).toString('hex')}.${safeExt}`;
      diskFilePath = path.join(purchaseInvoicesUploadsRoot, filename);
      const invoiceImagePath = `${purchaseInvoicesUrlBase}/${filename}`;

      await fs.promises.mkdir(purchaseInvoicesUploadsRoot, { recursive: true });
      await fs.promises.writeFile(diskFilePath, invoiceImage.buffer);

      await connection.query(
        `UPDATE purchases SET invoice_image_path = ? WHERE id = ?`,
        [invoiceImagePath, purchaseId]
      );
    }

    await connection.commit();

    return findById(purchaseId);
  } catch (error) {
    await connection.rollback();
    if (diskFilePath) {
      try {
        await fs.promises.unlink(diskFilePath);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          console.error('Failed to cleanup invoice image file after rollback:', unlinkErr);
        }
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Status change with idempotent stock reconciliation:
 *   completed -> cancelled: reverse the purchase's stock effect once
 *   cancelled -> completed: re-apply the purchase's stock effect once
 *   same-status request: no stock movement
 *
 * The purchase row is locked (FOR UPDATE) so concurrent status changes
 * serialize, and the ledger check inside the same transaction makes
 * repeated identical requests a no-op. If the current stock cannot
 * absorb the reversal (e.g. goods already used), the whole transaction
 * rolls back and the purchase keeps its previous status.
 */
async function setStatus(id, status, { items, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT status FROM purchases WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (!row) {
      await connection.rollback();
      connection.release();
      return null;
    }

    if (row.status !== status) {
      await stockRepository.syncPurchaseStock({
        conn: connection,
        purchaseId: id,
        items,
        targetStatus: status,
        createdBy,
      });

      await connection.query(
        `UPDATE purchases SET status = ? WHERE id = ?`,
        [status, id]
      );
    }

    await connection.commit();
    connection.release();

    return findById(id);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

/**
 * Unified Purchase History: normal supplier purchases AND opening stock
 * records, one paginated list with a `source_type` discriminator.
 *
 * Opening stock deliberately lives in its own table (`opening_stock`),
 * so it is UNIONed in here read-only; it is never materialized as a
 * `purchases` row, never affects purchase totals, and never creates a
 * supplier payment. The union exposes a common shape:
 *
 *   reference_no | po_number | product_name | supplier_name | transaction_date
 *   total_amount | paid_amount (NULL for opening stock)
 *   payment_status (NULL) / record_status ('opening_stock')
 *   notes | created_by_name | created_at
 *
 * Filters: search (supplier/reference/PO/product), type (purchase or
 * opening_stock), status (matches purchase status only), date range.
 */
const HISTORY_PURCHASE_SELECT = `
  SELECT
    'purchase' AS source_type,
    pu.id,
    pu.invoice_number AS reference_no,
    po.po_number,
    NULL AS product_name,
    NULL AS product_code,
    NULL AS unit,
    pu.supplier_id,
    s.name AS supplier_name,
    pu.purchase_date AS transaction_date,
    pu.total_amount,
    pu.paid_amount,
    pu.payment_status,
    pu.status AS record_status,
    pu.notes,
    u.username AS created_by_name,
    pu.created_at
  FROM purchases pu
  JOIN suppliers s ON s.id = pu.supplier_id
  LEFT JOIN purchase_orders po ON po.id = pu.purchase_order_id
  LEFT JOIN users u ON u.id = pu.created_by
`;

async function findHistory({
  search,
  type,
  status,
  fromDate,
  toDate,
  limit,
  offset,
}) {
  const inner = `(${HISTORY_PURCHASE_SELECT}) unified`;
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      unified.supplier_name LIKE ?
      OR unified.reference_no LIKE ?
      OR unified.po_number LIKE ?
      OR unified.product_name LIKE ?
    )`);
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  if (type) {
    where.push('unified.source_type = ?');
    params.push(type);
  }

  if (status) {
    where.push('unified.record_status = ?');
    params.push(status);
  }

  if (fromDate) {
    where.push('unified.transaction_date >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('unified.transaction_date <= ?');
    params.push(toDate);
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM ${inner}
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT *
     FROM ${inner}
     ${whereSql}
     ORDER BY unified.transaction_date DESC, unified.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

module.exports = {
  findAll,
  findById,
  findByInvoiceNumber,
  findPayments,
  recordPayment,
  setActualAmount,
  create,
  setStatus,
  findHistory,
};