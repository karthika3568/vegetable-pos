/**
 * Authorization middleware: grants access when the user holds AT LEAST
 * ONE of the given permissions (opposite of `authorize`, which needs
 * all of them).
 *
 * Must run AFTER `authenticate`.
 *
 * Usage:
 *   router.get('/active', authenticate, authorizeAny('settings.manage', 'products.manage'), ctrl)
 */

const ApiError = require('../utils/ApiError');

function authorizeAny(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const hasAny = requiredPermissions.some((perm) => userPermissions.includes(perm));

    if (!hasAny) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }

    next();
  };
}

module.exports = authorizeAny;