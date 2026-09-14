/**
 * Audit service - business rules for reading the audit trail and a
 * thin convenience wrapper used by business services to write audit
 * rows (create/update/status/sale events).
 *
 * The audit table is insert-only by design: old/new values are stored as
 * JSON snapshots and there is deliberately no edit/delete API.
 */

const auditRepository = require('../repositories/audit.repository');

async function list({ userId, action, entityType, fromDate, toDate, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await auditRepository.findAll({
    userId,
    action,
    entityType,
    fromDate,
    toDate,
    limit,
    offset,
  });

  const items = rows.map((row) => ({
    id: Number(row.id),
    userId: row.user_id ? Number(row.user_id) : null,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ? Number(row.entity_id) : null,
    oldValues: row.old_values ? JSON.parse(row.old_values) : null,
    newValues: row.new_values ? JSON.parse(row.new_values) : null,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  const row = await auditRepository.findById(id);

  if (!row) {
    const ApiError = require('../utils/ApiError');
    throw ApiError.notFound(`Audit entry ${id} not found`);
  }

  return {
    id: Number(row.id),
    userId: row.user_id ? Number(row.user_id) : null,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ? Number(row.entity_id) : null,
    oldValues: row.old_values ? JSON.parse(row.old_values) : null,
    newValues: row.new_values ? JSON.parse(row.new_values) : null,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

/**
 * Log a business event to the audit trail. All write paths go through
 * here so action naming stays consistent module to module.
 */
async function log({ userId, action, entityType, entityId, oldValues = null, newValues = null, ipAddress = null, conn = null, req = null }) {
  const effectiveIp = ipAddress || (req ? (req.ip || null) : null);
  return auditRepository.record({
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress: effectiveIp,
    conn,
  });
}

module.exports = {
  list,
  getById,
  log,
};