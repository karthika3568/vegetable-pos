import { api } from '../api/client.js';

function mapTaxCode(raw) {
  return {
    id: Number(raw.id),
    code: raw.code,
    name: raw.name,
    cgstRate: Number(raw.cgst_rate || 0),
    sgstRate: Number(raw.sgst_rate || 0),
    igstRate: Number(raw.igst_rate || 0),
    status: raw.status,
    isActive: raw.is_active === 1 || raw.is_active === true,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export const taxCodeService = {
  async list({ search, status, page = 1, limit = 50 } = {}) {
    const payload = await api.get('/tax-codes', {
      params: {
        search: search || undefined,
        status: status || undefined,
        page,
        limit,
      },
    });
    return {
      items: (payload?.data ?? []).map(mapTaxCode),
      pagination: payload?.meta ?? null,
    };
  },

  async listActive() {
    const payload = await api.get('/tax-codes/active');
    return (payload?.data ?? []).map(mapTaxCode);
  },

  async getById(id) {
    const payload = await api.get(`/tax-codes/${id}`);
    return payload?.data ? mapTaxCode(payload.data) : null;
  },

  async create(body) {
    const payload = await api.post('/tax-codes', body);
    return payload?.data ? mapTaxCode(payload.data) : null;
  },

  async update(id, body) {
    const payload = await api.put(`/tax-codes/${id}`, body);
    return payload?.data ? mapTaxCode(payload.data) : null;
  },

  async setStatus(id, status) {
    const payload = await api.patch(`/tax-codes/${id}/status`, { status });
    return payload?.data ? mapTaxCode(payload.data) : null;
  },
};