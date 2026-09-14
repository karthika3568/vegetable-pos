/**
 * Dashboard service - assembles the /dashboard payload for a single
 * business window. It never writes and never fabricates data; every
 * figure is derived from the real append-only ledgers.
 *
 * Response envelope is response.ok({ success, message, data }).
 *
 * Single-window semantics:
 *   - The period is resolved by profitService.resolveWindow() (the same
 *     strict resolver as /profit), so both endpoints always agree:
 *       fromDate default 1970-01-01, toDate default today, malformed /
 *       2026-02-31 / fromDate>toDate rejected with a 400, toDate
 *       inclusive.
 *   - The PROFIT section is not computed here: it is delegated straight
 *     to profitService.list() so GET /api/v1/dashboard.profit EQUALS
 *     GET /api/v1/profit for the same window, by construction (one COGS
 *     formula, one set of formulas, no second accounting system).
 *   - The repository runs every non-profit aggregation on one
 *     REPEATABLE-READ snapshot, so sales/cash/purchases/stock/credit are
 *     mutually consistent at a single point in time.
 *
 * Accounting rules honoured (no double counting):
 *   - credit collection is never revenue (no 'credit_payment' rows feed
 *     cashReceived / revenue),
 *   - purchase payments are never operating expenses (expenses section
 *     reads the expenses ledger only),
 *   - other income is never sales revenue (income section reads the
 *     income ledger only),
 *   - cancelled sales are never revenue and cancelled purchases are not
 *     purchase totals,
 *   - returns are counted once (refund_amount on the sale's sale_date),
 *   - a credit reversal is not new revenue (credit section subtracts
 *     reversal magnitude from created credit),
 *   - walk-in sales are never fabricated customers (recentSales shows
 *     'Walk-in Customer'; topCustomers lists named customers only),
 *   - stock.quantity is the live on-hand snapshot (5 decimal/flexible)
 *     while period movement reads stock_transactions magnitudes, so
 *     "quantity" and "sold quantity" are distinct, documented concepts.
 *
 * currentOutstanding reads customers.current_balance, a LIVE current
 * value (not a period-end historical figure); it is labelled
 * "current/live" deliberately.
 *
 * Money rounded to 2 decimals, quantities to 3; zero everywhere on an
 * empty ledger; never NaN / undefined / Infinity.
 */

const dashboardRepository = require('../repositories/dashboard.repository');
const profitService = require('./profit.service');

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function toQty(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function toCount(value) {
  return Number(value) || 0;
}

function sortTopProducts(rows) {
  return rows
    .map((r) => ({
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      soldQuantity: r.soldQuantity,
      returnedQuantity: r.returnedQuantity,
      netQuantity: r.netQuantity,
      netSales: r.netSales,
    }))
    .sort((a, b) => {
      if (b.netSales !== a.netSales) return b.netSales - a.netSales;
      if (b.soldQuantity !== a.soldQuantity) return b.soldQuantity - a.soldQuantity;
      return a.productName.localeCompare(b.productName);
    });
}

function sortTopCustomers(rows) {
  return rows
    .map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      phone: r.phone,
      salesCount: r.salesCount,
      grossSales: r.grossSales,
      returnedAmount: r.returnedAmount,
      netSales: r.netSales,
    }))
    .sort((a, b) => {
      if (b.netSales !== a.netSales) return b.netSales - a.netSales;
      if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
      return a.customerName.localeCompare(b.customerName);
    });
}

async function dashboard(query) {
  const topLimit = Math.min(Math.max(Number(query.top) || 5, 1), 20);

  const { fromDate, toDate, toDateExclusive } = profitService.resolveWindow({
    fromDate: query.fromDate,
    toDate: query.toDate,
  });

  const profit = await profitService.list({ fromDate, toDate });

  const raw = await dashboardRepository.getDashboard({
    fromDate,
    toDate,
    toDateExclusive,
    top: topLimit,
  });

  // -- sales section (active = completed | returned; cancelled excluded) --
  const grossSalesRevenue = toMoney(raw.sales.gross_revenue);
  const returnedAmount = toMoney(raw.returns.refund_total);
  const netSalesRevenue = toMoney(grossSalesRevenue - returnedAmount);

  const sales = {
    grossSalesRevenue,
    returnedAmount,
    netSalesRevenue,
    saleCount: toCount(raw.sales.active_count),
    completedSaleCount: toCount(raw.sales.completed_count),
    returnedSaleCount: toCount(raw.sales.returned_count),
    cancelledSaleCount: toCount(raw.sales.cancelled_count),
    cashReceived: toMoney(raw.cash.cash_received),
    creditSales: toMoney(raw.sales.credit_sales),
    outstandingFromSales: toMoney(raw.sales.outstanding_from_sales),
  };

  // -- purchases section --
  const purchases = {
    purchaseCount: toCount(raw.purchases.completed_count) + toCount(raw.purchases.cancelled_count),
    completedPurchaseCount: toCount(raw.purchases.completed_count),
    cancelledPurchaseCount: toCount(raw.purchases.cancelled_count),
    purchaseAmount: toMoney(raw.purchases.total_amount),
    purchasedQuantity: toQty(raw.purchaseQty),
  };

  // -- profit section (identical to GET /api/v1/profit for this window) --
  const profitSection = {
    grossSalesRevenue: toMoney(profit.grossSalesRevenue),
    returnedAmount: toMoney(profit.returnedAmount),
    netSalesRevenue: toMoney(profit.netSalesRevenue),
    cogs: toMoney(profit.costOfGoodsSold),
    grossProfit: toMoney(profit.grossProfit),
    expenses: toMoney(profit.expenses),
    otherIncome: toMoney(profit.otherIncome),
    netProfit: toMoney(profit.netProfit),
    cashReceived: toMoney(profit.cashReceived),
    creditOutstanding: toMoney(profit.creditOutstanding),
  };

  // -- expenses / income sections --
  const expenses = {
    total: toMoney(raw.expenses.total),
    count: toCount(raw.expenses.c),
  };

  const income = {
    total: toMoney(raw.income.total),
    count: toCount(raw.income.c),
  };

  // -- stock section --
  const movementByType = {};
  for (const row of raw.movements) {
    movementByType[row.transaction_type] = toQty(row.abs_qty);
  }

  const stock = {
    totalProductsWithStock: toCount(raw.stock.products_with_stock),
    totalQuantityOnHand: toQty(raw.stock.total_on_hand),
    lowStockCount: toCount(raw.stock.low_stock_count),
    purchaseQuantity: toQty(movementByType.purchase || 0),
    soldQuantity: toQty(movementByType.sale || 0),
    returnedQuantity: toQty((movementByType.return_purchase || 0) + (movementByType.return_sale || 0)),
    cancellationReversalQuantity: toQty(movementByType.cancellation_reversal || 0),
    adjustmentQuantity: toQty(movementByType.adjustment || 0),
  };

  // -- credit section --
  const credit = {
    creditSales: toMoney(raw.creditActivity.created_amount),
    creditCollections: toMoney(raw.creditActivity.collected_amount),
    creditReversals: toMoney(raw.creditActivity.reversed_amount),
    currentOutstanding: toMoney(raw.creditOutstanding.total),
    customersWithOutstanding: toCount(raw.creditOutstanding.outstanding_customers),
  };

  // -- top products (returns reduce sold qty; cancelled never appear) --
  const productReturnsMap = new Map(
    raw.productReturns.map((r) => [Number(r.product_id), { quantity: toQty(r.quantity_returned), amount: toMoney(r.returned_amount) }])
  );
  const topProducts = sortTopProducts(
    raw.topProductRows.map((r) => {
      const ret = productReturnsMap.get(Number(r.product_id)) || { quantity: 0, amount: 0 };
      const soldQuantity = toQty(r.quantity_sold);
      const returnedQuantity = ret.quantity;
      const netQuantity = toQty(Math.max(0, soldQuantity - returnedQuantity));
      const netSales = toMoney(Math.max(0, toMoney(r.gross_sales) - ret.amount));
      return {
        productId: Number(r.product_id),
        productName: r.name,
        sku: r.sku,
        soldQuantity,
        returnedQuantity,
        netQuantity,
        netSales,
      };
    })
  );

  // -- top customers (named only, never walk-in; returns reduce gross) --
  const customerReturnsMap = new Map(
    raw.customerReturns.map((r) => [Number(r.customer_id), toMoney(r.returned_amount)])
  );
  const topCustomers = sortTopCustomers(
    raw.topCustomerRows.map((r) => {
      const returnedAmount = customerReturnsMap.get(Number(r.customer_id)) || 0;
      const grossSales = toMoney(r.gross_sales);
      return {
        customerId: Number(r.customer_id),
        customerName: r.name,
        phone: r.phone,
        salesCount: toCount(r.sales_count),
        grossSales,
        returnedAmount,
        netSales: toMoney(Math.max(0, grossSales - returnedAmount)),
      };
    })
  );

  // -- recent sales / purchases --
  const recentSales = raw.recentSales.map((r) => ({
    saleId: Number(r.id),
    invoiceNumber: r.invoice_number,
    saleDate: r.sale_date instanceof Date ? r.sale_date.toISOString() : r.sale_date,
    customer: r.customer_name,
    totalAmount: toMoney(r.total_amount),
    paidAmount: toMoney(r.paid_amount),
    balanceDue: toMoney(r.balance_due),
    status: r.status,
  }));

  const recentPurchases = raw.recentPurchases.map((r) => ({
    purchaseId: Number(r.id),
    invoiceNumber: r.invoice_number,
    purchaseDate: r.purchase_date instanceof Date ? r.purchase_date.toISOString().slice(0, 10) : r.purchase_date,
    supplier: r.supplier_name,
    totalAmount: toMoney(r.total_amount),
    status: r.status,
  }));

  return {
    period: { fromDate, toDate },
    sales,
    purchases,
    profit: profitSection,
    expenses,
    income,
    stock,
    credit,
    topProducts: topProducts.slice(0, topLimit),
    topCustomers: topCustomers.slice(0, topLimit),
    recentSales,
    recentPurchases,
  };
}

module.exports = { dashboard };