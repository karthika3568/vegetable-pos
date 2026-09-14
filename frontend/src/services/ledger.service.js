import { api } from '../api/client.js';

export const LEDGER_TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export const SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'category', label: 'Category' },
  { value: 'id', label: 'ID' },
];

const API_BASE = {
  expense: '/expenses',
  income: '/income',
};

const DATE_FIELD = {
  expense: 'expenseDate',
  income: 'incomeDate',
};

export function dateFieldFor(type) {
  return DATE_FIELD[type] || 'expenseDate';
}

export const ledgerService = {
  async list(type, { search, category, fromDate, toDate, sortBy, sortOrder, page, limit } = {}) {
    const payload = await api.get(API_BASE[type] || '/expenses', {
      params: {
        search: search || undefined,
        category: category || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        page: page || undefined,
        limit: limit || undefined,
      },
    });
    return {
      items: payload?.data ?? [],
      pagination: payload?.meta ?? null,
    };
  },

  async get(type, id) {
    const payload = await api.get(`${API_BASE[type] || '/expenses'}/${id}`);
    return payload?.data ?? null;
  },

  async create(type, input) {
    const payload = await api.post(API_BASE[type] || '/expenses', input);
    return payload?.data ?? null;
  },

  async update(type, id, input) {
    const payload = await api.patch(`${API_BASE[type] || '/expenses'}/${id}`, input);
    return payload?.data ?? null;
  },
};