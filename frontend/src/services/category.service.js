import { api } from '../api/client.js';

export const categoryService = {
  async list(params) {
    const payload = await api.get('/categories', { params });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async get(id) {
    const payload = await api.get(`/categories/${id}`);
    return payload?.data ?? null;
  },

  async create(input) {
    const payload = await api.post('/categories', input);
    return payload?.data ?? null;
  },

  async update(id, input) {
    const payload = await api.put(`/categories/${id}`, input);
    return payload?.data ?? null;
  },

  async setStatus(id, status) {
    const payload = await api.patch(`/categories/${id}/status`, { status });
    return payload?.data ?? null;
  },
};