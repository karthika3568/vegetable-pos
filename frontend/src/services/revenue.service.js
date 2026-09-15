import { api } from '../api/client.js';

/**
 * Revenue Dashboard - thin wrapper around the read-only /revenue
 * endpoint. The backend owns every figure (profit block delegates to the
 * single /profit formula); the frontend only formats.
 */
export const revenueService = {
  async getDashboard({ fromDate, toDate, top } = {}) {
    const payload = await api.get('/revenue', {
      params: {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        top,
      },
    });
    return payload?.data ?? null;
  },
};