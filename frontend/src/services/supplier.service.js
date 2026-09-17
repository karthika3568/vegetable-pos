import { api } from '../api/client.js';

export const SUPPLIER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const supplierService = {
  async list(params) {
    const payload = await api.get('/suppliers', { params });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async get(id) {
    const payload = await api.get(`/suppliers/${id}`);
    return payload?.data ?? null;
  },

  async create(input) {
    const payload = await api.post('/suppliers', input);
    return payload?.data ?? null;
  },

  async update(id, input) {
    const payload = await api.put(`/suppliers/${id}`, input);
    return payload?.data ?? null;
  },

  async setStatus(id, status) {
    const payload = await api.patch(`/suppliers/${id}/status`, { status });
    return payload?.data ?? null;
  },

  async recordPayment(id, input) {
    const payload = await api.post(`/suppliers/${id}/payments`, input);
    return payload?.data ?? null;
  },

  async getPayments(id) {
    const payload = await api.get(`/suppliers/${id}/payments`);
    return payload?.data ?? [];
  },
};