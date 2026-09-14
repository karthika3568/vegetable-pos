import { api } from '../api/client.js';
import { salesService } from './sales.service.js';

export const RETURN_STATUSES = ['completed', 'cancelled', 'returned'];

export const RETURN_STATUS_LABELS = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const returnService = {
  listSales(options) {
    return salesService.listSales(options);
  },

  getSale(id) {
    return salesService.getSale(id);
  },

  async returnGoods(saleId, { items, reason } = {}) {
    const payload = await api.post(`/sales/${saleId}/return`, {
      items,
      reason: reason || undefined,
    });
    return payload?.data ?? null;
  },

  async cancelSale(saleId) {
    const payload = await api.patch(`/sales/${saleId}/cancel`);
    return payload?.data ?? null;
  },
};

export function getReturnableByItem(sale) {
  const remaining = new Map();
  for (const item of sale?.items ?? []) {
    remaining.set(Number(item.id), Number(item.quantity));
  }
  for (const ret of sale?.returns ?? []) {
    for (const returned of ret.items ?? []) {
      const key = Number(returned.sale_item_id);
      if (remaining.has(key)) {
        remaining.set(key, remaining.get(key) - Number(returned.quantity));
      }
    }
  }
  return remaining;
}