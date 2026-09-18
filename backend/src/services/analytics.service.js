/**
 * Analytics service - orchestrates the /analytics module (Product Stock
 * & Sales Analytics).
 *
 * Read-only. Everything is composed from the real ledgers:
 *   - product master + current stock (products/categories/stock)
 *   - exact sale lines (sale_items + sales + customers), with the
 *     frozen-at-sale-time unit price
 *   - stock movement (stock_transactions) - the same source the Stock
 *     module's UI uses
 *   - product price history (product_price_history) - the "price on
 *     date X" answer is a point-in-time lookup, never derived from the
 *     current price.
 *
 * Date windows reuse profit.service.resolveWindow (strict normalizeDate,
 * half-open [fromDate, toDateExclusive)) so every figure agrees with the
 * reports/profit modules.
 *
 * DTO rule (mirrors reports.service): money 2dp, quantity 3dp, zero
 * defaults, no NaN/undefined ever reaches the response.
 */

const ApiError = require('../utils/ApiError');
const analyticsRepository = require('../repositories/analytics.repository');
const stockRepository = require('../repositories/stock.repository');
const profitService = require('./profit.service');

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function toQty(value) {
  return Math.round(Number(value) * 1000) / 1000;
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
    search: query.search || undefined,
  };
}

async function ensureProduct(productId) {
  const product = await analyticsRepository.findByProductId(productId);
  if (!product) {
    throw ApiError.notFound(`Product ${productId} not found`);
  }
  return product;
}

/**
 * GET /analytics/products
 * Power for both the summary cards and the All Products table. The
 * `summary` block is the FULL window across every product; the page
 * filters (search/pagination) only scope `items`.
 */
async function listProducts(query) {
  const { fromDate, toDate, page, limit, search } = defaults(query);
  const window = profitService.resolveWindow({ fromDate, toDate });
  const offset = (page - 1) * limit;

  const { rows, total } = await analyticsRepository.findProductRows({
    search,
    limit,
    offset,
  });

  const stockSummary = await analyticsRepository.findStockValueSummary();
  const overview = await analyticsRepository.findWindowOverview({
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
  });

  const salesMap = await analyticsRepository.findProductsSalesMap({
    productIds: rows.map((row) => row.product_id),
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
  });

  const quantitySold = toQty(overview.quantity_sold);
  const quantityReturned = toQty(overview.quantity_returned);
  const grossSales = toMoney(overview.gross_sales);
  const returnedAmount = toMoney(overview.returned_amount);

  const items = rows.map((row) => {
    const period = salesMap.get(Number(row.product_id)) || {
      salesCount: 0,
      quantitySold: 0,
      quantityReturned: 0,
      grossSales: 0,
      returnedAmount: 0,
    };
    return { ...mapProductRow(row, period) };
  });

  return {
    summary: {
      totalProducts: Number(stockSummary.totalProducts),
      activeProductCount: Number(stockSummary.activeProductCount),
      totalStockQuantity: toQty(stockSummary.totalQuantity),
      totalStockValue: toMoney(stockSummary.totalStockValue),
      lowStockItems: Number(stockSummary.lowStockItems),
      period: {
        productCount: Number(overview.product_count),
        salesCount: Number(overview.sales_count),
        quantitySold,
        quantityReturned,
        netQuantity: toQty(Math.max(0, quantitySold - quantityReturned)),
        grossSales,
        returnedAmount,
        netSales: toMoney(Math.max(0, grossSales - returnedAmount)),
      },
    },
    items,
    pagination: pagination(page, limit, total),
  };
}

function mapProductRow(row, period) {
  const quantitySold = toQty(period.quantitySold);
  const quantityReturned = toQty(period.quantityReturned);
  const grossSales = toMoney(period.grossSales);
  const returnedAmount = toMoney(period.returnedAmount);
  return {
    productId: Number(row.product_id),
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    categoryId: row.category_id ? Number(row.category_id) : null,
    categoryName: row.category_name,
    imagePath: row.image_path || null,
    purchasePrice: toMoney(row.purchase_price),
    sellingPrice: toMoney(row.selling_price),
    minimumStock: toQty(row.minimum_stock),
    currentStock: toQty(row.current_stock),
    status: row.status,
    salesCount: Number(period.salesCount),
    quantitySold,
    quantityReturned,
    netQuantity: toQty(Math.max(0, quantitySold - quantityReturned)),
    grossSales,
    returnedAmount,
    netSales: toMoney(Math.max(0, grossSales - returnedAmount)),
  };
}

/**
 * GET /analytics/products/:productId
 * Product header + period sales + full price history (all-time, honest).
 */
async function getProduct(query, productId) {
  const product = await ensureProduct(productId);
  const window = profitService.resolveWindow({ fromDate: query.fromDate, toDate: query.toDate });

  const period = await analyticsRepository.findProductSales({
    productId,
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
  });

  const history = await analyticsRepository.findPriceHistory({ productId, limit: 100 });

  return {
    product: mapProductRow(product, {
      salesCount: period.salesCount,
      quantitySold: period.quantitySold,
      quantityReturned: period.quantityReturned,
      grossSales: period.grossSales,
      returnedAmount: period.returnedAmount,
    }),
    period: {
      salesCount: Number(period.salesCount),
      quantitySold: toQty(period.quantitySold),
      quantityReturned: toQty(period.quantityReturned),
      netQuantity: toQty(Math.max(0, Number(period.quantitySold) - Number(period.quantityReturned))),
      grossSales: toMoney(period.grossSales),
      returnedAmount: toMoney(period.returnedAmount),
      netSales: toMoney(Math.max(0, Number(period.grossSales) - Number(period.returnedAmount))),
    },
    priceHistory: history.map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      sellingPrice: toMoney(row.selling_price),
      costPrice: toMoney(row.cost_price),
      effectiveFrom: row.effective_from,
      createdByName: row.created_by_name || null,
      createdAt: row.created_at,
    })),
  };
}

/**
 * GET /analytics/products/:productId/sales
 * Exact recent sale lines (time / customer / qty / price / total).
 */
async function listSales(query, productId) {
  await ensureProduct(productId);
  const window = profitService.resolveWindow(query);

  const { rows, total } = await analyticsRepository.findSaleLines({
    productId,
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
    limit: query.limit || 20,
    offset: ((query.page || 1) - 1) * (query.limit || 20),
  });

  const items = rows.map((row) => ({
    saleItemId: Number(row.sale_item_id),
    saleId: Number(row.sale_id),
    invoiceNumber: row.invoice_number,
    saleDate: row.sale_date,
    customerName: row.customer_name,
    status: row.status,
    quantity: toQty(row.quantity),
    unitPrice: toMoney(row.unit_price),
    discountAmount: toMoney(row.discount_amount),
    lineTotal: toMoney(row.line_total),
    unit: row.unit,
  }));

  return {
    items,
    pagination: pagination(query.page || 1, query.limit || 20, total),
  };
}

/**
 * GET /analytics/products/:productId/sales-by-time
 * Two modes, both reading the real sale ledger:
 *   - DATE + PRODUCT mode (query.date): one selected calendar day, hourly
 *     buckets for ONLY the hours that actually have sales (no empty bars,
 *     no fixed 6-hour / 7-day window).
 *   - legacy window + slot mode (query.fromDate/toDate/slotHours): kept for
 *     backward compatibility with existing consumers.
 */
async function salesByTime(query, productId) {
  await ensureProduct(productId);

  if (query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      throw ApiError.badRequest('date must be a valid date (YYYY-MM-DD)');
    }

    const { rows, totals } = await analyticsRepository.findSalesByDate({
      productId,
      date: query.date,
    });

    const slots = rows.map((row) => {
      const hour = Number(row.hour_idx);
      const quantity = toQty(row.quantity);
      const amount = toMoney(row.amount);
      return {
        slotLabel: `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`,
        hour,
        time: `${String(hour).padStart(2, '0')}:00`,
        quantity,
        salesCount: Number(row.sales_count),
        customerCount: Number(row.customer_count),
        amount,
        avgPrice: quantity > 0 ? toMoney(amount / quantity) : 0,
      };
    });

    const totalQuantity = toQty(totals.quantity);
    return {
      date: query.date,
      slots,
      totals: {
        quantity: totalQuantity,
        salesCount: Number(totals.sales_count),
        customerCount: Number(totals.customer_count),
        amount: toMoney(totals.amount),
        avgPrice: totalQuantity > 0 ? toMoney(Number(totals.amount) / totalQuantity) : 0,
      },
    };
  }

  const window = profitService.resolveWindow(query);
  const slotHours = query.slotHours || 2;
  const slotCount = Math.max(1, Math.min(6, slotHours));

  const { rows, totals } = await analyticsRepository.findSalesByTime({
    productId,
    fromDate: window.fromDate,
    toDateExclusive: window.toDateExclusive,
    slotHours: slotCount,
  });

  const byIdx = new Map(rows.map((row) => [Number(row.slot_idx), row]));
  const perCount = Math.floor(24 / slotCount);
  const slots = [];

  for (let idx = 0; idx < perCount; idx += 1) {
    const startHour = idx * slotCount;
    let endHour = startHour + slotCount;
    if (endHour > 24) endHour = 24;
    const row = byIdx.get(idx);
    const quantity = row ? Number(row.quantity) : 0;
    const amount = row ? Number(row.amount) : 0;
    slots.push({
      slotLabel: `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`,
      quantity: toQty(quantity),
      salesCount: row ? Number(row.sales_count) : 0,
      customerCount: row ? Number(row.customer_count) : 0,
      amount: toMoney(amount),
      avgPrice: quantity > 0 ? toMoney(amount / quantity) : 0,
    });
  }

  const totalQuantity = toQty(totals.quantity);
  return {
    slotHours: slotCount,
    slots,
    totals: {
      quantity: totalQuantity,
      salesCount: Number(totals.sales_count),
      customerCount: Number(totals.customer_count),
      amount: toMoney(totals.amount),
      avgPrice: totalQuantity > 0 ? toMoney(Number(totals.amount) / totalQuantity) : 0,
    },
  };
}

/**
 * GET /analytics/products/:productId/price-history
 * All price history rows for a product (full history, newest first).
 */
async function priceHistory(query, productId) {
  await ensureProduct(productId);
  const { rows, total } = await (async () => {
    const rows = await analyticsRepository.findPriceHistory({ productId, limit: 100 });
    return { rows, total: rows.length };
  })();

  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      sellingPrice: toMoney(row.selling_price),
      costPrice: toMoney(row.cost_price),
      effectiveFrom: row.effective_from,
      createdByName: row.created_by_name || null,
      createdAt: row.created_at,
    })),
    pagination: pagination(1, rows.length || 1, total),
  };
}

/**
 * GET /analytics/products/:productId/price-as-of?date=YYYY-MM-DD
 * The price applicable ON a chosen date (point-in-time lookup). Without
 * `date`, resolves as of right now. Returns null pricing when the ledger
 * has no row on or before the date (product did not exist / no price
 * recorded) - never an invented value.
 */
async function priceAsOf(query, productId) {
  await ensureProduct(productId);

  const asOf =
    query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
      ? `${query.date} 23:59:59`
      : null;

  if (query.date && !asOf) {
    throw ApiError.badRequest('date must be a valid date');
  }

  const snapshot = await analyticsRepository.findPriceAsOf(
    productId,
    asOf || new Date().toISOString().replace('T', ' ').slice(0, 19)
  );

  return {
    asOfDate: query.date || null,
    effectiveFrom: snapshot ? snapshot.effective_from : null,
    sellingPrice: snapshot ? toMoney(snapshot.selling_price) : null,
    costPrice: snapshot ? toMoney(snapshot.cost_price) : null,
  };
}

/**
 * GET /analytics/products/:productId/stock-transactions
 * The product's stock movement ledger (same source as the Stock module),
 * so the analytics page never needs a second movement implementation.
 */
async function stockTransactions(query, productId) {
  await ensureProduct(productId);
  const window = profitService.resolveWindow(query);
  const limit = query.limit || 20;
  const page = query.page || 1;

  const { rows, total } = await stockRepository.findTransactions({
    productId,
    type: query.type,
    fromDate: window.fromDate,
    toDate: window.toDate,
    limit,
    offset: (page - 1) * limit,
  });

  const items = rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.product_id),
    productName: row.product_name,
    transactionType: row.transaction_type,
    quantityChange: toQty(row.quantity_change),
    quantityBefore: toQty(row.quantity_before),
    quantityAfter: toQty(row.quantity_after),
    referenceTable: row.reference_table,
    referenceId: row.reference_id,
    note: row.note,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
  }));

  return {
    items,
    pagination: pagination(page, limit, total),
  };
}

module.exports = {
  listProducts,
  getProduct,
  listSales,
  salesByTime,
  priceHistory,
  priceAsOf,
  stockTransactions,
};