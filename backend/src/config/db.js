/**
 * Central MySQL connection pool.
 *
 * Every backend module (routes, services, scripts) must obtain its DB
 * access through this pool - never open ad-hoc connections elsewhere.
 * This keeps connection limits, error handling, and transaction usage
 * consistent across the whole application.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required database environment variables: ${missing.join(', ')}. ` +
    'Copy .env.example to .env and fill in your MySQL credentials.'
  );
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: process.env.DB_CONNECTION_LIMIT ? Number(process.env.DB_CONNECTION_LIMIT) : 10,
  queueLimit: 0,
  decimalNumbers: false, // keep DECIMAL columns as strings to avoid float rounding errors
  dateStrings: true,
});

/**
 * Run a set of operations inside a single database transaction.
 * `callback` receives a connection and must use it for every query;
 * on success the transaction is committed, on any thrown error it is
 * rolled back and the error re-thrown to the caller.
 *
 * This is the required pattern anywhere multiple related writes must
 * succeed together (e.g. sale + sale_items + stock + stock_transactions).
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { pool, withTransaction };
