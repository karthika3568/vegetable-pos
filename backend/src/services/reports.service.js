/**
 * Reports service - orchestrates the /reports module.
 *
 * Delegation:
 *   - The PROFIT report reuses profit.service.list() verbatim (exactly
 *     one COGS/summary formula in the codebase), so GET
 *     /api/v1/reports/profit always agrees with GET /api/v1/profit - no
 *     second implementation can drift.
 *
 * Date windows:
 *   - fromDate/toDate are validated by profit.service.resolveWindow
 *     (strict normalizeDate + round-trip, rejects impossible dates like
 *     2026-02-31 and fromDate > toDate with 400). toDate is inclusive.
 *
 * Summary contract (documented for every report):
 *   The `summary` block is ALWAYS the full date-window period total
 *   across every customer/product/supplier - it never changes when the
 *   caller adds status/category/search filters or pagination. The row
 *   filters only scope `items`, so a management summary can never be
 *   accidentally shrunk by a drill-down filter.
 *
 * DTO rule: money is 2dp, quantity is 3dp, DECIMAL strings from MySQL
 * are converted to numbers, zero defaults everywhere - no NaN/undefined
 * can ever reach the response.
 */

const reportsRepository = require('../repositories/reports.repository');
const profitService = require('./profit.service');

const SORT_MAPS = {
  sales: { date: 's.sale_date', total: 's.total_amount', status: 's.status', id: 's.id' },
  purchases: { date: 'pu.purchase_date', total: 'pu.total_amount', supplier: 's.name', id: 'pu.id' },
  expenses: { date: 'e.expense_date', amount: 'e.amount', category: 'e.category', id: 'e.id' },
  income: { date: 'e.income_date', amount: 'e.amount', category: 'e.category', id: 'e.id' },
  stock: { name: 'p.name', sku: 'p.sku', current: 'st.quantity', id: 'p.id' },
  credit: { balance: 'cust.current_balance', name: 'cust.name', id: 'cust.id' },
  customers: { name: 'customer_name', gross: 'gross_sales', salesCount: 'sales_count' },
  products: { name: 'p.name', gross: 'gross_sales', quantitySold: 'quantity_sold' },
  suppliers: { name: 'supplier_name', total: 'total_amount', purchaseCount: 'purchase_count' },
};

const DEFAULT_ORDERS = {
  sales: 's.sale_date DESC, s.id DESC',
  purchases: 'pu.purchase_date DESC, pu.id DESC',
  expenses: 'e.expense_date DESC, e.id DESC',
  income: 'e.income_date DESC, e.id DESC',
  stock: 'p.name ASC, p.id ASC',
  credit: 'cust.current_balance DESC, cust.name ASC',
  customers: 'gross_sales DESC, customer_name ASC',
  products: 'gross_sales DESC, p.name ASC',
  suppliers: 'total_amount DESC, supplier_name ASC',
};

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function toQty(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function resolveOrder(report, sortBy, sortOrder) {
  if (!sortBy) return DEFAULT_ORDERS[report];
  const column = SORT_MAPS[report][sortBy];
  if (!column) return DEFAULT_ORDERS[report];
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}`;
}

function pagination(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function defaults(query) {
  return {
    fromDate: query.fromDate,
    toDate: query.toDate,
    page: query.page || 1,
    limit: query.limit || 20,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    search: query.search || undefined,
  };
}

// ---------------------------------------------------------------------
// SALES
// ---------------------------------------------------------------------
async function sales(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.salesReport({
    fromDate: window.fromDate,
    toDate: window.toDate,
    toDateExclusive: window.toDateExclusive,
    status: query.status,
    paymentType: query.paymentType,
    customerId: query.customerId,
    search,
    orderBy: resolveOrder('sales', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const grossSalesRevenue = toMoney(summary.gross_revenue);
  const returnedAmount = toMoney(summary.refund_total);

  const items = rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    saleDate: r.sale_date,
    customerId: r.customer_id,
    customerName: r.customer_name,
    paymentType: r.payment_type,
    totalAmount: toMoney(r.total_amount),
    paidAmount: toMoney(r.paid_amount),
    balanceDue: toMoney(r.balance_due),
    status: r.status,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  }));

  return {
    summary: {
      salesCount: Number(summary.sales_count),
      cancelledSalesCount: Number(summary.cancelled_count),
      returnedSalesCount: Number(summary.returned_sale_count),
      grossSalesRevenue,
      returnedAmount,
      netSalesRevenue: toMoney(Math.max(0, grossSalesRevenue - returnedAmount)),
      cashReceived: toMoney(summary.cash_received),
      creditOutstanding: toMoney(summary.credit_outstanding),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// PURCHASES
// ---------------------------------------------------------------------
async function purchases(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.purchasesReport({
    fromDate: window.fromDate,
    toDate: window.toDate,
    status: query.status,
    supplierId: query.supplierId,
    search,
    orderBy: resolveOrder('purchases', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const items = rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    purchaseDate: r.purchase_date,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    status: r.status,
    totalAmount: toMoney(r.total_amount),
    paidAmount: toMoney(r.paid_amount),
    notes: r.notes,
    itemCount: Number(r.item_count),
    totalQuantity: toQty(r.total_quantity),
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  }));

  return {
    summary: {
      completedCount: Number(summary.completed_count),
      cancelledCount: Number(summary.cancelled_count),
      totalAmount: toMoney(summary.total_amount),
      totalPaid: toMoney(summary.paid_amount),
      totalQuantity: toQty(summary.total_quantity),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// EXPENSES / INCOME
// ---------------------------------------------------------------------
async function expenseIncome(report, query) {
  const isIncome = report === 'income';
  const table = isIncome ? 'income' : 'expenses';
  const dateColumn = isIncome ? 'income_date' : 'expense_date';
  const outKey = isIncome ? 'incomeDate' : 'expenseDate';
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.expenseIncomeReport({
    table,
    dateColumn,
    fromDate: window.fromDate,
    toDate: window.toDate,
    category: query.category,
    search,
    orderBy: resolveOrder(report, sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const items = rows.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    amount: toMoney(r.amount),
    [outKey]: r.entry_date,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  }));

  return {
    summary: {
      count: Number(summary.count),
      totalAmount: toMoney(summary.total_amount),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// PROFIT (delegates to the single profit formula)
// ---------------------------------------------------------------------
async function reportProfit({ fromDate, toDate }) {
  return profitService.list({ fromDate, toDate });
}

// ---------------------------------------------------------------------
// STOCK
// ---------------------------------------------------------------------
async function stock(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.stockReport({
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
    categoryId: query.categoryId,
    search,
    orderBy: resolveOrder('stock', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const items = rows.map((r) => ({
    productId: r.product_id,
    sku: r.sku,
    name: r.name,
    unit: r.unit,
    categoryId: r.category_id,
    categoryName: r.category_name,
    isActive: Boolean(r.is_active),
    currentQuantity: toQty(r.current_quantity),
    purchaseQty: toQty(r.purchase_qty),
    saleQty: toQty(r.sale_qty),
    returnPurchaseQty: toQty(r.return_purchase_qty),
    returnSaleQty: toQty(r.return_sale_qty),
    adjustmentQty: toQty(r.adjustment_qty),
    cancellationReversalQty: toQty(r.cancellation_reversal_qty),
  }));

  return {
    summary: {
      productCount: Number(summary.product_count),
      totalCurrentQuantity: toQty(summary.total_current_quantity),
      transactionsInWindow: Number(summary.total),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// CREDIT
// ---------------------------------------------------------------------
async function credit(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.creditReport({
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
    customerId: query.customerId,
    status: query.status,
    orderBy: resolveOrder('credit', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const items = rows.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    status: r.status,
    creditLimit: toMoney(r.credit_limit),
    currentBalance: toMoney(r.current_balance),
    balanceAsOf: toMoney(r.balance_as_of),
    createdAmount: toMoney(r.created_amount),
    createdCount: Number(r.created_count),
    collectedAmount: toMoney(r.collected_amount),
    collectedCount: Number(r.collected_count),
    reversedAmount: toMoney(r.reversed_amount),
    reversedCount: Number(r.reversed_count),
  }));

  return {
    summary: {
      totalOutstanding: toMoney(summary.total),
      outstandingCustomers: Number(summary.outstanding_customers),
      createdAmount: toMoney(summary.created_amount),
      createdCount: Number(summary.created_count),
      collectedAmount: toMoney(summary.collected_amount),
      collectedCount: Number(summary.collected_count),
      reversedAmount: toMoney(summary.reversed_amount),
      reversedCount: Number(summary.reversed_count),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// CUSTOMERS (per-customer sales summary; walk-in = customerId 0)
// ---------------------------------------------------------------------
async function customers(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.customersReport({
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
    search,
    orderBy: resolveOrder('customers', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const returnsByCustomer = new Map(rows.returnRows.map((r) => [Number(r.customer_id), r]));

  const items = rows.rows.map((r) => {
    const grossSales = toMoney(r.gross_sales);
    const returnedAmount = toMoney(returnsByCustomer.get(Number(r.customer_id))?.returned_amount || 0);
    const ret = returnsByCustomer.get(Number(r.customer_id));
    return {
      customerId: Number(r.customer_id),
      customerName: r.customer_name,
      salesCount: Number(r.sales_count),
      grossSales,
      returnedAmount,
      returnCount: ret ? Number(ret.return_count) : 0,
      netSales: toMoney(Math.max(0, grossSales - returnedAmount)),
      paidAmount: toMoney(r.paid_amount),
      balanceDue: toMoney(r.balance_due),
    };
  });

  const grossSales = toMoney(summary.gross_sales);
  const returnedAmount = toMoney(summary.returned_amount);

  return {
    summary: {
      customersWithSales: Number(summary.customers_with_sales),
      salesCount: Number(summary.sales_count),
      grossSales,
      returnedAmount,
      netSales: toMoney(Math.max(0, grossSales - returnedAmount)),
      paidAmount: toMoney(summary.paid_amount),
      balanceDue: toMoney(summary.balance_due),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// PRODUCTS (per-product sales summary)
// ---------------------------------------------------------------------
async function products(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.productsReport({
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
    categoryId: query.categoryId,
    search,
    orderBy: resolveOrder('products', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const returnsByProduct = new Map(rows.returnRows.map((r) => [Number(r.product_id), r]));

  const items = rows.rows.map((r) => {
    const quantitySold = toQty(r.quantity_sold);
    const quantityReturned = toQty(returnsByProduct.get(Number(r.product_id))?.quantity_returned || 0);
    const grossSales = toMoney(r.gross_sales);
    const returnedAmount = toMoney(returnsByProduct.get(Number(r.product_id))?.returned_amount || 0);
    return {
      productId: Number(r.product_id),
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      categoryId: r.category_id,
      categoryName: r.category_name,
      quantitySold,
      quantityReturned,
      netQuantity: toQty(Math.max(0, quantitySold - quantityReturned)),
      grossSales,
      returnedAmount,
      netSales: toMoney(Math.max(0, grossSales - returnedAmount)),
    };
  });

  const quantitySold = toQty(summary.quantity_sold);
  const quantityReturned = toQty(summary.quantity_returned);

  return {
    summary: {
      productCount: Number(summary.product_count),
      quantitySold,
      quantityReturned,
      netQuantity: toQty(Math.max(0, quantitySold - quantityReturned)),
      grossSales: toMoney(summary.gross_sales),
      returnedAmount: toMoney(summary.returned_amount),
      netSales: toMoney(Math.max(0, toMoney(summary.gross_sales) - toMoney(summary.returned_amount))),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

// ---------------------------------------------------------------------
// SUPPLIERS (per-supplier purchase summary)
// ---------------------------------------------------------------------
async function suppliers(query) {
  const { fromDate, toDate, page, limit, sortBy, sortOrder, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });

  const { summary, rows, total } = await reportsRepository.suppliersReport({
    fromDate: window.fromDate,
    toDate: window.toDate,
    search,
    orderBy: resolveOrder('suppliers', sortBy, sortOrder),
    limit,
    offset: (page - 1) * limit,
  });

  const items = rows.map((r) => ({
    supplierId: Number(r.supplier_id),
    supplierName: r.supplier_name,
    purchaseCount: Number(r.purchase_count),
    cancelledCount: Number(r.cancelled_count),
    totalQuantity: toQty(r.total_quantity),
    totalAmount: toMoney(r.total_amount),
  }));

  return {
    summary: {
      supplierCount: Number(summary.supplier_count),
      completedPurchaseCount: Number(summary.completed_purchase_count),
      cancelledPurchaseCount: Number(summary.cancelled_purchase_count),
      totalQuantity: toQty(summary.total_quantity),
      totalAmount: toMoney(summary.total_amount),
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

module.exports = {
  sales,
  purchases,
  expenses: (query) => expenseIncome('expenses', query),
  income: (query) => expenseIncome('income', query),
  profit: reportProfit,
  stock,
  credit,
  customers,
  products,
  suppliers,
};