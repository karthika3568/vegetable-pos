import { api } from '../api/client.js';

export const BRANCH_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function mapBranch(raw) {
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address ?? null,
    phone: raw.phone ?? null,
    gstin: raw.gstin ?? null,
    invoiceHeader: raw.invoice_header ?? null,
    invoiceFooter: raw.invoice_footer ?? null,
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export const branchService = {
  async list(params) {
    const payload = await api.get('/branches', { params });
    return (payload?.data ?? []).map(mapBranch);
  },

  async get(id) {
    const payload = await api.get(`/branches/${id}`);
    return payload?.data ? mapBranch(payload.data) : null;
  },

  async create(input) {
    const payload = await api.post('/branches', input);
    return payload?.data ? mapBranch(payload.data) : null;
  },

  async update(id, input) {
    const payload = await api.put(`/branches/${id}`, input);
    return payload?.data ? mapBranch(payload.data) : null;
  },

  /** Activate/deactivate is just a status update through the same PUT endpoint. */
  async setStatus(id, status) {
    const payload = await api.put(`/branches/${id}`, { status });
    return payload?.data ? mapBranch(payload.data) : null;
  },

  /** Per-branch product availability: which products can be sold at this branch. */
  async getProducts(id) {
    const payload = await api.get(`/branches/${id}/products`);
    return payload?.data ?? [];
  },

  /** Bulk-replaces the branch's available product ids. */
  async setProducts(id, productIds) {
    const payload = await api.put(`/branches/${id}/products`, { productIds });
    return payload?.data ?? null;
  },
};
