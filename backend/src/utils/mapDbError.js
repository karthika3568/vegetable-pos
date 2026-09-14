/**
 * Translates a raw mysql2 error into a safe ApiError.
 *
 * Never let a raw DB error reach the client - it can contain table
 * names, column names, or full SQL. This maps the handful of MySQL
 * error codes the app should react to differently, and treats
 * everything else as an opaque internal error.
 *
 * Returns null if `err` doesn't look like a MySQL error, so callers
 * can fall through to generic handling.
 */

const ApiError = require('./ApiError');

function mapDbError(err) {
  if (!err || !err.code || typeof err.code !== 'string') return null;

  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return ApiError.conflict('A record with this value already exists');

    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return ApiError.badRequest('Referenced record does not exist');

    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return ApiError.conflict('This record cannot be modified because other records depend on it');

    case 'ER_BAD_NULL_ERROR':
      return ApiError.badRequest('A required field is missing');

    case 'ER_DATA_TOO_LONG':
      return ApiError.badRequest('One of the provided values is too long');

    case 'WARN_DATA_TRUNCATED':
    case 'ER_TRUNCATED_WRONG_VALUE':
      return ApiError.badRequest('One of the provided values is not valid for its field');

    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return ApiError.badRequest('One of the provided values violates a business rule');

    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ER_CON_COUNT_ERROR':
      // Infrastructure-level failure - not the client's fault, don't say why.
      return ApiError.internal('Service temporarily unavailable');

    default:
      // Unrecognized DB error: still don't leak err.sqlMessage to the client.
      return ApiError.internal('Internal server error');
  }
}

module.exports = mapDbError;
