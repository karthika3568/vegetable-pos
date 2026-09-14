import { api } from '../api/client.js';

export const reportsService = {
  async getRowReport(type, params) {
    const payload = await api.get(`/reports/${type}`, { params });
    return {
      summary: payload?.data?.summary ?? {},
      items: payload?.data?.items ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async getProfitSummary({ fromDate, toDate } = {}) {
    const payload = await api.get('/reports/profit', {
      params: {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      },
    });
    return payload?.data ?? null;
  },
};