const { pool, withTransaction } = require('../config/db');

async function findAll() {
  const [rows] = await pool.query(
    `SELECT id, code, module, description FROM permissions ORDER BY module ASC, code ASC`
  );
  return rows;
}

/** Permission codes currently granted to a user (is_granted = 1 only). */
async function getGrantedCodesForUser(userId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.code FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = ? AND up.is_granted = 1`,
    [userId]
  );
  return rows.map((r) => r.code);
}

/**
 * Replaces a user's entire granted-permission set with exactly the
 * given list of permission codes. Runs in one transaction so a
 * partial failure can never leave a user with a half-updated set of
 * permissions - the required "authorization must be enforced
 * correctly" property depends on this being atomic.
 */
async function replaceUserPermissions(userId, permissionCodes, grantedByUserId) {
  return withTransaction(async (conn) => {
    await conn.query(`DELETE FROM user_permissions WHERE user_id = ?`, [userId]);

    if (permissionCodes.length === 0) return [];

    const [permissionRows] = await conn.query(
      `SELECT id, code FROM permissions WHERE code IN (?)`,
      [permissionCodes]
    );

    const foundCodes = permissionRows.map((r) => r.code);
    const unknown = permissionCodes.filter((c) => !foundCodes.includes(c));
    if (unknown.length > 0) {
      const err = new Error(`Unknown permission code(s): ${unknown.join(', ')}`);
      err.code = 'UNKNOWN_PERMISSION_CODE';
      throw err;
    }

    const values = permissionRows.map((p) => [userId, p.id, 1, grantedByUserId]);
    await conn.query(
      `INSERT INTO user_permissions (user_id, permission_id, is_granted, granted_by) VALUES ?`,
      [values]
    );
    return foundCodes;
  });
}

module.exports = { findAll, getGrantedCodesForUser, replaceUserPermissions };
