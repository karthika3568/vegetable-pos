const { pool } = require('../config/db');

async function findAll() {
  const [rows] = await pool.query(
    `SELECT id, name, description, created_at, updated_at FROM roles ORDER BY id ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, description FROM roles WHERE id = ?`, [id]
  );
  return rows[0] || null;
}

module.exports = { findAll, findById };
