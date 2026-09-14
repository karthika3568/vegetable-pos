import { api } from '../api/client.js';

export const purchaseService = {
  async create(input) {
    const payload = await api.post('/purchases', input);
    return payload?.data ?? null;
  },

  async listPurchases({ search, fromDate, toDate, status, page, limit } = {}) {
    const payload = await api.get('/purchases', {
      params: {
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: status || undefined,
        page: page || undefined,
        limit: limit || undefined,
      },
    });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async getPurchase(id) {
    const payload = await api.get(`/purchases/${id}`);
    return payload?.data ?? null;
  },
};