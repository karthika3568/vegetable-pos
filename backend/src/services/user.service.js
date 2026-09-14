/**
 * User (employee) service - admin-only management of employee
 * accounts, roles, and permissions. Every mutating action here is
 * audit-logged, since these are exactly the actions the business
 * requirement calls out as needing to be traceable (who disabled
 * whom, who changed permissions, who force-logged-out whom).
 */

const userRepository = require('../repositories/user.repository');
const permissionRepository = require('../repositories/permission.repository');
const roleRepository = require('../repositories/role.repository');
const auditRepository = require('../repositories/audit.repository');
const password = require('../utils/password');
const ApiError = require('../utils/ApiError');

async function list({ status, roleId, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const { rows, total } = await userRepository.findAll({ status, roleId, limit, offset });
  return { items: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getById(id) {
  const user = await userRepository.findById(id);
  if (!user) throw ApiError.notFound(`User ${id} not found`);
  const permissions = user.role_name === 'admin'
    ? (await permissionRepository.findAll()).map((p) => p.code)
    : await permissionRepository.getGrantedCodesForUser(id);
  return { ...user, permissions };
}

async function create({ username, password: plainPassword, fullName, email, phone, roleId, permissions }) {
  const role = await roleRepository.findById(roleId);
  if (!role) throw ApiError.badRequest(`roleId ${roleId} does not correspond to an existing role`);

  const requestedPermissions = Array.isArray(permissions) ? permissions : [];
  if (requestedPermissions.length > 0 && role.name !== 'admin') {
    // Validate BEFORE creating the user row, so an unknown permission
    // code fails the whole request instead of leaving behind an
    // employee account with no permissions assigned.
    const allCodes = (await permissionRepository.findAll()).map((p) => p.code);
    const unknown = requestedPermissions.filter((c) => !allCodes.includes(c));
    if (unknown.length > 0) {
      throw ApiError.badRequest(`Unknown permission code(s): ${unknown.join(', ')}`);
    }
  }

  const passwordHash = await password.hash(plainPassword);
  const user = await userRepository.create({ username, passwordHash, fullName, email, phone, roleId });

  if (requestedPermissions.length > 0 && role.name !== 'admin') {
    await permissionRepository.replaceUserPermissions(user.id, requestedPermissions, null);
  }

  return getById(user.id);
}

async function update(id, { fullName, email, phone, roleId }) {
  await getById(id);
  if (roleId !== undefined) {
    const role = await roleRepository.findById(roleId);
    if (!role) throw ApiError.badRequest(`roleId ${roleId} does not correspond to an existing role`);
  }
  return userRepository.update(id, { fullName, email, phone, roleId });
}

/**
 * Enable/disable an employee. Disabling both:
 *   1. Sets status='inactive' (checked on every future login attempt), AND
 *   2. Bumps token_version (checked on every future authenticated
 *      request), so an already-issued token stops working immediately
 *      rather than staying valid until it expires.
 */
async function setStatus(id, status, actingUser, ipAddress) {
  const target = await getById(id);

  if (target.id === actingUser.id && status !== 'active') {
    throw ApiError.badRequest('You cannot disable your own account');
  }

  const updated = await userRepository.setStatus(id, status);
  if (status !== 'active') {
    await userRepository.bumpTokenVersion(id);
  }

  await auditRepository.record({
    userId: actingUser.id,
    action: 'USER_STATUS_CHANGED',
    entityType: 'users',
    entityId: id,
    oldValues: { status: target.status },
    newValues: { status },
    ipAddress,
  });

  return updated;
}

async function setPermissions(id, permissionCodes, actingUser, ipAddress) {
  const target = await getById(id);
  if (target.role_name === 'admin') {
    throw ApiError.badRequest('Admin has unrestricted access and does not use granular permissions');
  }

  try {
    await permissionRepository.replaceUserPermissions(id, permissionCodes, actingUser.id);
  } catch (err) {
    if (err.code === 'UNKNOWN_PERMISSION_CODE') throw ApiError.badRequest(err.message);
    throw err;
  }

  await auditRepository.record({
    userId: actingUser.id,
    action: 'USER_PERMISSIONS_CHANGED',
    entityType: 'users',
    entityId: id,
    oldValues: { permissions: target.permissions },
    newValues: { permissions: permissionCodes },
    ipAddress,
  });

  return getById(id);
}

/** Admin-initiated remote logout: invalidates every token the target user currently holds. */
async function forceLogout(id, actingUser, ipAddress) {
  await getById(id); // 404 if the target doesn't exist
  await userRepository.bumpTokenVersion(id);
  await auditRepository.record({
    userId: actingUser.id,
    action: 'REMOTE_LOGOUT',
    entityType: 'users',
    entityId: id,
    ipAddress,
  });
}

module.exports = { list, getById, create, update, setStatus, setPermissions, forceLogout };
