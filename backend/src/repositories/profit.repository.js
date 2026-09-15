/**
 * Profit repository - READ-ONLY financial aggregations for the profit /
 * financial-summary module.
 *
 * Every query here is an aggregate SELECT over the existing ledgers
 * (sales, sale_items, payments, purchases, purchase_items,
 * sale_returns/sale_return_items, expenses, income, customers). No
 * write of any kind is performed.
 *
 * All queries run on ONE connection inside a single transaction so they
 * share a REPEATABLE-READ consistent snapshot: a concurrent multi-write
 * (e.g. a sale + its stock movement + its credit row) is never seen
 * half-applied. No FOR UPDATE / row locks are used, so the summary can
 * run concurrently with normal writes without deadlocking.
 *
 * Date window rule (business dates, deterministic):
 *   - sales      filtered by sale_date  (DATETIME) - half-open
 *                [fromDate, toDateExclusive) so the whole of toDate counts
 *   - expenses   filtered by expense_date (DATE)    [fromDate, toDate]
 *   - income     filtered by income_date (DATE)      [fromDate, toDate]
 *   - purchases  used only as the COGS cost basis with
 *                purchase_date <= toDate (completed purchases only)
 */

const { pool } = require('../config/db');

const ACTIVE_SALE_STATUSES = `status IN ('completed','returned')`;

function saleWindow() {
  return `
    FROM sales s
    WHERE s.sale_date >= ? AND s.sale_date < ?
  `;
}

async function getSummary({ fromDate, toDate, toDateExclusive }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Revenue + counts of active (non-cancelled) and cancelled sales.
    const [[sales]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN ${ACTIVE_SALE_STATUSES} THEN 1 ELSE 0 END), 0) AS active_count,
         COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
         COALESCE(SUM(CASE WHEN ${ACTIVE_SALE_STATUSES} THEN s.total_amount ELSE 0 END), 0) AS gross_revenue
       ${saleWindow()}`,
      [fromDate, toDateExclusive]
    );

    // Refunds on in-window active sales (return reduction is attributed
    // to the sale's own date; a fully returned sale keeps its original
    // total_amount so the refund amount fully nets it out).
    const [[returns]] = await conn.query(
      `SELECT
         COALESCE(SUM(r.refund_amount), 0) AS refund_total,
         COUNT(DISTINCT r.sale_id) AS returned_sale_count
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE ${ACTIVE_SALE_STATUSES} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    // Net sold quantities per product (sold minus returned) for in-window
    // active sales - feeds COGS.
    const [soldRows] = await conn.query(
      `SELECT si.product_id, COALESCE(SUM(si.quantity), 0) AS sold_qty
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE ${ACTIVE_SALE_STATUSES} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY si.product_id`,
      [fromDate, toDateExclusive]
    );

    const [returnedRows] = await conn.query(
      `SELECT sri.product_id, COALESCE(SUM(sri.quantity), 0) AS returned_qty
       FROM sale_return_items sri
       JOIN sale_items si ON si.id = sri.sale_item_id
       JOIN sales s ON s.id = si.sale_id
       WHERE ${ACTIVE_SALE_STATUSES} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY sri.product_id`,
      [fromDate, toDateExclusive]
    );

    // COGS cost basis: weighted-average cost per product from COMPLETED
    // purchases up to toDate. The schema stores per-batch cost on
    // purchase_items but has no linking between a sold unit and its
    // purchase batch, so FIFO/LIFO/lot-exact COGS is not supported;
    // WAC is the defensible method the existing data supports.
    const [costBasis] = await conn.query(
      `SELECT pi.product_id,
              COALESCE(SUM(pi.line_total), 0) AS total_cost,
              COALESCE(SUM(pi.quantity), 0) AS total_qty
       FROM purchase_items pi
       JOIN purchases pu ON pu.id = pi.purchase_id
       WHERE pu.status = 'completed' AND pu.purchase_date <= ?
       GROUP BY pi.product_id`,
      [toDate]
    );

    const [[expenses]] = await conn.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE expense_date >= ? AND expense_date <= ?`,
      [fromDate, toDate]
    );

    const [[income]] = await conn.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total
       FROM income
       WHERE income_date >= ? AND income_date <= ?`,
      [fromDate, toDate]
    );

    // Damage / wastage loss in the window: damaged quantities (negative
    // ledger changes) valued at the product's recorded purchase cost
    // (products.cost_price - real existing cost data, never invented).
    // Damage is a pure stock-reduction movement keyed by its actual
    // transaction timestamp, so the window is [fromDate, toDateExclusive).
    const [[damage]] = await conn.query(
      `SELECT COUNT(*) AS c,
              COALESCE(SUM(-st.quantity_change * p.cost_price), 0) AS total
       FROM stock_transactions st
       JOIN products p ON p.id = st.product_id
       WHERE st.transaction_type = 'damage'
         AND st.created_at >= ? AND st.created_at < ?`,
      [fromDate, toDateExclusive]
    );

    // Money actually received from in-window active sales (append-only
    // payments ledger). Credit collections ('credit_payment') and
    // purchase payments ('purchase_payment') are excluded by design, so
    // collections never inflate revenue; refund payouts are not payment
    // rows in this system (the refund fact is sale_returns.refund_amount).
    const [[cash]] = await conn.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       WHERE p.payment_type = 'sale_payment'
         AND ${ACTIVE_SALE_STATUSES}
         AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    // Live snapshot of what customers currently owe (maintained only by
    // the credit module on customers.current_balance).
    const [[credits]] = await conn.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS total FROM customers`
    );

    await conn.commit();

    return {
      sales,
      returns,
      soldRows,
      returnedRows,
      costBasis,
      expenses,
      income,
      damage,
      cash,
      credits,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getSummary };