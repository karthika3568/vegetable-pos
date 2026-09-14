import { api } from '../api/client.js';

export const CREDIT_PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'other'];

export const CREDIT_PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

export const CREDIT_TRANSACTION_LABELS = {
  created: 'Credit Created',
  collected: 'Credit Collected',
  credit_reversal: 'Credit Reversal',
};

export const creditService = {
  async list({ search, outstanding, status, page, limit } = {}) {
    const payload = await api.get('/credits', {
      params: {
        search: search || undefined,
        outstanding: outstanding || undefined,
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

  async getCustomerCredit(customerId) {
    const payload = await api.get(`/credits/${customerId}`);
    return payload?.data ?? null;
  },

  async createFromSale(saleId) {
    const payload = await api.post('/credits', { saleId });
    return payload?.data ?? null;
  },

  async collect(customerId, body) {
    const payload = await api.post(`/credits/${customerId}/collect`, body);
    return payload?.data ?? null;
  },

  async getTransactions(customerId, { page = 1, limit = 20 } = {}) {
    const payload = await api.get(`/credits/${customerId}/transactions`, {
      params: { page, limit },
    });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },
};