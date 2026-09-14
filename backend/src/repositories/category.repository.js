/**
 * Category repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly,
 * so the query layer can change without touching business logic.
 */

const { pool } = require('../config/db');

async function findAll({ status, search, limit, offset }) {
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  if (search) {
    where.push('(name LIKE ? OR description LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT id, name, description, status, created_at, updated_at
     FROM categories ${whereSql}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM categories ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, description, status, created_at, updated_at
     FROM categories
     WHERE id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query(
    `SELECT id, name, description, status, created_at, updated_at
     FROM categories
     WHERE name = ?`,
    [name]
  );

  return rows[0] || null;
}

async function create({ name, description }) {
  const [result] = await pool.query(
    `INSERT INTO categories (name, description) VALUES (?, ?)`,
    [name, description || null]
  );

  return findById(result.insertId);
}

async function update(id, { name, description }) {
  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }

  if (description !== undefined) {
    fields.push('description = ?');
    params.push(description);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  params.push(id);

  await pool.query(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findById(id);
}

async function setStatus(id, status) {
  await pool.query(
    `UPDATE categories SET status = ? WHERE id = ?`,
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