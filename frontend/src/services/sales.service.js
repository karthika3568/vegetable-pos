import { api } from '../api/client.js';

export const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'other'];

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

function mapProduct(raw) {
  return {
    id: Number(raw.id),
    productCode: raw.product_code,
    name: raw.name,
    categoryId: raw.category_id ? Number(raw.category_id) : null,
    categoryName: raw.category_name || null,
    unit: raw.unit,
    purchasePrice: Number(raw.purchase_price),
    sellingPrice: Number(raw.selling_price),
    currentStock: Number(raw.current_stock),
    minimumStock: Number(raw.minimum_stock),
    status: raw.status,
  };
}

function mapCustomer(raw) {
  return {
    id: Number(raw.id),
    name: raw.name,
    phone: raw.phone || null,
    email: raw.email || null,
    address: raw.address || null,
    creditLimit: Number(raw.credit_limit),
    currentBalance: Number(raw.current_balance),
    status: raw.status,
  };
}

export const salesService = {
  async searchProducts({ search, page = 1, limit = 12 } = {}) {
    const payload = await api.get('/products', {
      params: {
        search: search || undefined,
        status: 'active',
        page,
        limit,
      },
    });
    return {
      items: (payload?.data ?? []).map(mapProduct),
      pagination: payload?.meta ?? null,
    };
  },

  async searchCustomers({ search, page = 1, limit = 20 } = {}) {
    const payload = await api.get('/customers', {
      params: {
        search: search || undefined,
        status: 'active',
        page,
        limit,
      },
    });
    return {
      items: (payload?.data ?? []).map(mapCustomer),
      pagination: payload?.meta ?? null,
    };
  },

  async createSale(body) {
    const payload = await api.post('/sales', body);
    return payload?.data ?? null;
  },

  async getSale(id) {
    const payload = await api.get(`/sales/${id}`);
    return payload?.data ?? null;
  },

  async listSales({ search, customerId, fromDate, toDate, status, paymentType, page, limit } = {}) {
    const payload = await api.get('/sales', {
      params: {
        search: search || undefined,
        customerId: customerId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: status || undefined,
        paymentType: paymentType || undefined,
        page: page || undefined,
        limit: limit || undefined,
      },
    });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },
};