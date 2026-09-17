/**
 * Customer repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly.
 *
 * Uses the existing database/schema.sql customers table. Customers are
 * soft-disabled via status (never deleted) because sales.customer_id
 * is FK RESTRICT. `current_balance` is a read-only, credit-module-owned
 * value here: this module must NEVER write it.
 */

const { pool } = require('../config/db');

const BASE_COLUMNS = `
  id, name, phone, email, address, state, opening_balance, credit_limit, current_balance,
  status, created_at, updated_at
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
        OR phone LIKE ?
        OR email LIKE ?
        OR address LIKE ?
      )
    `);
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM customers ${whereSql}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM customers ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM customers
     WHERE id = ?`,
    [id]
  );

  return rows[0] || null;
}

/**
 * Looks up a customer by phone number. The schema has a UNIQUE
 * constraint on customers.phone (case-insensitive under the table
 * collation); NULL phones are allowed and excluded here.
 */
async function findByPhone(phone, excludeId = null) {
  let sql = `
    SELECT id, name, phone
    FROM customers
    WHERE phone = ?
  `;

  const params = [phone];

  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] || null;
}

async function create({ name, phone, email, address, state, creditLimit, openingBalance }) {
  const [result] = await pool.query(
    `INSERT INTO customers (name, phone, email, address, state, credit_limit, opening_balance, current_balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, phone || null, email || null, address || null, state || null, creditLimit ?? 0.0, openingBalance ?? 0.0, openingBalance ?? 0.0]
  );

  return findById(result.insertId);
}

async function update(id, { name, phone, email, address, state, creditLimit, openingBalance }) {
  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }

  if (phone !== undefined) {
    fields.push('phone = ?');
    params.push(phone || null);
  }

  if (email !== undefined) {
    fields.push('email = ?');
    params.push(email || null);
  }

  if (address !== undefined) {
    fields.push('address = ?');
    params.push(address || null);
  }

  if (state !== undefined) {
    fields.push('state = ?');
    params.push(state || null);
  }

  if (creditLimit !== undefined) {
    fields.push('credit_limit = ?');
    params.push(creditLimit);
  }

  if (openingBalance !== undefined) {
    fields.push('opening_balance = ?');
    params.push(openingBalance ?? 0);
    fields.push('current_balance = ?');
    params.push(openingBalance ?? 0);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  params.push(id);

  await pool.query(
    `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findById(id);
}

async function setStatus(id, status) {
  await pool.query(
    `UPDATE customers SET status = ? WHERE id = ?`,
    [status, id]
  );

  return findById(id);
}

module.exports = {
  findAll,
  findById,
  findByPhone,
  create,
  update,
  setStatus,
};