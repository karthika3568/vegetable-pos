/**
 * Supplier repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly,
 * so the query layer can change without touching business logic.
 *
 * Uses the existing database/schema.sql suppliers table. Suppliers are
 * disabled (never deleted) so historical purchases keep resolving -
 * the purchases.supplier_id FK is ON DELETE RESTRICT.
 */

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const BASE_COLUMNS = `
  suppliers.id,
  suppliers.name,
  suppliers.contact_person,
  suppliers.phone,
  suppliers.email,
  suppliers.address,
  suppliers.opening_balance,
  COALESCE((
    SELECT SUM(pu.total_amount)
    FROM purchases pu
    WHERE pu.supplier_id = suppliers.id AND pu.status = 'completed'
  ), 0) AS total_purchases,
  COALESCE((
    SELECT SUM(p.amount)
    FROM payments p
    LEFT JOIN purchases pu ON pu.id = p.purchase_id
    WHERE (p.supplier_id = suppliers.id OR (pu.supplier_id = suppliers.id AND pu.status = 'completed'))
      AND p.reversed_payment_id IS NULL
  ), 0) AS total_payments,
  COALESCE(suppliers.opening_balance, 0) +
  COALESCE((
    SELECT SUM(pu.total_amount)
    FROM purchases pu
    WHERE pu.supplier_id = suppliers.id AND pu.status = 'completed'
  ), 0) -
  COALESCE((
    SELECT SUM(p.amount)
    FROM payments p
    LEFT JOIN purchases pu ON pu.id = p.purchase_id
    WHERE (p.supplier_id = suppliers.id OR (pu.supplier_id = suppliers.id AND pu.status = 'completed'))
      AND p.reversed_payment_id IS NULL
  ), 0) AS current_payable_balance,
  suppliers.status,
  suppliers.created_at,
  suppliers.updated_at
`;

async function findAll({ status, search, limit, offset }) {
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  if (search) {
    where.push(`
      (
        name LIKE ?
        OR contact_person LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
        OR address LIKE ?
      )
    `);
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM suppliers ${whereSql}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM suppliers ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM suppliers
     WHERE id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM suppliers
     WHERE name = ?`,
    [name]
  );

  return rows[0] || null;
}

async function create({ name, contactPerson, phone, email, address, openingBalance }) {
  const [result] = await pool.query(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, opening_balance)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, contactPerson || null, phone || null, email || null, address || null, openingBalance ?? 0]
  );

  return findById(result.insertId);
}

async function update(id, { name, contactPerson, phone, email, address, openingBalance }) {
  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }

  if (contactPerson !== undefined) {
    fields.push('contact_person = ?');
    params.push(contactPerson);
  }

  if (phone !== undefined) {
    fields.push('phone = ?');
    params.push(phone);
  }

  if (email !== undefined) {
    fields.push('email = ?');
    params.push(email);
  }

  if (address !== undefined) {
    fields.push('address = ?');
    params.push(address);
  }

  if (openingBalance !== undefined) {
    fields.push('opening_balance = ?');
    params.push(openingBalance ?? 0);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  params.push(id);

  await pool.query(
    `UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findById(id);
}

async function setStatus(id, status) {
  await pool.query(
    `UPDATE suppliers SET status = ? WHERE id = ?`,
    [status, id]
  );

  return findById(id);
}

/**
 * Records a payment directly for a supplier (reducing their opening balance / payable balance).
 * Validates inside a transaction with FOR UPDATE lock against overpayment.
 */
async function recordPayment({ supplierId, amount, method, paymentDate, notes, receivedBy }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [suppliers] = await connection.query(
      `SELECT id, name, status, opening_balance FROM suppliers WHERE id = ? FOR UPDATE`,
      [supplierId]
    );

    if (suppliers.length === 0) {
      throw ApiError.notFound(`Supplier with ID ${supplierId} not found`);
    }

    const supplier = suppliers[0];
    if (supplier.status !== 'active') {
      throw ApiError.badRequest(`Supplier "${supplier.name}" is inactive and cannot receive payments`);
    }

    const [[balanceRow]] = await connection.query(`
      SELECT
        COALESCE(s.opening_balance, 0) +
        COALESCE((
          SELECT SUM(pu.total_amount)
          FROM purchases pu
          WHERE pu.supplier_id = s.id AND pu.status = 'completed'
        ), 0) -
        COALESCE((
          SELECT SUM(p.amount)
          FROM payments p
          LEFT JOIN purchases pu ON pu.id = p.purchase_id
          WHERE (p.supplier_id = s.id OR (pu.supplier_id = s.id AND pu.status = 'completed'))
            AND p.reversed_payment_id IS NULL
        ), 0) AS current_payable
      FROM suppliers s
      WHERE s.id = ?
    `, [supplierId]);

    const currentPayable = toMoney(balanceRow.current_payable);
    if (currentPayable <= 0) {
      throw ApiError.badRequest('This supplier has no outstanding payable balance');
    }

    if (amount > currentPayable) {
      throw ApiError.badRequest(
        `Payment of ${amount.toFixed(2)} cannot exceed current payable balance of ${currentPayable.toFixed(2)}`
      );
    }

    await connection.query(
      `INSERT INTO payments
         (sale_id, purchase_id, customer_id, supplier_id, amount, payment_method, payment_type, payment_date, notes, received_by)
       VALUES (NULL, NULL, NULL, ?, ?, ?, 'purchase_payment', ?, ?, ?)`,
      [supplierId, amount, method, paymentDate, notes || null, receivedBy]
    );

    await connection.commit();

    return findById(supplierId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Returns payment history for a supplier (both direct supplier payments and purchase payments).
 */
async function findPayments(supplierId) {
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.purchase_id,
       pu.invoice_number,
       p.amount,
       p.payment_method,
       p.payment_type,
       p.payment_date,
       p.notes,
       p.received_by,
       u.username AS received_by_name,
       p.created_at
     FROM payments p
     LEFT JOIN purchases pu ON pu.id = p.purchase_id
     LEFT JOIN users u ON u.id = p.received_by
     WHERE (p.supplier_id = ? OR (pu.supplier_id = ? AND pu.status = 'completed'))
       AND p.reversed_payment_id IS NULL
     ORDER BY p.payment_date DESC, p.id DESC`,
    [supplierId, supplierId]
  );

  return rows;
}

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  setStatus,
  recordPayment,
  findPayments,
};