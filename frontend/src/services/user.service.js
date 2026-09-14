import { api } from '../api/client.js';

function mapUser(raw) {
  return {
    ...raw,
    id: Number(raw.id),
    roleId: raw.role_id != null ? Number(raw.role_id) : null,
    roleName: raw.role_name ?? '',
    fullName: raw.full_name ?? '',
    lastLoginAt: raw.last_login_at ?? null,
    createdAt: raw.created_at ?? null,
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
  };
}

export const userService = {
  async list(params) {
    const payload = await api.get('/users', { params });
    return {
      items: (payload?.data ?? []).map(mapUser),
      pagination: payload?.meta ?? null,
    };
  },

  async get(id) {
    const payload = await api.get(`/users/${id}`);
    return payload?.data ? mapUser(payload.data) : null;
  },

  async create(input) {
    const payload = await api.post('/users', input);
    return payload?.data ? mapUser(payload.data) : null;
  },

  async update(id, input) {
    const payload = await api.put(`/users/${id}`, input);
    return payload?.data ? mapUser(payload.data) : null;
  },

  async setStatus(id, status) {
    const payload = await api.patch(`/users/${id}/status`, { status });
    return payload?.data ? mapUser(payload.data) : null;
  },

  async setPermissions(id, permissions) {
    const payload = await api.put(`/users/${id}/permissions`, { permissions });
    return payload?.data ? mapUser(payload.data) : null;
  },

  async forceLogout(id) {
    await api.post(`/users/${id}/logout`, {});
  },

  async roles() {
    const payload = await api.get('/roles');
    return payload?.data ?? [];
  },

  async permissions() {
    const payload = await api.get('/permissions');
    return payload?.data ?? [];
  },
};
