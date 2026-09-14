/**
 * Tax codes repository - raw SQL for the tax_codes master table.
 */

const { pool } = require('../config/db');

const BASE_COLUMNS = `
  id, code, name, cgst_rate, sgst_rate, igst_rate, is_active,
  created_at, updated_at
`;

async function findAll({ status, search, limit, offset }) {
  const where = [];
  const params = [];

  if (status) {
    where.push('is_active = ?');
    params.push(status === 'active' ? 1 : 0);
  }

  if (search) {
    where.push('(code LIKE ? OR name LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM tax_codes ${whereSql}
     ORDER BY code ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM tax_codes ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM tax_codes
     WHERE id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM tax_codes
     WHERE code = ?`,
    [code]
  );

  return rows[0] || null;
}

async function findActiveAll() {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM tax_codes
     WHERE is_active = 1
     ORDER BY code ASC`
  );

  return rows;
}

async function create({ code, name, cgstRate, sgstRate, igstRate }) {
  const [result] = await pool.query(
    `INSERT INTO tax_codes (code, name, cgst_rate, sgst_rate, igst_rate)
     VALUES (?, ?, ?, ?, ?)`,
    [code, name, cgstRate, sgstRate, igstRate]
  );

  return findById(result.insertId);
}

async function update(id, { code, name, cgstRate, sgstRate, igstRate }) {
  const fields = [];
  const params = [];

  if (code !== undefined) {
    fields.push('code = ?');
    params.push(code);
  }
  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }
  if (cgstRate !== undefined) {
    fields.push('cgst_rate = ?');
    params.push(cgstRate);
  }
  if (sgstRate !== undefined) {
    fields.push('sgst_rate = ?');
    params.push(sgstRate);
  }
  if (igstRate !== undefined) {
    fields.push('igst_rate = ?');
    params.push(igstRate);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  params.push(id);

  await pool.query(
    `UPDATE tax_codes SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findById(id);
}

async function setStatus(id, isActive) {
  await pool.query(
    `UPDATE tax_codes SET is_active = ? WHERE id = ?`,
    [isActive ? 1 : 0, id]
  );

  return findById(id);
}

module.exports = {
  findAll,
  findById,
  findByCode,
  findActiveAll,
  create,
  update,
  setStatus,
};
