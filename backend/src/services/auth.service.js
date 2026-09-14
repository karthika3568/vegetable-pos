/**
 * Auth service - login, logout, "who am I".
 *
 * Deliberate design: the JWT only ever carries { id, tokenVersion }.
 * Role, permissions, and status are always read fresh from the
 * database (see authenticate middleware) so a permission change, a
 * role change, or a disable takes effect on the very next request -
 * never after the token happens to expire.
 */

const userRepository = require('../repositories/user.repository');
const permissionRepository = require('../repositories/permission.repository');
const auditRepository = require('../repositories/audit.repository');
const password = require('../utils/password');
const tokenUtil = require('../utils/jwt');
const ApiError = require('../utils/ApiError');

function toPublicProfile(authRecord, permissions) {
  return {
    id: authRecord.id,
    username: authRecord.username,
    fullName: authRecord.full_name,
    roleId: authRecord.role_id,
    roleName: authRecord.role_name,
    isAdmin: authRecord.role_name === 'admin',
    permissions,
  };
}

async function login({ username, password: plainPassword, ipAddress }) {
  const record = await userRepository.findAuthRecordByUsername(username);

  // Same generic message whether the username doesn't exist or the
  // password is wrong - don't help an attacker enumerate usernames.
  if (!record) {
    throw ApiError.unauthorized('Invalid username or password');
  }

  if (record.status !== 'active') {
    throw ApiError.forbidden('This account has been disabled. Contact an administrator.');
  }

  const passwordMatches = await password.compare(plainPassword, record.password_hash);
  if (!passwordMatches) {
    await auditRepository.record({
      userId: record.id, action: 'LOGIN_FAILED', entityType: 'users', entityId: record.id, ipAddress,
    });
    throw ApiError.unauthorized('Invalid username or password');
  }

  const token = tokenUtil.sign(record);
  await userRepository.updateLastLogin(record.id);
  await auditRepository.record({
    userId: record.id, action: 'LOGIN_SUCCESS', entityType: 'users', entityId: record.id, ipAddress,
  });

  const permissions = record.role_name === 'admin'
    ? (await permissionRepository.findAll()).map((p) => p.code)
    : await permissionRepository.getGrantedCodesForUser(record.id);

  return { token, user: toPublicProfile(record, permissions) };
}

/** Invalidates every existing token for this user (this is an "all devices" logout - see docs). */
async function logout(userId, ipAddress) {
  await userRepository.bumpTokenVersion(userId);
  await auditRepository.record({
    userId, action: 'LOGOUT', entityType: 'users', entityId: userId, ipAddress,
  });
}

async function getProfile(userId) {
  const record = await userRepository.findAuthRecordById(userId);
  if (!record) throw ApiError.notFound('User not found');

  const permissions = record.role_name === 'admin'
    ? (await permissionRepository.findAll()).map((p) => p.code)
    : await permissionRepository.getGrantedCodesForUser(userId);

  return toPublicProfile(record, permissions);
}

module.exports = { login, logout, getProfile };
