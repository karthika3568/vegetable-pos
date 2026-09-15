import { api } from '../api/client.js';

export const PURCHASE_ORDER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const purchaseOrderService = {
  async create(input) {
    const payload = await api.post('/purchase-orders', input);
    return payload?.data ?? null;
  },

  async list({ search, supplierId, status, fromDate, toDate, page, limit } = {}) {
    const payload = await api.get('/purchase-orders', {
      params: {
        search: search || undefined,
        supplierId: supplierId || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page: page || undefined,
        limit: limit || undefined,
      },
    });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async getById(id) {
    const payload = await api.get(`/purchase-orders/${id}`);
    return payload?.data ?? null;
  },

  async update(id, input) {
    const payload = await api.patch(`/purchase-orders/${id}`, input);
    return payload?.data ?? null;
  },

  async send(id) {
    const payload = await api.post(`/purchase-orders/${id}/send`);
    return payload?.data ?? null;
  },

  async receive(id, input) {
    const payload = await api.post(`/purchase-orders/${id}/receive`, input);
    return payload?.data ?? null;
  },

  async cancel(id) {
    const payload = await api.post(`/purchase-orders/${id}/cancel`);
    return payload?.data ?? null;
  },
};