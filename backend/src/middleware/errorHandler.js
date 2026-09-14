/**
 * Centralized error-handling middleware. Must be registered LAST, after
 * every route and after notFound. Every error in the app - thrown,
 * passed to next(err), or rejected from an async handler wrapped with
 * asyncHandler - ends up here exactly once.
 *
 * Responsibilities:
 *   - Turn any error into the standard { success:false, message, details? } shape.
 *   - Never leak stack traces, SQL, or internal messages to the client in production.
 *   - Log every error server-side with enough context to debug it.
 */

const ApiError = require('../utils/ApiError');
const mapDbError = require('../utils/mapDbError');
const logger = require('../config/logger');
const { isProduction } = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiError = err;

  if (!(apiError instanceof ApiError)) {
    // Express body-parser JSON syntax errors look like this:
    if (err.type === 'entity.parse.failed') {
      apiError = ApiError.badRequest('Request body is not valid JSON');
    } else {
      apiError = mapDbError(err) || ApiError.internal('Internal server error');
    }
  }

  const statusCode = apiError.statusCode || 500;

  // Log every error. Non-operational (unexpected) errors get the full
  // original error logged server-side even though the client never sees it.
  const logMeta = {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    userId: req.user?.id || null,
  };
  if (apiError.isOperational) {
    logger.warn(apiError.message, logMeta);
  } else {
    logger.error(err.message, { ...logMeta, stack: err.stack, original: err.code || undefined });
  }

  const body = {
    success: false,
    message: apiError.isOperational ? apiError.message : 'Internal server error',
  };
  if (apiError.details) body.details = apiError.details;
  if (!isProduction && !apiError.isOperational) body.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
