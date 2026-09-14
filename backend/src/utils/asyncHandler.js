/**
 * Wraps an async Express handler so a rejected promise (thrown error)
 * is forwarded to next(err) instead of crashing the process or hanging
 * the request. Use for every controller: asyncHandler(async (req,res) => {...})
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
