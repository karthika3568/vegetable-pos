/**
 * Minimal structured logger - no external dependency.
 *
 * Emits one JSON object per line: { timestamp, level, message, ...meta }.
 * That's enough to be grep/jq-able in production logs while staying
 * dependency-free. Swap this for a full logging library later without
 * touching any call site, since everything goes through log(level, ...).
 */

const { isProduction } = require('./env');

function log(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => {
    if (!isProduction) log('debug', message, meta);
  },
};
