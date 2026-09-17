import { api } from '../api/client.js';

export const PURCHASE_PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'other'];

export const PURCHASE_PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

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

  async listHistory({ search, type, fromDate, toDate, status, page, limit } = {}) {
    const params = {};
    if (search) params.search = search;
    if (type) params.type = type;
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    if (status) params.status = status;
    if (page) params.page = page;
    if (limit) params.limit = limit;

    const payload = await api.get('/purchases/history', { params });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async getPurchase(id) {
    const payload = await api.get(`/purchases/${id}`);
    return payload?.data ?? null;
  },

  async recordPayment(id, body) {
    const payload = await api.post(`/purchases/${id}/payments`, body);
    return payload?.data ?? null;
  },

  async recordActualAmount(id, body) {
    const payload = await api.patch(`/purchases/${id}/actual-amount`, body);
    return payload?.data ?? null;
  },

  async getPayments(id) {
    const payload = await api.get(`/purchases/${id}/payments`);
    return payload?.data ?? [];
  },

  async createOpeningStock(input) {
    const payload = await api.post('/opening-stock', input);
    return payload?.data ?? null;
  },

  async getOpeningStock(id) {
    const payload = await api.get(`/opening-stock/${id}`);
    return payload?.data ?? null;
  },
};