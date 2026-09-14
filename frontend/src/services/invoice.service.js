import { api } from '../api/client.js';

export const INVOICE_STATUSES = ['completed', 'cancelled', 'returned'];

export const INVOICE_STATUS_LABELS = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const PAYMENT_TYPE_LABELS = {
  cash: 'Cash',
  credit: 'Credit',
  partial: 'Partial',
};

export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

export const invoiceService = {
  async list({ search, fromDate, toDate, status, page, limit } = {}) {
    const payload = await api.get('/invoices', {
      params: {
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
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

  async getBySaleId(saleId) {
    const payload = await api.get(`/invoices/${saleId}`);
    return payload?.data ?? null;
  },

  async getByInvoiceNumber(invoiceNumber) {
    const payload = await api.get(`/invoices/by-number/${encodeURIComponent(invoiceNumber)}`);
    return payload?.data ?? null;
  },
};