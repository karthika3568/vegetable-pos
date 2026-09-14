import { api } from '../api/client.js';

export const CUSTOMER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const customerService = {
  async list(params) {
    const payload = await api.get('/customers', { params });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async get(id) {
    const payload = await api.get(`/customers/${id}`);
    return payload?.data ?? null;
  },

  async create(input) {
    const payload = await api.post('/customers', input);
    return payload?.data ?? null;
  },

  async update(id, input) {
    const payload = await api.put(`/customers/${id}`, input);
    return payload?.data ?? null;
  },

  async setStatus(id, status) {
    const payload = await api.patch(`/customers/${id}/status`, { status });
    return payload?.data ?? null;
  },
};