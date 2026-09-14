/**
 * Audit log repository - the only place that writes to audit_logs.
 * Insert-only, per the schema's design (see database/schema.sql).
 */

const { pool } = require('../config/db');

/**
 * @param {object} entry
 * @param {number|null} entry.userId - actor performing the action (null for system)
 * @param {string} entry.action - e.g. 'LOGIN_SUCCESS', 'LOGOUT', 'REMOTE_LOGOUT'
 * @param {string} entry.entityType - e.g. 'users'
 * @param {number|null} entry.entityId
 * @param {object|null} [entry.oldValues]
 * @param {object|null} [entry.newValues]
 * @param {string|null} [entry.ipAddress]
 * @param {import('mysql2/promise').Connection|null} [entry.conn] - optional
 *   connection to run inside an existing transaction (so the financial
 *   write and its audit row commit atomically). Falls back to the pool.
 */
async function record({ userId, action, entityType, entityId, oldValues = null, newValues = null, ipAddress = null, conn = null }) {
  const executor = conn || pool;
  await executor.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress,
    ]
  );
}

async function findAll({ userId, action, entityType, fromDate, toDate, limit, offset }) {
  const where = [];
  const params = [];

  if (userId) {
    where.push('a.user_id = ?');
    params.push(userId);
  }

  if (action) {
    where.push('a.action = ?');
    params.push(action);
  }

  if (entityType) {
    where.push('a.entity_type = ?');
    params.push(entityType);
  }

  if (fromDate) {
    where.push('a.created_at >= ?');
    params.push(`${fromDate} 00:00:00`);
  }

  if (toDate) {
    where.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(toDate);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs a
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.user_id,
       u.username AS user_name,
       a.action,
       a.entity_type,
       a.entity_id,
       a.old_values,
       a.new_values,
       a.ip_address,
       a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.user_id,
       u.username AS user_name,
       a.action,
       a.entity_type,
       a.entity_id,
       a.old_values,
       a.new_values,
       a.ip_address,
       a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
    [id]
  );

  return rows[0] || null;
}

module.exports = { record, findAll, findById };
