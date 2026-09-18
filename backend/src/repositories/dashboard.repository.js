/**
 * Dashboard repository - READ-ONLY aggregations for the /dashboard
 * module. It reuses the real append-only ledgers (sales, sale_items,
 * payments, purchases, purchase_items, stock, stock_transactions,
 * credit_transactions, sale_returns/sale_return_items, expenses,
 * income, customers, products, suppliers). No write of any kind is
 * performed and no audit row is created.
 *
 * Every query runs on ONE connection inside a single REPEATABLE-READ
 * transaction (the engine default for InnoDB) so the whole dashboard
 * comes from one consistent snapshot. No FOR UPDATE / locks are used,
 * so the dashboard can run concurrently with normal writes without
 * deadlocking (same pattern as profit.repository / reports.repository).
 *
 * Date-window rules (business dates, deterministic):
 *   - sales / payments / stock activity / credit activity use
 *     DATETIME/TIMESTAMP columns with the established HALF-OPEN
 *     [fromDate, toDateExclusive) boundary so the whole of toDate
 *     counts (toDateExclusive = dayAfter(toDate)).
 *   - purchases / expenses / income use DATE columns with the INCLUSIVE
 *     [fromDate, toDate] boundary.
 *   - stock_transactions.created_at and credit_transactions.created_at
 *     are the only dates those ledgers carry, so their period movement
 *     windows use them by necessity (documented in 8C).
 *
 * The PROFIT section is NOT computed here - it is delegated to
 * profit.service.list() (the Phase 8B single source of truth) so the
 * dashboard profit always agrees with GET /api/v1/profit exactly.
 */

const { pool } = require('../config/db');

const ACTIVE = `s.status IN ('completed','returned')`;

async function getDashboard({ fromDate, toDate, toDateExclusive, top }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Low-stock default threshold (settings) - per-product reorder_level
    // wins, otherwise this default applies (seed default '5').
    const [[setting]] = await conn.query(
      `SELECT CAST(setting_value AS UNSIGNED) AS v
       FROM settings
       WHERE setting_key = 'low_stock_threshold'`
    );
    const lowStockDefault = Number(setting && setting.v);

    // ---- SALES KPI ----
    const [[sales]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN ${ACTIVE} THEN 1 ELSE 0 END), 0) AS active_count,
         COALESCE(SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
         COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
         COALESCE(SUM(CASE WHEN s.status = 'returned' THEN 1 ELSE 0 END), 0) AS returned_count,
         COALESCE(SUM(CASE WHEN ${ACTIVE} THEN s.total_amount ELSE 0 END), 0) AS gross_revenue,
         COALESCE(SUM(CASE WHEN ${ACTIVE} AND s.payment_type = 'credit' THEN s.total_amount ELSE 0 END), 0) AS credit_sales,
         COALESCE(SUM(CASE WHEN ${ACTIVE} THEN s.balance_due ELSE 0 END), 0) AS outstanding_from_sales
       FROM sales s
       WHERE s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    // ---- SALES RETURNS (refund reduction for in-window active sales) ----
    const [[returns]] = await conn.query(
      `SELECT COALESCE(SUM(r.refund_amount), 0) AS refund_total
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    // ---- CASH RECEIVED (sale payments only; credit collections and
    // purchase payments are excluded by the payment_type enum) ----
    const [[cash]] = await conn.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS cash_received
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       WHERE p.payment_type = 'sale_payment'
         AND ${ACTIVE}
         AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    // ---- PURCHASES (DATE inclusive; completed only for totals) ----
    const [[purchases]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
         COALESCE(SUM(CASE WHEN pu.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
         COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN pu.total_amount ELSE 0 END), 0) AS total_amount,
         COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN pu.total_amount - pu.paid_amount ELSE 0 END), 0) AS due_amount,
         COALESCE(SUM(CASE WHEN pu.status = 'completed' AND pu.payment_status IN ('unpaid','partial') THEN 1 ELSE 0 END), 0) AS unpaid_count
       FROM purchases pu
       WHERE pu.purchase_date >= ? AND pu.purchase_date <= ?`,
      [fromDate, toDate]
    );

    const [[purchaseQty]] = await conn.query(
      `SELECT COALESCE(SUM(pi.quantity), 0) AS quantity
       FROM purchase_items pi
       JOIN purchases pu ON pu.id = pi.purchase_id
       WHERE pu.status = 'completed' AND pu.purchase_date >= ? AND pu.purchase_date <= ?`,
      [fromDate, toDate]
    );

    // ---- EXPENSES / INCOME (DATE inclusive) ----
    const [[expenses]] = await conn.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE expense_date >= ? AND expense_date <= ?`,
      [fromDate, toDate]
    );

    const [[income]] = await conn.query(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total
       FROM income WHERE income_date >= ? AND income_date <= ?`,
      [fromDate, toDate]
    );

    // ---- STOCK KPI (current snapshot + low stock + value) ----
    const [[stock]] = await conn.query(
      `SELECT
         COUNT(*) AS total_products,
         COALESCE(SUM(CASE WHEN st.quantity > 0 THEN 1 ELSE 0 END), 0) AS products_with_stock,
         COALESCE(SUM(st.quantity), 0) AS total_on_hand,
         COALESCE(SUM(CASE WHEN COALESCE(st.quantity, 0) <= COALESCE(NULLIF(p.reorder_level, 0), ?) AND COALESCE(st.quantity, 0) > 0 THEN 1 ELSE 0 END), 0) AS low_stock_count,
         COALESCE(SUM(CASE WHEN COALESCE(st.quantity, 0) > COALESCE(NULLIF(p.reorder_level, 0), ?) THEN 1 ELSE 0 END), 0) AS in_stock_count,
         COALESCE(SUM(CASE WHEN COALESCE(st.quantity, 0) <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count,
         COALESCE(SUM(COALESCE(st.quantity, 0) * p.cost_price), 0) AS inventory_value
       FROM products p
       LEFT JOIN stock st ON st.product_id = p.id`,
      [lowStockDefault, lowStockDefault]
    );

    // ---- STOCK PERIOD MOVEMENT (by created_at, half-open) ----
    const [movements] = await conn.query(
      `SELECT transaction_type,
              COALESCE(SUM(ABS(quantity_change)), 0) AS abs_qty
       FROM stock_transactions
       WHERE created_at >= ? AND created_at < ?
       GROUP BY transaction_type`,
      [fromDate, toDateExclusive]
    );

    // ---- CREDIT PERIOD ACTIVITY (by created_at, half-open) ----
    const [[creditActivity]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'created' THEN amount ELSE 0 END), 0) AS created_amount,
         COALESCE(SUM(CASE WHEN transaction_type = 'created' THEN 1 ELSE 0 END), 0) AS created_count,
         COALESCE(SUM(CASE WHEN transaction_type = 'collected' THEN amount ELSE 0 END), 0) AS collected_amount,
         COALESCE(SUM(CASE WHEN transaction_type = 'collected' THEN 1 ELSE 0 END), 0) AS collected_count,
         COALESCE(SUM(CASE WHEN transaction_type = 'credit_reversal' THEN amount ELSE 0 END), 0) AS reversed_amount,
         COALESCE(SUM(CASE WHEN transaction_type = 'credit_reversal' THEN 1 ELSE 0 END), 0) AS reversed_count
       FROM credit_transactions
       WHERE created_at >= ? AND created_at < ?`,
      [fromDate, toDateExclusive]
    );

    // ---- CREDIT LIVE OUTSTANDING (customers.current_balance) ----
    const [[creditOutstanding]] = await conn.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS total,
              COALESCE(SUM(CASE WHEN current_balance > 0 THEN 1 ELSE 0 END), 0) AS outstanding_customers
       FROM customers`
    );

    // ---- TOP PRODUCTS (active in-window sales; cancelled excluded) ----
    const [topProductRows] = await conn.query(
      `SELECT
         p.id AS product_id, p.sku, p.name,
         COALESCE(SUM(si.quantity), 0) AS quantity_sold,
         COALESCE(SUM(si.line_total), 0) AS gross_sales
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY p.id, p.sku, p.name`,
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

    // ---- TOP CUSTOMERS (named customers only, never walk-in) ----
    const [topCustomerRows] = await conn.query(
      `SELECT
         s.customer_id, c.name, c.phone,
         COUNT(*) AS sales_count,
         COALESCE(SUM(s.total_amount), 0) AS gross_sales,
         COALESCE(SUM(s.paid_amount), 0) AS paid_amount
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       WHERE s.customer_id IS NOT NULL AND ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY s.customer_id, c.name, c.phone`,
      [fromDate, toDateExclusive]
    );

    const [customerReturns] = await conn.query(
      `SELECT
         s.customer_id,
         COALESCE(SUM(r.refund_amount), 0) AS returned_amount
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE s.customer_id IS NOT NULL AND ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY s.customer_id`,
      [fromDate, toDateExclusive]
    );

    // ---- HOURLY SALES (single-day windows only) ----
    // Powers the Dashboard Sales Overview date picker: net sales per ACTUAL
    // sale hour of the selected calendar day (gross minus returns on the
    // sale's own sale_date, mirroring the KPI section). Multi-day windows
    // keep this empty - the date-picker view is always a single day.
    let hourlySales = { gross: [], returns: [] };
    if (fromDate === toDate) {
      const [hourlyGross] = await conn.query(
        `SELECT HOUR(s.sale_date) AS hour_idx,
                COALESCE(SUM(s.total_amount), 0) AS gross
         FROM sales s
         WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
         GROUP BY hour_idx
         ORDER BY hour_idx`,
        [fromDate, toDateExclusive]
      );
      const [hourlyReturns] = await conn.query(
        `SELECT HOUR(s.sale_date) AS hour_idx,
                COALESCE(SUM(r.refund_amount), 0) AS refunds
         FROM sale_returns r
         JOIN sales s ON s.id = r.sale_id
         WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
         GROUP BY hour_idx
         ORDER BY hour_idx`,
        [fromDate, toDateExclusive]
      );
      hourlySales = { gross: hourlyGross, returns: hourlyReturns };
    }

    // ---- RECENT SALES / PURCHASES ----
    const [recentSales] = await conn.query(
      `SELECT
         s.id, s.invoice_number, s.sale_date, s.customer_id,
         COALESCE(c.name, 'Walk-in Customer') AS customer_name,
         s.total_amount, s.paid_amount, s.balance_due, s.status, s.payment_type,
         (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       ORDER BY s.sale_date DESC, s.id DESC
       LIMIT ?`,
      [top]
    );

    const [recentPurchases] = await conn.query(
      `SELECT
         pu.id, pu.invoice_number, pu.purchase_date, pu.supplier_id,
         su.name AS supplier_name, pu.total_amount, pu.paid_amount, pu.status
       FROM purchases pu
       JOIN suppliers su ON su.id = pu.supplier_id
       ORDER BY pu.purchase_date DESC, pu.id DESC
       LIMIT ?`,
      [top]
    );

    // ---- LOW STOCK ALERTS (uses the same effective-min rule as the KPI) ----
    const [lowStockList] = await conn.query(
      `SELECT
         p.id AS product_id, p.name, p.unit,
         COALESCE(st.quantity, 0) AS quantity,
         COALESCE(NULLIF(p.reorder_level, 0), ?) AS effective_min,
         CASE WHEN COALESCE(st.quantity, 0) <= 0 THEN 'out' ELSE 'low' END AS stock_status
       FROM products p
       LEFT JOIN stock st ON st.product_id = p.id
       WHERE COALESCE(st.quantity, 0) <= COALESCE(NULLIF(p.reorder_level, 0), ?)
       ORDER BY COALESCE(st.quantity, 0) ASC, p.name ASC
       LIMIT 8`,
      [lowStockDefault, lowStockDefault]
    );

    // ---- RECENT STOCK MOVEMENTS (latest ledger rows) ----
    const [recentMovementRows] = await conn.query(
      `SELECT
         tx.id, tx.product_id, p.name AS product_name, p.unit,
         tx.transaction_type, tx.quantity_change, tx.quantity_after, tx.note,
         tx.created_at
       FROM stock_transactions tx
       JOIN products p ON p.id = tx.product_id
       ORDER BY tx.created_at DESC, tx.id DESC
       LIMIT 6`
    );

    // ---- CREDIT: top customers by live outstanding balance ----
    const [creditTopCustomers] = await conn.query(
      `SELECT c.id AS customer_id, c.name, c.phone, c.current_balance
       FROM customers c
       WHERE c.current_balance > 0
       ORDER BY c.current_balance DESC
       LIMIT 5`
    );

    // ---- PURCHASE ORDERS: pending (not yet received / cancelled) ----
    const [pendingOrderRows] = await conn.query(
      `SELECT
         po.id, po.po_number, po.status, po.order_date, po.expected_delivery_date,
         su.name AS supplier_name,
         COUNT(poi.id) AS item_count
       FROM purchase_orders po
       JOIN suppliers su ON su.id = po.supplier_id
       LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       WHERE po.status IN ('draft','sent','partially_received')
       GROUP BY po.id, po.po_number, po.status, po.order_date, po.expected_delivery_date, su.name
       ORDER BY (po.expected_delivery_date IS NULL) ASC, po.expected_delivery_date ASC, po.order_date ASC
       LIMIT 3`
    );

    // ---- EXPENSES: top categories in window ----
    const [expenseCategoryRows] = await conn.query(
      `SELECT category, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE expense_date >= ? AND expense_date <= ?
       GROUP BY category
       ORDER BY total DESC
       LIMIT 5`,
      [fromDate, toDate]
    );

    await conn.commit();

    return {
      lowStockDefault,
      sales,
      returns,
      cash,
      purchases,
      purchaseQty: purchaseQty.quantity,
      expenses,
      income,
      stock,
      movements,
      creditActivity,
      creditOutstanding,
      topProductRows,
      productReturns,
      topCustomerRows,
      customerReturns,
      hourlySales,
      recentSales,
      recentPurchases,
      lowStockList,
      recentMovementRows,
      creditTopCustomers,
      pendingOrderRows,
      expenseCategoryRows,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getDashboard };