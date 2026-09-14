const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /health
 * Infra-level health check. Always returns JSON (never throws through
 * the error handler) so load balancers / uptime checks get a clean
 * 200 or 503 with a machine-readable body either way.
 */
const check = asyncHandler(async (req, res) => {
  const startedAt = process.hrtime.bigint();
  let dbConnected = false;
  let dbResponseTimeMs = null;

  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
      dbConnected = true;
    } finally {
      connection.release();
    }
  } catch {
    dbConnected = false;
  }
  dbResponseTimeMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10;

  const healthy = dbConnected;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'Service is healthy' : 'Service is degraded',
    data: {
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      db: { connected: dbConnected, responseTimeMs: dbResponseTimeMs },
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = { check };
