const { pool } = require('../config/db');

const SAFE_COLUMNS = `
  u.id, u.role_id, u.username, u.email, u.full_name, u.phone, u.address,
  u.status, u.last_login_at, u.created_at, u.updated_at,
  r.name AS role_name
`;

/** Full auth-relevant record, including password_hash and token_version. NEVER return this from an API response directly. */
async function findAuthRecordByUsername(username) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.password_hash, u.status, u.token_version, u.role_id, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.username = ?`,
    [username]
  );
  return rows[0] || null;
}

/** Same as above, looked up by id - used by authenticate middleware on every request. */
async function findAuthRecordById(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.status, u.token_version, u.role_id, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/** Sanitized profile (no password_hash) for API responses. */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findByPhone(phone, excludeId = null) {
  const [rows] = await pool.query(
    `SELECT id, phone FROM users WHERE phone = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
    [phone, excludeId, excludeId]
  );
  return rows[0] || null;
}

async function findAll({ status, roleId, limit, offset }) {
  const where = [];
  const params = [];
  if (status) {
    where.push('u.status = ?');
    params.push(status);
  }
  if (roleId) {
    where.push('u.role_id = ?');
    params.push(roleId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id
     ${whereSql} ORDER BY u.full_name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`, params
  );
  return { rows, total };
}

async function create({ username, passwordHash, fullName, email, phone, address, roleId }) {
  const [result] = await pool.query(
    `INSERT INTO users (role_id, username, email, password_hash, full_name, phone, address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [roleId, username, email || null, passwordHash, fullName, phone || null, address || null]
  );
  return findById(result.insertId);
}

async function update(id, { fullName, email, phone, address, roleId }) {
  const fields = [];
  const params = [];
  if (fullName !== undefined) { fields.push('full_name = ?'); params.push(fullName); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email); }
  if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
  if (address !== undefined) { fields.push('address = ?'); params.push(address); }
  if (roleId !== undefined) { fields.push('role_id = ?'); params.push(roleId); }
  if (fields.length === 0) return findById(id);

  params.push(id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function setStatus(id, status) {
  await pool.query(`UPDATE users SET status = ? WHERE id = ?`, [status, id]);
  return findById(id);
}

/** Invalidates every existing JWT for this user (logout, remote logout, or disable). */
async function bumpTokenVersion(id) {
  await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [id]);
}

async function updateLastLogin(id) {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [id]);
}

module.exports = {
  findAuthRecordByUsername, findAuthRecordById, findById, findByPhone, findAll,
  create, update, setStatus, bumpTokenVersion, updateLastLogin,
};
