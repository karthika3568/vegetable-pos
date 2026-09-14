import { api } from '../api/client.js';

export const PRODUCT_STATUS_OPTIONS = [
  { value: '', label: 'All products' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

export const TX_TYPE_LABELS = {
  purchase: 'Purchase',
  sale: 'Sale',
  return_purchase: 'Purchase Return',
  return_sale: 'Sales Return',
  adjustment: 'Adjustment',
  cancellation_reversal: 'Cancellation Reversal',
};

export const TX_TYPE_OPTIONS = Object.entries(TX_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const stockService = {
  async list({ search, productStatus, page, limit } = {}) {
    const payload = await api.get('/stock', {
      params: {
        search: search || undefined,
        productStatus: productStatus || undefined,
        page: page || undefined,
        limit: limit || undefined,
      },
    });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async get(productId) {
    const payload = await api.get(`/stock/${productId}`);
    return payload?.data ?? null;
  },

  async transactions(productId, { type, fromDate, toDate, page, limit } = {}) {
    const payload = await api.get(`/stock/${productId}/transactions`, {
      params: {
        type: type || undefined,
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

  async adjust(productId, { delta, note }) {
    const payload = await api.patch(`/stock/${productId}/adjust`, { delta, note });
    return payload?.data ?? null;
  },
};