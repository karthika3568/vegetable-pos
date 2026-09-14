const ApiError = require('../utils/ApiError');

/** Catches any request that didn't match a route and turns it into a 404 ApiError. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

module.exports = notFound;
