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
          (purchase_id, amount, payment_method, payment_type, received_by)
         VALUES (?, ?, ?, 'purchase_payment', ?)`,
        [purchaseId, totalAmount, paymentType, createdBy]
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

module.exports = {
  findAll,
  findById,
  findByInvoiceNumber,
  create,
  setStatus,
};