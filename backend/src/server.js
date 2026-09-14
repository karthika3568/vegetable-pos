/**
 * Server entry point. Responsibilities that don't belong in app.js:
 *   - verify the database is reachable before accepting traffic
 *   - bind the HTTP port
 *   - handle graceful shutdown and uncaught errors
 */

const app = require('./app');
const { pool } = require('./config/db');
const { port } = require('./config/env');
const logger = require('./config/logger');

async function verifyDatabaseConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

async function start() {
  try {
    await verifyDatabaseConnection();
    logger.info('Database connection verified');
  } catch (err) {
    logger.error('Failed to connect to the database on startup', { error: err.message });
    process.exit(1);
  }

  const server = app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: reason?.message || String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception - shutting down', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

start();
