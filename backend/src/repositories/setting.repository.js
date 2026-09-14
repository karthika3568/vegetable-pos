/**
 * Setting repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly.
 *
 * Uses the existing database/schema.sql settings table:
 *   - setting_key is UNIQUE and identifies each setting (no create or
 *     delete here - settings are updated, not casually added/removed)
 *   - updated_by tracks the user who last changed the setting and is
 *     a nullable FK to users (SET NULL on delete)
 *   - updated_at is maintained by the DB (ON UPDATE CURRENT_TIMESTAMP)
 */

const { pool } = require('../config/db');

const BASE_COLUMNS = `
  id, setting_key, setting_value, description, updated_by, updated_at
`;

async function findAll() {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM settings
     ORDER BY setting_key ASC`
  );

  return rows;
}

async function findByKey(key) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     FROM settings
     WHERE setting_key = ?`,
    [key]
  );

  return rows[0] || null;
}

async function updateByKey(key, { value, description, updatedBy }) {
  const fields = ['setting_value = ?'];
  const params = [value];

  if (description !== undefined) {
    fields.push('description = ?');
    params.push(description);
  }

  fields.push('updated_by = ?');
  params.push(updatedBy);

  params.push(key);

  await pool.query(
    `UPDATE settings
     SET ${fields.join(', ')}
     WHERE setting_key = ?`,
    params
  );

  return findByKey(key);
}

module.exports = {
  findAll,
  findByKey,
  updateByKey,
};