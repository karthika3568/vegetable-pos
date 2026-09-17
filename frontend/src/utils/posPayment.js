/**
 * Pure POS payment helpers - no React, no API imports, so the payment
 * row/amount logic can be reasoned about (and tested) in isolation.
 *
 * Single source of truth for how many payment rows each mode starts
 * with and how the payment totals are derived from them.
 */

export const PAYMENT_MODES = {
  full: 'full',
  partial: 'partial',
  credit: 'credit',
  split: 'split',
};

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Payment rows a mode starts with:
 *   - full    -> exactly ONE row (prefilled with the sale total)
 *   - partial -> exactly ONE row (amount left for the user to enter)
 *   - credit  -> no cash rows (credit only)
 *   - split   -> TWO rows immediately (the only multi-row mode)
 * Extra rows are never created automatically - only the explicit
 * "Add payment" action in split mode can extend the list.
 */
export function defaultPaymentRows(mode, total, currentMethod = 'cash', methods = []) {
  if (mode === PAYMENT_MODES.credit) return [];

  const firstMethod = currentMethod === 'credit' ? 'cash' : currentMethod || 'cash';
  const amount = total > 0 ? String(total) : '';

  if (mode === PAYMENT_MODES.split) {
    const secondMethod = methods.find((method) => method !== firstMethod) || 'card';
    return [
      { method: firstMethod, amount },
      { method: secondMethod, amount: '' },
    ];
  }

  return [
    { method: firstMethod, amount: mode === PAYMENT_MODES.full ? amount : '' },
  ];
}

/**
 * Derive the payment summary from the rows:
 *   totalPaid   = sum of all cash rows (credit rows contribute nothing)
 *   credit      = amount left over that goes on customer credit
 *   balanceDue  = total - totalPaid - credit  (never negative)
 *   overpaid    = totalPaid exceeds the sale total
 */
export function computePaymentTotals(rows, total) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const saleTotal = Number(total) || 0;

  const paidTotal = round2(
    safeRows.reduce((sum, payment) => {
      if (payment.method === 'credit') return sum;
      const amount = Number(payment.amount);
      // Empty, non-numeric or negative amounts never count as paid; they
      // are rejected by row validation before the sale can be completed.
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0)
  );

  const owesMoney = saleTotal > 0 && paidTotal < saleTotal;
  const credit = owesMoney ? round2(Math.max(0, saleTotal - paidTotal)) : 0;
  const balanceDue = round2(Math.max(0, saleTotal - paidTotal - credit));
  const paymentOverTotal = safeRows.length > 0 && paidTotal > saleTotal;

  return { paidTotal, owesMoney, credit, balanceDue, paymentOverTotal };
}
