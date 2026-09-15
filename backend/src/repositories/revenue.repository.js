/**
 * Revenue repository - READ-ONLY aggregations for the /revenue dashboard.
 *
 * Every query is an aggregate SELECT over the real append-only ledgers
 * (sales, sale_items, sale_returns/sale_return_items, payments, products,
 * categories). No write of any kind is performed and no audit row is
 * created.
 *
 * All queries run on ONE connection inside a single REPEATABLE-READ
 * transaction (the engine default for InnoDB) so the whole revenue
 * dashboard comes from one consistent snapshot. No FOR UPDATE / locks -
 * same pattern as profit.repository / dashboard.repository.
 *
 * Date-window rule (business dates, deterministic):
 *   - sales / sale_items / returns / payments use the DATETIME sale_date
 *     with the established HALF-OPEN [fromDate, toDateExclusive)
 *     boundary so the whole of toDate counts.
 *   - "Active" sales = status IN ('completed','returned'); cancelled
 *     sales are never revenue (matches /profit exactly).
 *   - Grouped dates are formatted to 'YYYY-MM-DD' in the database so the
 *     returned day keys can never shift across a timezone.
 */

const { pool } = require('../config/db');

const ACTIVE = `s.status IN ('completed','returned')`;

async function getSummary({ fromDate, toDateExclusive }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Per-day revenue + order count for active in-window sales.
    const [dailySales] = await conn.query(
      `SELECT
         DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date,
         COUNT(DISTINCT s.id) AS sales_count,
         COALESCE(SUM(s.total_amount), 0) AS gross_revenue
       FROM sales s
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY DATE_FORMAT(s.sale_date, '%Y-%m-%d')`,
      [fromDate, toDateExclusive]
    );

    // Per-day refunds on active in-window sales.
    const [dailyReturns] = await conn.query(
      `SELECT
         DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date,
         COALESCE(SUM(r.refund_amount), 0) AS refund_amount
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY DATE_FORMAT(s.sale_date, '%Y-%m-%d')`,
      [fromDate, toDateExclusive]
    );

    // Paid portion of revenue grouped by the real payment method
    // (payments ledger; 'sale_payment' rows only, so credit collections
    // and purchase payments can never inflate revenue).
    const [paymentMethods] = await conn.query(
      `SELECT
         p.payment_method,
         COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       WHERE p.payment_type = 'sale_payment'
         AND ${ACTIVE}
         AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY p.payment_method`,
      [fromDate, toDateExclusive]
    );

    // Unpaid (credit) portion of revenue = total - paid for each active
    // in-window sale with an outstanding balance. Paid-by-method plus the
    // credit portion reconciles exactly to gross sales revenue.
    const [[creditPortion]] = await conn.query(
      `SELECT COALESCE(SUM(GREATEST(s.total_amount - s.paid_amount, 0)), 0) AS amount
       FROM sales s
       WHERE ${ACTIVE}
         AND s.sale_date >= ? AND s.sale_date < ?
         AND GREATEST(s.total_amount - s.paid_amount, 0) > 0`,
      [fromDate, toDateExclusive]
    );

    // Revenue by category (gross) from the frozen sale-time line totals.
    const [categoryGross] = await conn.query(
      `SELECT
         c.name AS category_name,
         COALESCE(SUM(si.line_total), 0) AS gross_amount
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY c.name`,
      [fromDate, toDateExclusive]
    );

    // Category attribution of returned amounts (net sales per category =
    // gross minus returned, matching the reports/products convention).
    const [categoryReturns] = await conn.query(
      `SELECT
         c.name AS category_name,
         COALESCE(SUM(sri.line_total), 0) AS returned_amount
       FROM sale_return_items sri
       JOIN sale_items si ON si.id = sri.sale_item_id
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY c.name`,
      [fromDate, toDateExclusive]
    );

    // Top revenue products: gross minus returned (cancelled excluded) -
    // same netting convention as the dashboard / reports/products.
    const [topProductRows] = await conn.query(
      `SELECT
         p.id AS product_id, p.sku, p.name, p.unit,
         COALESCE(SUM(si.quantity), 0) AS quantity_sold,
         COALESCE(SUM(si.line_total), 0) AS gross_sales
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY p.id, p.sku, p.name, p.unit`,
      [fromDate, toDateExclusive]
    );

    const [productReturns] = await conn.query(
      `SELECT
         sri.product_id,
         COALESCE(SUM(sri.quantity), 0) AS quantity_returned,
         COALESCE(SUM(sri.line_total), 0) AS returned_amount
       FROM sale_return_items sri
       JOIN sale_items si ON si.id = sri.sale_item_id
       JOIN sales s ON s.id = si.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY sri.product_id`,
      [fromDate, toDateExclusive]
    );

    await conn.commit();

    return {
      dailySales,
      dailyReturns,
      paymentMethods,
      creditPortion: Number(creditPortion.amount) || 0,
      categoryGross,
      categoryReturns,
      topProductRows,
      productReturns,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getSummary };