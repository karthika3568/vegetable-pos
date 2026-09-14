/**
 * Application-level error carrying an HTTP status code.
 *
 * Controllers/services throw ApiError (or call next(ApiError.xxx(...)))
 * for anything that should produce a specific, predictable HTTP
 * response. `isOperational` distinguishes expected failures (bad
 * input, not found, conflict) from unexpected bugs - the error
 * handler uses it to decide how much detail is safe to log/return.
 */

class ApiError extends Error {
  constructor(statusCode, message, details = null, isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details; // e.g. array of field validation errors
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static notImplemented(message = 'Not implemented yet') {
    return new ApiError(501, message, null, false);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, null, false);
  }
}

module.exports = ApiError;
