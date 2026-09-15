/**
 * Analytics repository - READ-ONLY queries for the /analytics module.
 *
 * The Product Stock & Sales Analytics page reads three real sources and
 * never writes anything:
 *   1. products/categories/stock            - current master + on-hand data
 *   2. sale_items + sales + customers       - exact per-product sale lines
 *      (sale_items.unit_price is the price frozen at sale time)
 *   3. stock_transactions + product_price_history - movement & price ledgers
 *
 * Business agreements with the rest of the system:
 *   - "Active" sales = status IN ('completed','returned'); cancelled sales
 *     are never counted as sold (matches the reports/profit modules).
 *   - Sold quantity / amounts follow the reports `products` netting
 *     convention (gross minus returned).
 *   - Date windows are HALF-OPEN [fromDate, toDateExclusive) on the
 *     business DATETIME columns, exactly like the reports module.
 *   - No locks / FOR UPDATE: pure snapshot reads.
 */

const { pool } = require('../config/db');

const ACTIVE = "s.status IN ('completed','returned')";

const PRODUCT_ROW_SELECT = `
  SELECT
    p.id AS product_id,
    p.sku,
    p.name,
    p.unit,
    p.category_id,
    c.name AS category_name,
    p.image_path,
    p.cost_price AS purchase_price,
    p.selling_price,
    p.reorder_level AS minimum_stock,
    COALESCE(s.quantity, 0) AS current_stock,
    CASE WHEN p.is_active = 1 THEN 'active' ELSE 'inactive' END AS status
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN stock s ON s.product_id = p.id
`;

async function findProductRows({ search, limit, offset }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR c.name LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `${PRODUCT_ROW_SELECT}
     ${whereSql}
     ORDER BY p.name ASC, p.id ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM products p
     JOIN categories c ON c.id = p.category_id
     ${whereSql}`,
    params
  );

  return { rows, total: Number(total) };
}

async function findByProductId(productId) {
  const [rows] = await pool.query(
    `${PRODUCT_ROW_SELECT}
     WHERE p.id = ?`,
    [productId]
  );
  return rows[0] || null;
}

/**
 * Whole-shop stock value / low-stock figures across EVERY product,
 * independent of page limits. Stock is valued at the latest recorded
 * purchase cost (products.cost_price) - the same "cost basis" the
 * profit module uses.
 */
async function findStockValueSummary() {
  const [[summary]] = await pool.query(
    `SELECT
       COUNT(*) AS total_products,
       COALESCE(SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END), 0) AS active_product_count,
       COALESCE(SUM(st.quantity), 0) AS total_quantity,
       COALESCE(SUM(st.quantity * p.cost_price), 0) AS total_stock_value,
       COALESCE(SUM(CASE WHEN COALESCE(st.quantity, 0) <= p.reorder_level THEN 1 ELSE 0 END), 0) AS low_stock_items
     FROM products p
     LEFT JOIN stock st ON st.product_id = p.id`
  );
  return {
    totalProducts: Number(summary.total_products),
    activeProductCount: Number(summary.active_product_count),
    totalQuantity: Number(summary.total_quantity),
    totalStockValue: Number(summary.total_stock_value),
    lowStockItems: Number(summary.low_stock_items),
  };
}

/**
 * Period sales totals for a PAGE of product ids (so the All Products
 * table only pays for the rows it actually shows). Returns a Map of
 * product_id -> { quantitySold, grossSales, quantityReturned, returnedAmount }.
 */
async function findProductsSalesMap({ productIds, fromDate, toDateExclusive }) {
  if (productIds.length === 0) {
    return new Map();
  }

  const placeholders = productIds.map(() => '?').join(',');

  const [soldRows] = await pool.query(
    `SELECT
       si.product_id,
       COUNT(DISTINCT s.id) AS sales_count,
       COALESCE(SUM(si.quantity), 0) AS quantity_sold,
       COALESCE(SUM(si.line_total), 0) AS gross_sales
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE si.product_id IN (${placeholders})
       AND ${ACTIVE}
       AND s.sale_date >= ? AND s.sale_date < ?
     GROUP BY si.product_id`,
    [...productIds, fromDate, toDateExclusive]
  );

  const [returnRows] = await pool.query(
    `SELECT
       sri.product_id,
       COALESCE(SUM(sri.quantity), 0) AS quantity_returned,
       COALESCE(SUM(sri.line_total), 0) AS returned_amount
     FROM sale_return_items sri
     JOIN sale_items si ON si.id = sri.sale_item_id
     JOIN sales s ON s.id = si.sale_id
     WHERE sri.product_id IN (${placeholders})
       AND ${ACTIVE}
       AND s.sale_date >= ? AND s.sale_date < ?
     GROUP BY sri.product_id`,
    [...productIds, fromDate, toDateExclusive]
  );

  const returned = new Map(returnRows.map((r) => [Number(r.product_id), r]));
  const map = new Map();
  for (const row of soldRows) {
    const productId = Number(row.product_id);
    const ret = returned.get(productId);
    const quantitySold = Number(row.quantity_sold);
    const grossSales = Number(row.gross_sales);
    const quantityReturned = ret ? Number(ret.quantity_returned) : 0;
    const returnedAmount = ret ? Number(ret.returned_amount) : 0;
    map.set(productId, {
      salesCount: Number(row.sales_count),
      quantitySold,
      quantityReturned,
      grossSales,
      returnedAmount,
    });
  }
  return map;
}

/**
 * Period sales totals for ONE product (used by the product header).
 */
async function findProductSales({ productId, fromDate, toDateExclusive }) {
  const map = await findProductsSalesMap({
    productIds: [productId],
    fromDate,
    toDateExclusive,
  });
  const entry = map.get(productId);
  return {
    salesCount: entry ? entry.salesCount : 0,
    quantitySold: entry ? entry.quantitySold : 0,
    quantityReturned: entry ? entry.quantityReturned : 0,
    grossSales: entry ? entry.grossSales : 0,
    returnedAmount: entry ? entry.returnedAmount : 0,
  };
}

/**
 * Whole-window sales overview for the summary cards (every product).
 */
async function findWindowOverview({ fromDate, toDateExclusive }) {
  const [[sold]] = await pool.query(
    `SELECT
       COUNT(DISTINCT si.product_id) AS product_count,
       COUNT(DISTINCT s.id) AS sales_count,
       COALESCE(SUM(si.quantity), 0) AS quantity_sold,
       COALESCE(SUM(si.line_total), 0) AS gross_sales
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
    [fromDate, toDateExclusive]
  );

  const [[returned]] = await pool.query(
    `SELECT
       COALESCE(SUM(sri.quantity), 0) AS quantity_returned,
       COALESCE(SUM(sri.line_total), 0) AS returned_amount
     FROM sale_return_items sri
     JOIN sale_items si ON si.id = sri.sale_item_id
     JOIN sales s ON s.id = si.sale_id
     WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
    [fromDate, toDateExclusive]
  );

  return { ...sold, ...returned };
}

async function findPriceHistory({ productId, limit }) {
  const [rows] = await pool.query(
    `SELECT
       ph.id,
       ph.product_id,
       ph.selling_price,
       ph.cost_price,
       ph.effective_from,
       ph.created_by,
       u.username AS created_by_name,
       ph.created_at
     FROM product_price_history ph
     LEFT JOIN users u ON u.id = ph.created_by
     WHERE ph.product_id = ?
     ORDER BY ph.effective_from DESC, ph.id DESC
     LIMIT ?`,
    [productId, limit]
  );
  return rows;
}

/**
 * The price in force AT an exact instant ("as-of" retrieval): the
 * latest ledger row whose effective_from is <= asOfDateTime.
 */
async function findPriceAsOf(productId, asOfDateTime) {
  const [rows] = await pool.query(
    `SELECT
       ph.id,
       ph.product_id,
       ph.selling_price,
       ph.cost_price,
       ph.effective_from
     FROM product_price_history ph
     WHERE ph.product_id = ? AND ph.effective_from <= ?
     ORDER BY ph.effective_from DESC, ph.id DESC
     LIMIT 1`,
    [productId, asOfDateTime]
  );
  return rows[0] || null;
}

/**
 * Exact per-product sale lines: every active sale line of the product in
 * the window, with the real sale timestamp, customer and frozen price.
 */
async function findSaleLines({ productId, fromDate, toDateExclusive, limit, offset }) {
  const where = ['si.product_id = ?', ACTIVE, 's.sale_date >= ?', 's.sale_date < ?'];
  const params = [productId, fromDate, toDateExclusive];
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT
       si.id AS sale_item_id,
       s.id AS sale_id,
       s.invoice_number,
       s.sale_date,
       COALESCE(c.name, 'Walk-in Customer') AS customer_name,
       s.status,
       si.quantity,
       si.unit_price,
       si.discount_amount,
       si.line_total,
       p.unit
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN customers c ON c.id = s.customer_id
     JOIN products p ON p.id = si.product_id
     ${whereSql}
     ORDER BY s.sale_date DESC, si.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     ${whereSql}`,
    params
  );

  return { rows, total: Number(total) };
}

/**
 * "Sales by Time": active sale lines of the product in the window grouped
 * by time-of-day slot (slotHours width). Slots are aggregated across the
 * whole window, so the same table powers a single-day view or a range.
 */
async function findSalesByTime({ productId, fromDate, toDateExclusive, slotHours }) {
  const [rows] = await pool.query(
    `SELECT
       FLOOR(HOUR(s.sale_date) / ?) AS slot_idx,
       COUNT(DISTINCT s.id) AS sales_count,
       COUNT(DISTINCT COALESCE(s.customer_id, 0)) AS customer_count,
       COALESCE(SUM(si.quantity), 0) AS quantity,
       COALESCE(SUM(si.line_total), 0) AS amount
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE si.product_id = ?
       AND ${ACTIVE}
       AND s.sale_date >= ? AND s.sale_date < ?
     GROUP BY slot_idx
     ORDER BY slot_idx ASC`,
    [slotHours, productId, fromDate, toDateExclusive]
  );

  const [[totals]] = await pool.query(
    `SELECT
       COUNT(DISTINCT s.id) AS sales_count,
       COUNT(DISTINCT COALESCE(s.customer_id, 0)) AS customer_count,
       COALESCE(SUM(si.quantity), 0) AS quantity,
       COALESCE(SUM(si.line_total), 0) AS amount
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE si.product_id = ?
       AND ${ACTIVE}
       AND s.sale_date >= ? AND s.sale_date < ?`,
    [productId, fromDate, toDateExclusive]
  );

  return { rows, totals };
}

module.exports = {
  findProductRows,
  findByProductId,
  findStockValueSummary,
  findProductsSalesMap,
  findProductSales,
  findWindowOverview,
  findPriceHistory,
  findPriceAsOf,
  findSaleLines,
  findSalesByTime,
};