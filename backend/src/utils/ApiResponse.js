/**
 * Consistent success-response envelope for every endpoint:
 *   { success: true, message, data, meta? }
 *
 * Paired with ApiError + errorHandler, every response the API sends -
 * success or failure - has the same predictable shape for the React
 * frontend to rely on.
 */

function send(res, { statusCode = 200, message = 'Success', data = null, meta = null }) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

module.exports = {
  ok: (res, data, message = 'Success') => send(res, { statusCode: 200, message, data }),
  created: (res, data, message = 'Created') => send(res, { statusCode: 201, message, data }),
  noContent: (res) => res.status(204).send(),
  paginated: (res, data, meta, message = 'Success') => send(res, { statusCode: 200, message, data, meta }),
  send,
};
