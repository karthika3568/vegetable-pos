import { api } from '../api/client.js';

export const VARIANT_STATUS_OPTIONS = [
  { value: '', label: 'All variants' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

export const variantService = {
  async list(productId, { search, status, page, limit } = {}) {
    const payload = await api.get(`/products/${productId}/variants`, {
      params: {
        search: search || undefined,
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

  async get(productId, variantId) {
    const payload = await api.get(`/products/${productId}/variants/${variantId}`);
    return payload?.data ?? null;
  },

  async create(productId, input) {
    const payload = await api.post(`/products/${productId}/variants`, input);
    return payload?.data ?? null;
  },

  async update(productId, variantId, input) {
    const payload = await api.put(`/products/${productId}/variants/${variantId}`, input);
    return payload?.data ?? null;
  },

  async setStatus(productId, variantId, status) {
    const payload = await api.patch(`/products/${productId}/variants/${variantId}/status`, { status });
    return payload?.data ?? null;
  },
};