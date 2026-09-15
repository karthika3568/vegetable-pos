/**
 * Profit service - computes the profit / financial summary EXCLUSIVELY
 * from the real append-only business ledgers. It never fabricates data,
 * never writes, and never duplicates ledgers.
 *
 * FORMULAS (business dates, deterministic boundaries):
 *   grossSalesRevenue  = SUM(total_amount) of ACTIVE sales in the window.
 *                        Active = status 'completed' | 'returned'.
 *                        'cancelled' sales are never revenue. A fully
 *                        returned sale keeps its original total_amount
 *                        (it is not deleted) and is fully netted out by
 *                        its refund below.
 *   returnedAmount     = SUM(sale_returns.refund_amount) of returns on
 *                        in-window active sales (return reduction is
 *                        attributed to the sale's own sale_date).
 *   netSalesRevenue    = grossSalesRevenue - returnedAmount.
 *   costOfGoodsSold    = per-product (net sold qty) x weighted-average
 *                        purchase cost. Net sold qty = sold - returned
 *                        in the window (>= 0). WAC = SUM(line_total) /
 *                        SUM(quantity) over COMPLETED purchases with
 *                        purchase_date <= toDate. This is the exact
 *                        per-batch cost stored on purchase_items;
 *                        FIFO/LIFO/lot-exact COGS is NOT supported
 *                        because sale lines have no batch link to
 *                        purchases, so WAC is the defensible method the
 *                        data supports.
 *   grossProfit        = netSalesRevenue - costOfGoodsSold.
 *   damageLoss         = SUM(-quantity_change * products.cost_price) of
 *                        'damage' movements in the window (spoiled /
 *                        wasted stock valued at the product's recorded
 *                        purchase cost - real cost data, never invented).
 *   expenses           = SUM(expenses.amount), expense_date in window.
 *                        Purchase payments are NEVER operating expenses;
 *                        a purchase only affects profit through COGS.
 *   otherIncome        = SUM(income.amount), income_date in window.
 *   netProfit          = grossProfit + otherIncome - expenses - damageLoss.
 *   cashReceived       = SUM(payments.amount) for payment_type
 *                        'sale_payment' on in-window active sales.
 *                        GRoss money actually received from those sales.
 *                        'credit_payment' (collections) and
 *                        'purchase_payment' are excluded by the enum, so
 *                        credit collection can never double-count as
 *                        revenue. Refund payouts are not payment rows in
 *                        this system (the refund fact is
 *                        sale_returns.refund_amount), so cashReceived is
 *                        the gross sales intake, not cash minus refunds.
 *   creditOutstanding  = live snapshot of SUM(customers.current_balance).
 *                        Credit sales COUNT as revenue already; the
 *                        balance only tracks what is still owed now.
 *
 * All money is rounded server-side to 2 decimals; quantities to 3.
 * Audit: a read-only summary does NOT create audit rows.
 */

const profitRepository = require('../repositories/profit.repository');
const ApiError = require('../utils/ApiError');

const MIN_DATE = '1970-01-01';

const COGS_METHOD =
  'weighted-average purchase cost (completed purchases up to toDate); exact FIFO/LIFO is not supported because sale lines are not linked to purchase batches';

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function toQty(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function normalizeDate(value) {
  const str = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T| |$)/.exec(str);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayAfter(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function resolveWindow({ fromDate, toDate }) {
  const from = fromDate !== undefined ? normalizeDate(fromDate) : MIN_DATE;
  const to = toDate !== undefined ? normalizeDate(toDate) : todayDate();

  if (from === null) {
    throw ApiError.badRequest('fromDate must be a valid date');
  }
  if (to === null) {
    throw ApiError.badRequest('toDate must be a valid date');
  }
  if (from > to) {
    throw ApiError.badRequest('fromDate must be on or before toDate');
  }

  return { fromDate: from, toDate: to, toDateExclusive: dayAfter(to) };
}

function computeCostOfGoodsSold({ soldRows, returnedRows, costBasis }) {
  const basis = new Map(
    costBasis.map((r) => [Number(r.product_id), { cost: Number(r.total_cost), qty: Number(r.total_qty) }])
  );
  const sold = new Map(soldRows.map((r) => [Number(r.product_id), Number(r.sold_qty)]));
  const returned = new Map(returnedRows.map((r) => [Number(r.product_id), Number(r.returned_qty)]));

  let amount = 0;

  for (const [productId, soldQty] of sold) {
    const netQty = toQty(Math.max(0, soldQty - (returned.get(productId) || 0)));
    if (netQty === 0) continue;

    const b = basis.get(productId);
    const unitCost = b && b.qty > 0 ? b.cost / b.qty : 0;

    amount += toMoney(netQty * unitCost);
  }

  return { method: COGS_METHOD, amount: toMoney(amount) };
}

async function list({ fromDate, toDate }) {
  const window = resolveWindow({ fromDate, toDate });
  const raw = await profitRepository.getSummary(window);

  const grossSalesRevenue = toMoney(raw.sales.gross_revenue);
  const returnedAmount = toMoney(raw.returns.refund_total);
  const netSalesRevenue = toMoney(grossSalesRevenue - returnedAmount);

  const costOfGoodsSold = computeCostOfGoodsSold(raw);

  const grossProfit = toMoney(netSalesRevenue - costOfGoodsSold.amount);
  const damageLoss = toMoney(raw.damage.total);
  const expenses = toMoney(raw.expenses.total);
  const otherIncome = toMoney(raw.income.total);
  const netProfit = toMoney(grossProfit + otherIncome - expenses - damageLoss);
  const cashReceived = toMoney(raw.cash.total);
  const creditOutstanding = toMoney(raw.credits.total);

  return {
    fromDate: window.fromDate,
    toDate: window.toDate,
    salesCount: Number(raw.sales.active_count),
    cancelledSalesCount: Number(raw.sales.cancelled_count),
    returnedSalesCount: Number(raw.returns.returned_sale_count),
    grossSalesRevenue,
    returnedAmount,
    netSalesRevenue,
    costOfGoodsSold: costOfGoodsSold.amount,
    cogsMethod: costOfGoodsSold.method,
    grossProfit,
    damageLoss,
    damageCount: Number(raw.damage.c),
    expenses,
    expenseCount: Number(raw.expenses.c),
    otherIncome,
    incomeCount: Number(raw.income.c),
    netProfit,
    cashReceived,
    creditOutstanding,
  };
}

module.exports = {
  list,
  resolveWindow,
};