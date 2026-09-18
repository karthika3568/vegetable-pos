import { api } from '../api/client.js';

function paramsOf(partial = {}) {
  return Object.fromEntries(
    Object.entries(partial).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  );
}

/**
 * Product Stock & Sales Analytics - thin wrapper around the /analytics
 * endpoints. Every method returns normalized data so the page never has
 * to reason about the ApiResponse envelope.
 */
export const analyticsService = {
  async listProducts({ search, fromDate, toDate, page, limit } = {}) {
    const payload = await api.get('/analytics/products', {
      params: paramsOf({ search, fromDate, toDate, page, limit }),
    });
    return {
      summary: payload?.data?.summary ?? null,
      items: payload?.data?.items ?? [],
      pagination: payload?.meta ?? payload?.data?.pagination ?? null,
    };
  },

  async getProduct({ productId, fromDate, toDate } = {}) {
    const payload = await api.get(`/analytics/products/${productId}`, {
      params: paramsOf({ fromDate, toDate }),
    });
    return {
      product: payload?.data?.product ?? null,
      period: payload?.data?.period ?? null,
      priceHistory: payload?.data?.priceHistory ?? [],
    };
  },

  async listSales({ productId, fromDate, toDate, page, limit } = {}) {
    const payload = await api.get(`/analytics/products/${productId}/sales`, {
      params: paramsOf({ fromDate, toDate, page, limit }),
    });
    return {
      items: payload?.data?.items ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async salesByTime({ productId, date, fromDate, toDate, slotHours } = {}) {
    const payload = await api.get(`/analytics/products/${productId}/sales-by-time`, {
      params: paramsOf({ date, fromDate, toDate, slotHours }),
    });
    return payload?.data ?? null;
  },

  async priceHistory({ productId } = {}) {
    const payload = await api.get(`/analytics/products/${productId}/price-history`);
    return payload?.data?.items ?? [];
  },

  async priceAsOf({ productId, date } = {}) {
    const payload = await api.get(`/analytics/products/${productId}/price-as-of`, {
      params: paramsOf({ date }),
    });
    return payload?.data ?? null;
  },

  async stockTransactions({ productId, fromDate, toDate, type, page, limit } = {}) {
    const payload = await api.get(`/analytics/products/${productId}/stock-transactions`, {
      params: paramsOf({ fromDate, toDate, type, page, limit }),
    });
    return {
      items: payload?.data?.items ?? [],
      pagination: payload?.meta ?? null,
    };
  },
};