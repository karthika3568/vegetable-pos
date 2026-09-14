const ApiError = require('../utils/ApiError');

/**
 * Placeholder handler for routes whose business logic belongs to a
 * later phase. Keeps the full route table present now (so the API
 * surface and the React team's contract are visible from Phase 2
 * onward) without pretending unimplemented functionality works.
 * Returns 501, never 404, so it's clearly "known but not built yet"
 * rather than "doesn't exist".
 */
function notImplemented(req, res, next) {
  next(ApiError.notImplemented(`${req.method} ${req.baseUrl}${req.path} is not implemented yet`));
}

module.exports = { notImplemented };
