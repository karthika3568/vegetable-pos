/**
 * Runs after an array of express-validator checks on a route. Collects
 * any validation failures into one consistent 400 ApiError instead of
 * each validator file having to format its own error response.
 *
 * Usage:
 *   router.post('/', categoryValidator.create, validate, controller.create)
 */

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(ApiError.badRequest('Validation failed', details));
}

module.exports = validate;
