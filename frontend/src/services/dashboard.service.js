import { api } from '../api/client.js';

/**
 * Dashboard summary. The backend owns every figure; the frontend only
 * surfaces the fields the /dashboard contract currently provides.
 * Fields may evolve while Phase 8D is finalized - this page must adapt
 * to the real response, never fabricate its own numbers.
 */
export const dashboardService = {
  async getSummary(params) {
    const payload = await api.get('/dashboard', { params });
    return payload?.data ?? null;
  },
};