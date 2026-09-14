/**
 * Authentication middleware.
 *
 * Every authenticated request:
 *  1. Verifies the Bearer JWT (signature + expiry).
 *  2. Re-reads the user row from MySQL (never trusts the token contents
 *     beyond { id }): the user must still exist and be active, and the
 *     token's tokenVersion must match users.token_version so a logout,
 *     force-logout, or disable invalidates tokens immediately.
 *  3. Loads role + granted permissions FRESH from the database.
 *  4. Attaches that fresh data to req.user.
 *
 * Permissions are deliberately NOT trusted from the JWT. The token only
 * carries { id, tokenVersion } (see utils/jwt.js); role and permissions
 * are resolved here on every request so a permission/role change or a
 * disable takes effect on the very next request.
 */

const jwt = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/user.repository');
const permissionRepository = require('../repositories/permission.repository');

function getBearerToken(header) {
  const [scheme, token, ...rest] = String(header || '').split(' ');
  if (scheme !== 'Bearer' || !token || rest.length > 0) return null;
  return token;
}

function buildUser(record) {
  const isAdmin = record.role_name === 'admin';
  return {
    id: record.id,
    username: record.username,
    fullName: record.full_name,
    roleId: record.role_id,
    roleName: record.role_name,
    isAdmin,
    status: record.status,
    tokenVersion: record.token_version,
  };
}

async function loadPermissions(roleName, userId) {
  if (roleName === 'admin') {
    const permissions = await permissionRepository.findAll();
    return permissions.map((p) => p.code);
  }
  return permissionRepository.getGrantedCodesForUser(userId);
}

function authenticate(req, res, next) {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return next(ApiError.unauthorized('Authentication token missing'));
  }

  jwt.verify(token)
    .then(async (decoded) => {
      if (!decoded || !decoded.id) {
        throw ApiError.unauthorized('Invalid authentication token');
      }

      const record = await userRepository.findAuthRecordById(decoded.id);
      if (!record) {
        throw ApiError.unauthorized('Invalid authentication token');
      }

      if (record.status !== 'active') {
        throw ApiError.forbidden('This account is not active. Contact an administrator.');
      }

      if (decoded.tokenVersion !== record.token_version) {
        throw ApiError.unauthorized('Session has ended. Please log in again.');
      }

      const permissions = await loadPermissions(record.role_name, record.id);

      req.user = { ...buildUser(record), permissions };
      next();
    })
    .catch((err) => {
      if (err instanceof ApiError) return next(err);

      const message = err.name === 'TokenExpiredError'
        ? 'Authentication token has expired'
        : 'Invalid authentication token';
      return next(ApiError.unauthorized(message));
    });
}

module.exports = authenticate;