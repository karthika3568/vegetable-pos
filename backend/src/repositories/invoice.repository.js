/**
 * Invoice repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly.
 *
 * An invoice is the read-only representation of an EXISTING completed
 * sale. There is no invoice table (sales already stores invoice_number,
 * subtotal, discount_amount, tax_amount, total_amount, paid_amount and
 * the generated balance_due; sale_items stores the frozen unit_price /
 * discount_amount / line_total). This repository only READS database
 * values - it never writes, never recomputes from current product
 * prices or current tax settings, and never touches stock, payments,
 * credit or customer balance.
 *
 * Permission: every endpoint that uses this repository is protected by
 * the existing `sales.view` permission - viewing a sale's invoice is
 * viewing sales history. No new permission is invented.
 */

const { pool } = require('../config/db');

const BASE_SELECT = `
  SELECT
    s.id,
    s.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.state AS customer_state,
    s.invoice_number,
    s.sale_date,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.total_amount,
    s.paid_amount,
    s.balance_due,
    s.payment_type,
    s.status,
    s.created_by,
    u.username AS created_by_name,
    s.created_at,
    s.updated_at
  FROM sales s
  LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN users u ON u.id = s.created_by
`;

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE s.id = ?`,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const [items] = await pool.query(
    `SELECT
       si.id,
       si.product_id,
       p.sku AS product_code,
       p.name AS product_name,
       p.unit,
       si.quantity,
       si.unit_price,
       si.discount_amount,
       si.line_total
     FROM sale_items si
     JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ?
     ORDER BY si.id ASC`,
    [id]
  );

  const [payments] = await pool.query(
    `SELECT
       pt.id,
       pt.sale_id,
       pt.amount,
       pt.payment_method,
       pt.payment_type,
       pt.payment_date,
       pt.notes,
       pt.received_by,
       u.username AS received_by_name
     FROM payments pt
     LEFT JOIN users u ON u.id = pt.received_by
     WHERE pt.sale_id = ?
     ORDER BY pt.id ASC`,
    [id]
  );

  const [creditRows] = await pool.query(
    `SELECT id, transaction_type, amount, sale_id, balance_before,
            balance_after, notes, created_by, created_at
     FROM credit_transactions
     WHERE sale_id = ? AND transaction_type = 'created'`,
    [id]
  );

  const [reversalRows] = await pool.query(
    `SELECT id, transaction_type, amount, sale_id, balance_before,
            balance_after, notes, created_by, created_at
     FROM credit_transactions
     WHERE sale_id = ? AND transaction_type = 'credit_reversal'
     ORDER BY id ASC`,
    [id]
  );

  const [returns] = await pool.query(
    `SELECT
       sr.id,
       sr.return_date,
       sr.reason,
       sr.refund_amount,
       sr.created_by,
       u.username AS created_by_name
     FROM sale_returns sr
     LEFT JOIN users u ON u.id = sr.created_by
     WHERE sr.sale_id = ?
     ORDER BY sr.id ASC`,
    [id]
  );

  const [returnItems] = await pool.query(
    `SELECT
       sri.id,
       sri.return_id,
       sri.sale_item_id,
       sri.product_id,
       p.sku AS product_code,
       p.name AS product_name,
       p.unit,
       sri.quantity,
       sri.unit_price,
       sri.discount_amount,
       sri.line_total
     FROM sale_return_items sri
     JOIN products p ON p.id = sri.product_id
     JOIN sale_returns sr ON sr.id = sri.return_id
     WHERE sr.sale_id = ?
     ORDER BY sri.id ASC`,
    [id]
  );
  const returnItemsByReturn = new Map();
  for (const item of returnItems) {
    const key = Number(item.return_id);
    if (!returnItemsByReturn.has(key)) returnItemsByReturn.set(key, []);
    returnItemsByReturn.get(key).push(item);
  }
  for (const ret of returns) {
    ret.items = returnItemsByReturn.get(Number(ret.id)) || [];
  }

  return {
    ...rows[0],
    items,
    payments,
    credit: creditRows[0] || null,
    creditReversal: reversalRows,
    returns,
  };
}

async function findByInvoiceNumber(invoiceNumber) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE s.invoice_number = ?`,
    [invoiceNumber]
  );

  if (!rows[0]) {
    return null;
  }

  return findById(rows[0].id);
}

async function findAll({ search, fromDate, toDate, status, limit, offset }) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      s.invoice_number LIKE ?
      OR c.name LIKE ?
      OR c.phone LIKE ?
    )`);
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (fromDate) {
    where.push('s.sale_date >= ?');
    params.push(`${fromDate} 00:00:00`);
  }

  if (toDate) {
    where.push('s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(toDate);
  }

  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY s.sale_date DESC, s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

module.exports = {
  findById,
  findByInvoiceNumber,
  findAll,
};