import { api } from '../api/client.js';

export const settingService = {
  async list() {
    const payload = await api.get('/settings');
    return payload?.data ?? [];
  },

  async getByKey(key) {
    const payload = await api.get(`/settings/${encodeURIComponent(key)}`);
    return payload?.data ?? null;
  },

  async updateByKey(key, input) {
    const payload = await api.put(`/settings/${encodeURIComponent(key)}`, input);
    return payload?.data ?? null;
  },
};