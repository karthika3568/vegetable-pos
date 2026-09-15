/**
 * Revenue service - assembles the /revenue dashboard payload.
 *
 * Consistency by construction:
 *   - The PROFIT / KPI block is delegated verbatim to
 *     profitService.list() (the single profit formula in the app), so
 *     GET /api/v1/revenue.profit EQUALS GET /api/v1/profit for the same
 *     window. The frontend never recalculates money; it only formats.
 *   - The trend, payment mix, category and top-product sections are
 *     computed READ-ONLY here from the real ledgers by revenueRepository
 *     on one REPEATABLE-READ snapshot, using the same business rules as
 *     /profit (active = completed|returned, cancelled never revenue,
 *     returns reduce net, refunds attributed to the sale's date).
 *   - The comparison window is the equal-length period immediately
 *     before the selected window, resolved the same way; it is null when
 *     the selected window has no finite previous period (start of
 *     records).
 *
 * Every money value is rounded server-side to 2 decimals; quantities to
 * 3; counts to integers. Zero defaults everywhere - no NaN/undefined.
 */

const revenueRepository = require('../repositories/revenue.repository');
const profitService = require('./profit.service');

const PAYMENT_LABELS = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toQty(value) {
  const n = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
}

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildComparison({ fromDate, toDate }) {
  if (!fromDate || fromDate <= '1970-01-01') return null;

  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  const lengthDays = Math.round((toMs - fromMs) / 86400000) + 1;
  if (!(lengthDays > 0)) return null;

  const prevToDate = addDays(fromDate, -1);
  const prevFromDate = addDays(prevToDate, -(lengthDays - 1));
  return { fromDate: prevFromDate, toDate: prevToDate };
}

async function list({ fromDate, toDate, top = 10 }) {
  const window = profitService.resolveWindow({ fromDate, toDate });
  const topLimit = Math.min(Math.max(Number(top) || 10, 1), 20);

  const [raw, profit, comparisonProfit] = await Promise.all([
    revenueRepository.getSummary(window),
    profitService.list({ fromDate: window.fromDate, toDate: window.toDate }),
    (async () => {
      const previous = buildComparison(window);
      if (!previous) return null;
      return profitService.list({ fromDate: previous.fromDate, toDate: previous.toDate });
    })(),
  ]);

  // ---- daily series: every day with activity, merged across sales & returns ----
  const dailyMap = new Map();
  for (const row of raw.dailySales) {
    dailyMap.set(row.sale_date, {
      date: row.sale_date,
      salesCount: toCount(row.sales_count),
      grossSalesRevenue: toMoney(row.gross_revenue),
      returnedAmount: 0,
    });
  }
  for (const row of raw.dailyReturns) {
    const day = dailyMap.get(row.sale_date) || {
      date: row.sale_date,
      salesCount: 0,
      grossSalesRevenue: 0,
      returnedAmount: 0,
    };
    day.returnedAmount = toMoney(row.refund_amount);
    dailyMap.set(row.sale_date, day);
  }
  const daily = [...dailyMap.values()]
    .map((day) => {
      const netSalesRevenue = toMoney(day.grossSalesRevenue - day.returnedAmount);
      return {
        ...day,
        netSalesRevenue,
        averageOrderValue: day.salesCount > 0 ? toMoney(netSalesRevenue / day.salesCount) : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- revenue by payment method (paid by method + unpaid credit) ----
  const grossRevenue = toMoney(profit.grossSalesRevenue);
  const paymentMap = new Map();
  for (const row of raw.paymentMethods) {
    paymentMap.set(row.payment_method, toMoney(row.amount));
  }
  const paymentTotal = [...paymentMap.values()].reduce((sum, value) => sum + value, 0);
  const creditAmount = toMoney(Math.max(0, toMoney(grossRevenue - paymentTotal)));
  const paymentEntries = [];
  for (const [key, amount] of paymentMap) {
    if (amount > 0) {
      paymentEntries.push({ key, label: PAYMENT_LABELS[key] || key, amount });
    }
  }
  if (creditAmount > 0) {
    paymentEntries.push({ key: 'credit', label: 'Credit', amount: creditAmount });
  }
  paymentEntries.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const payments = paymentEntries.map((entry) => ({
    method: entry.key,
    label: entry.label,
    amount: entry.amount,
    percent: grossRevenue > 0 ? toMoney((entry.amount / grossRevenue) * 100) : 0,
  }));

  // ---- revenue by category (gross minus returned per category) ----
  const categoriesMap = new Map();
  for (const row of raw.categoryGross) {
    categoriesMap.set(row.category_name, {
      categoryName: row.category_name,
      grossAmount: toMoney(row.gross_amount),
      returnedAmount: 0,
    });
  }
  for (const row of raw.categoryReturns) {
    const category = categoriesMap.get(row.category_name) || {
      categoryName: row.category_name,
      grossAmount: 0,
      returnedAmount: 0,
    };
    category.returnedAmount = toMoney(row.returned_amount);
    categoriesMap.set(row.category_name, category);
  }
  const categoryNetTotal = [...categoriesMap.values()].reduce(
    (sum, category) => sum + toMoney(category.grossAmount - category.returnedAmount),
    0
  );
  const categories = [...categoriesMap.values()]
    .map((category) => ({
      categoryName: category.categoryName,
      grossAmount: category.grossAmount,
      returnedAmount: category.returnedAmount,
      netSales: toMoney(category.grossAmount - category.returnedAmount),
    }))
    .filter((category) => category.netSales > 0)
    .sort((a, b) => b.netSales - a.netSales || a.categoryName.localeCompare(b.categoryName))
    .map((category) => ({
      ...category,
      percent: categoryNetTotal > 0 ? toMoney((category.netSales / categoryNetTotal) * 100) : 0,
    }));

  // ---- top products by net revenue (gross minus returned) ----
  const productReturnsMap = new Map(
    raw.productReturns.map((row) => [
      Number(row.product_id),
      { quantityReturned: toQty(row.quantity_returned), returnedAmount: toMoney(row.returned_amount) },
    ])
  );
  const topProducts = raw.topProductRows
    .map((row) => {
      const ret = productReturnsMap.get(Number(row.product_id)) || { quantityReturned: 0, returnedAmount: 0 };
      const soldQuantity = toQty(row.quantity_sold);
      const returnedQuantity = ret.quantityReturned;
      const netQuantity = toQty(Math.max(0, soldQuantity - returnedQuantity));
      const netSales = toMoney(Math.max(0, toMoney(row.gross_sales) - ret.returnedAmount));
      return {
        productId: Number(row.product_id),
        productName: row.name,
        sku: row.sku,
        unit: row.unit || '',
        soldQuantity,
        returnedQuantity,
        netQuantity,
        netSales,
      };
    })
    .sort((a, b) => {
      if (b.netSales !== a.netSales) return b.netSales - a.netSales;
      if (b.netQuantity !== a.netQuantity) return b.netQuantity - a.netQuantity;
      return a.productName.localeCompare(b.productName);
    })
    .slice(0, topLimit);

  const salesCount = toCount(profit.salesCount);
  const netSalesRevenue = toMoney(profit.netSalesRevenue);

  const kpis = {
    totalRevenue: netSalesRevenue,
    totalSales: salesCount,
    averageOrderValue: salesCount > 0 ? toMoney(netSalesRevenue / salesCount) : 0,
    totalProfit: toMoney(profit.netProfit),
    totalRefunds: toMoney(profit.returnedAmount),
    completedSaleCount: toCount(profit.salesCount - profit.returnedSalesCount),
    returnedSalesCount: toCount(profit.returnedSalesCount),
    cancelledSalesCount: toCount(profit.cancelledSalesCount),
  };

  const comparison = comparisonProfit
    ? {
        fromDate: comparisonProfit.fromDate,
        toDate: comparisonProfit.toDate,
        totalRevenue: toMoney(comparisonProfit.netSalesRevenue),
        totalSales: toCount(comparisonProfit.salesCount),
        averageOrderValue:
          toCount(comparisonProfit.salesCount) > 0
            ? toMoney(comparisonProfit.netSalesRevenue / toCount(comparisonProfit.salesCount))
            : 0,
        totalProfit: toMoney(comparisonProfit.netProfit),
        totalRefunds: toMoney(comparisonProfit.returnedAmount),
      }
    : null;

  return {
    period: { fromDate: window.fromDate, toDate: window.toDate },
    kpis,
    comparison,
    profit: {
      grossSalesRevenue: grossRevenue,
      returnedAmount: toMoney(profit.returnedAmount),
      netSalesRevenue,
      costOfGoodsSold: toMoney(profit.costOfGoodsSold),
      cogsMethod: profit.cogsMethod,
      grossProfit: toMoney(profit.grossProfit),
      damageLoss: toMoney(profit.damageLoss),
      damageCount: toCount(profit.damageCount),
      expenses: toMoney(profit.expenses),
      expenseCount: toCount(profit.expenseCount),
      otherIncome: toMoney(profit.otherIncome),
      incomeCount: toCount(profit.incomeCount),
      netProfit: toMoney(profit.netProfit),
      cashReceived: toMoney(profit.cashReceived),
      creditOutstanding: toMoney(profit.creditOutstanding),
    },
    daily,
    payments,
    categories,
    topProducts,
  };
}

module.exports = { list, buildComparison };