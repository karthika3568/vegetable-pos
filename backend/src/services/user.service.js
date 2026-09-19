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

/**
 * Role privilege ranking (admin > manager > cashier).
 *
 * Backend-authoritative anti-escalation: an actor holding users.manage
 * may only create/assign roles whose privilege is AT MOST their own.
 * A non-admin can therefore never grant (or self-grant) the admin role
 * or any role higher than their own - a frontend dropdown that hides
 * the admin option is never relied upon. Unknown role names rank below
 * every known role so a surprise role can never be assigned 'upwards'.
 */
const ROLE_PRIVILEGE = { admin: 3, manager: 2, cashier: 1 };

function rolePrivilege(roleName) {
  return ROLE_PRIVILEGE[roleName] ?? 0;
}

function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function ensurePhoneAvailable(phone, excludeId = null) {
  if (!phone) return;
  const existing = await userRepository.findByPhone(phone, excludeId);
  if (existing) throw ApiError.badRequest('phone is already assigned to another user');
}

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

async function create({ username, password: plainPassword, fullName, email, phone, address, roleId, permissions }, actor) {
  const normalizedPhone = normalizeOptionalText(phone);
  const normalizedAddress = normalizeOptionalText(address);
  await ensurePhoneAvailable(normalizedPhone);
  const role = await roleRepository.findById(roleId);
  if (!role) throw ApiError.badRequest(`roleId ${roleId} does not correspond to an existing role`);

  if (rolePrivilege(role.name) > rolePrivilege(actor?.roleName)) {
    throw ApiError.forbidden(
      `You cannot create a user with the '${role.name}' role (higher privilege than your own)`
    );
  }

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
  const user = await userRepository.create({ username, passwordHash, fullName, email, phone: normalizedPhone, address: normalizedAddress, roleId });

  if (requestedPermissions.length > 0 && role.name !== 'admin') {
    await permissionRepository.replaceUserPermissions(user.id, requestedPermissions, null);
  }

  return getById(user.id);
}

async function update(id, { fullName, email, phone, address, roleId }, actor) {
  const existing = await getById(id);
  const normalizedPhone = normalizeOptionalText(phone);
  const normalizedAddress = normalizeOptionalText(address);
  if (phone !== undefined && normalizedPhone !== existing.phone) await ensurePhoneAvailable(normalizedPhone, id);
  if (roleId !== undefined) {
    const role = await roleRepository.findById(roleId);
    if (!role) throw ApiError.badRequest(`roleId ${roleId} does not correspond to an existing role`);

    // A user must never be able to change their own role: an admin
    // could otherwise self-demote and lock the system out of admin,
    // while a lower-privilege actor could escalate themselves. Editing
    // your own profile with the role left unchanged (same role name)
    // stays allowed so profile updates keep working.
    if (id === actor?.id && role.name !== existing.role_name) {
      throw ApiError.forbidden('You cannot change your own role');
    }

    if (rolePrivilege(role.name) > rolePrivilege(actor?.roleName)) {
      throw ApiError.forbidden(
        `You cannot assign the '${role.name}' role (higher privilege than your own)`
      );
    }
  }
  return userRepository.update(id, { fullName, email, phone: normalizedPhone, address: normalizedAddress, roleId });
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
