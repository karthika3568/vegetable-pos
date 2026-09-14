import { api } from '../api/client.js';

function mapEntry(raw) {
  return {
    id: Number(raw.id),
    action: raw.action,
    entityType: raw.entityType,
    entityId: raw.entityId != null ? Number(raw.entityId) : null,
    userId: raw.userId != null ? Number(raw.userId) : null,
    userName: raw.userName || raw.user_name || null,
    ipAddress: raw.ipAddress || raw.ip_address || null,
    oldValues: raw.oldValues || raw.old_values || null,
    newValues: raw.newValues || raw.new_values || null,
    createdAt: raw.createdAt || raw.created_at,
  };
}

export const auditService = {
  async list({ search, userId, action, entityType, fromDate, toDate, page = 1, limit = 20 } = {}) {
    const payload = await api.get('/audit-logs', {
      params: {
        search: search || undefined,
        userId: userId || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit,
      },
    });
    return {
      items: (payload?.data ?? []).map(mapEntry),
      pagination: payload?.meta ?? null,
    };
  },

  async getById(id) {
    const payload = await api.get(`/audit-logs/${id}`);
    return payload?.data ? mapEntry(payload.data) : null;
  },
};