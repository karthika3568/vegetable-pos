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

const BASE_COLUMNS = `
  id, name, contact_person, phone, email, address, status,
  created_at, updated_at
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

async function create({ name, contactPerson, phone, email, address }) {
  const [result] = await pool.query(
    `INSERT INTO suppliers (name, contact_person, phone, email, address)
     VALUES (?, ?, ?, ?, ?)`,
    [name, contactPerson || null, phone || null, email || null, address || null]
  );

  return findById(result.insertId);
}

async function update(id, { name, contactPerson, phone, email, address }) {
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

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  setStatus,
};