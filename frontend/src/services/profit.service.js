import { api } from '../api/client.js';

export const profitService = {
  async getSummary({ fromDate, toDate } = {}) {
    const payload = await api.get('/profit', {
      params: {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      },
    });
    return payload?.data ?? null;
  },
};