/**
 * Reports repository - READ-ONLY report aggregations for the /reports
 * module. It reuses the real append-only ledgers (sales, sale_items,
 * payments, purchases, purchase_items, stock, stock_transactions,
 * credit_transactions, sale_returns/sale_return_items, expenses,
 * income, customers, suppliers, products). No write of any kind is
 * performed and no audit row is created - reports are pure reads.
 *
 * Every report runs ALL of its queries (summary + rows + count) on ONE
 * connection inside a single REPEATABLE-READ transaction so every
 * number in the response comes from the same consistent snapshot. No
 * FOR UPDATE / locks are used, so reports can run concurrently with
 * normal writes without deadlocking (same pattern as profit.repository).
 *
 * Date-window rules (business dates, deterministic):
 *   - sales / stock activity / credit activity use DATETIME/TIMESTAMP
 *     columns with the HALF-OPEN [fromDate, toDateExclusive) boundary so
 *     the whole of toDate counts (toDateExclusive = dayAfter(toDate)).
 *     stock_transactions.created_at and credit_transactions.created_at
 *     are the only dates those ledgers carry, so activity windows use
 *     them by necessity.
 *   - purchases / expenses / income use DATE columns with INCLUSIVE
 *     [fromDate, toDate] boundaries.
 *
 * Summary contract: the `summary` block is always the FULL date-window
 * period total for every customer/product/supplier. Row-level filters
 * (status, paymentType, category, search, page...) scope ONLY the
 * returned `items`, never the period summary.
 */

const { pool } = require('../config/db');

const ACTIVE = "s.status IN ('completed','returned')";

async function snapshot(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
// SALES
// ---------------------------------------------------------------------
async function salesReport({ fromDate, toDate, toDateExclusive, status, paymentType, customerId, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const where = ['s.sale_date >= ?', 's.sale_date < ?'];
    const params = [fromDate, toDateExclusive];

    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (paymentType) {
      where.push('s.payment_type = ?');
      params.push(paymentType);
    }
    if (customerId) {
      where.push('s.customer_id = ?');
      params.push(customerId);
    }
    if (search) {
      where.push("(s.invoice_number LIKE ? OR COALESCE(c.name, 'Walk-in Customer') LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Summary (full date window - never scoped by row filters).
    const [[summary]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN ${ACTIVE} THEN 1 ELSE 0 END), 0) AS sales_count,
         COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
         COALESCE(SUM(CASE WHEN ${ACTIVE} THEN s.total_amount ELSE 0 END), 0) AS gross_revenue
       FROM sales s
       WHERE s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    const [[returns]] = await conn.query(
      `SELECT
         COUNT(DISTINCT r.sale_id) AS returned_sale_count,
         COALESCE(SUM(r.refund_amount), 0) AS refund_total
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    const [[cash]] = await conn.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS cash_received
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       WHERE p.payment_type = 'sale_payment'
         AND ${ACTIVE}
         AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    const [[credits]] = await conn.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS credit_outstanding FROM customers`
    );

    const [rows] = await conn.query(
      `SELECT
         s.id, s.invoice_number, s.sale_date, s.customer_id,
         COALESCE(c.name, 'Walk-in Customer') AS customer_name,
         s.payment_type, s.total_amount, s.paid_amount, s.balance_due, s.status,
         u.username AS created_by_name, s.created_at
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.created_by
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       ${whereSql}`,
      params
    );

    return {
      summary: { ...summary, ...returns, ...cash, ...credits },
      rows,
      total,
    };
  });
}

// ---------------------------------------------------------------------
// PURCHASES
// ---------------------------------------------------------------------
async function purchasesReport({ fromDate, toDate, status, supplierId, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const where = ['pu.purchase_date >= ?', 'pu.purchase_date <= ?'];
    const params = [fromDate, toDate];

    if (status) {
      where.push('pu.status = ?');
      params.push(status);
    }
    if (supplierId) {
      where.push('pu.supplier_id = ?');
      params.push(supplierId);
    }
    if (search) {
      where.push("(pu.invoice_number LIKE ? OR s.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Summary (full date window - never scoped by row filters).
    const [[summary]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
         COALESCE(SUM(CASE WHEN pu.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
         COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN pu.total_amount ELSE 0 END), 0) AS total_amount,
         COALESCE(SUM(CASE WHEN pu.status = 'completed' THEN pu.paid_amount ELSE 0 END), 0) AS paid_amount
       FROM purchases pu
       WHERE pu.purchase_date >= ? AND pu.purchase_date <= ?`,
      [fromDate, toDate]
    );

    const [[quantityRow]] = await conn.query(
      `SELECT COALESCE(SUM(pi.quantity), 0) AS total_quantity
       FROM purchase_items pi
       JOIN purchases pu ON pu.id = pi.purchase_id
       WHERE pu.status = 'completed' AND pu.purchase_date >= ? AND pu.purchase_date <= ?`,
      [fromDate, toDate]
    );

    const [rows] = await conn.query(
      `SELECT
         pu.id, pu.invoice_number, pu.purchase_date, pu.supplier_id,
         s.name AS supplier_name, pu.status, pu.total_amount, pu.paid_amount,
         pu.notes, u.username AS created_by_name, pu.created_at,
         COUNT(pi.id) AS item_count,
         COALESCE(SUM(pi.quantity), 0) AS total_quantity
       FROM purchases pu
       JOIN suppliers s ON s.id = pu.supplier_id
       LEFT JOIN purchase_items pi ON pi.purchase_id = pu.id
       LEFT JOIN users u ON u.id = pu.created_by
       ${whereSql}
       GROUP BY pu.id, pu.invoice_number, pu.purchase_date, pu.supplier_id,
                s.name, pu.status, pu.total_amount, pu.paid_amount, pu.notes,
                u.username, pu.created_at
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM purchases pu
       JOIN suppliers s ON s.id = pu.supplier_id
       ${whereSql}`,
      params
    );

    return {
      summary: { ...summary, ...quantityRow },
      rows,
      total,
    };
  });
}

// ---------------------------------------------------------------------
// EXPENSES / INCOME (identical shape, mirrored tables)
// ---------------------------------------------------------------------
async function expenseIncomeReport({ table, dateColumn, fromDate, toDate, category, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const where = [`${dateColumn} >= ?`, `${dateColumn} <= ?`];
    const params = [fromDate, toDate];

    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (search) {
      where.push('(description LIKE ? OR category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [[summary]] = await conn.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total_amount
       FROM ${table} WHERE ${dateColumn} >= ? AND ${dateColumn} <= ?`,
      [fromDate, toDate]
    );

    const [rows] = await conn.query(
      `SELECT e.id, e.category, e.description, e.amount, e.${dateColumn} AS entry_date,
              u.username AS created_by_name, e.created_at
       FROM ${table} e
       JOIN users u ON u.id = e.created_by
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM ${table} e ${whereSql}`,
      params
    );

    return { summary, rows, total };
  });
}

// ---------------------------------------------------------------------
// STOCK (current on-hand from stock + period movement from the ledger)
// ---------------------------------------------------------------------
async function stockReport({ fromDate, toDateExclusive, categoryId, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const where = [];
    const params = [];

    if (categoryId) {
      where.push('p.category_id = ?');
      params.push(categoryId);
    }
    if (search) {
      where.push('(p.name LIKE ? OR p.sku LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[summary]] = await conn.query(
      `SELECT COUNT(*) AS product_count,
              COALESCE(SUM(st.quantity), 0) AS total_current_quantity
       FROM products p
       LEFT JOIN stock st ON st.product_id = p.id
       ${whereSql}`,
      params
    );

    const [[activityCount]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM stock_transactions
       WHERE created_at >= ? AND created_at < ?`,
      [fromDate, toDateExclusive]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM products p ${whereSql}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT
         p.id AS product_id, p.sku, p.name, p.unit, p.category_id,
         c.name AS category_name, p.is_active,
         COALESCE(st.quantity, 0) AS current_quantity,
         COALESCE(act.purchase_qty, 0) AS purchase_qty,
         COALESCE(act.sale_qty, 0) AS sale_qty,
         COALESCE(act.return_purchase_qty, 0) AS return_purchase_qty,
         COALESCE(act.return_sale_qty, 0) AS return_sale_qty,
         COALESCE(act.adjustment_qty, 0) AS adjustment_qty,
         COALESCE(act.cancellation_reversal_qty, 0) AS cancellation_reversal_qty,
         COALESCE(act.damage_qty, 0) AS damage_qty
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN stock st ON st.product_id = p.id
       LEFT JOIN (
         SELECT product_id,
           COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN quantity_change ELSE 0 END), 0) AS purchase_qty,
           COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN quantity_change ELSE 0 END), 0) AS sale_qty,
           COALESCE(SUM(CASE WHEN transaction_type = 'return_purchase' THEN quantity_change ELSE 0 END), 0) AS return_purchase_qty,
           COALESCE(SUM(CASE WHEN transaction_type = 'return_sale' THEN quantity_change ELSE 0 END), 0) AS return_sale_qty,
           COALESCE(SUM(CASE WHEN transaction_type = 'adjustment' THEN quantity_change ELSE 0 END), 0) AS adjustment_qty,
           COALESCE(SUM(CASE WHEN transaction_type = 'cancellation_reversal' THEN quantity_change ELSE 0 END), 0) AS cancellation_reversal_qty,
           COALESCE(SUM(CASE WHEN transaction_type = 'damage' THEN quantity_change ELSE 0 END), 0) AS damage_qty
         FROM stock_transactions
         WHERE created_at >= ? AND created_at < ?
         GROUP BY product_id
       ) act ON act.product_id = p.id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [fromDate, toDateExclusive, ...params, limit, offset]
    );

    return { summary: { ...summary, ...activityCount }, rows, total };
  });
}

// ---------------------------------------------------------------------
// CREDIT (per-customer window activity + live + as-of outstanding)
// ---------------------------------------------------------------------
async function creditReport({ fromDate, toDateExclusive, customerId, status, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    // Period summary (whole window, all customers).
    const [[windowAgg]] = await conn.query(
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

    // Live snapshot of every customer's outstanding balance.
    const [[outstanding]] = await conn.query(
      `SELECT COALESCE(SUM(current_balance), 0) AS total,
              COALESCE(SUM(CASE WHEN current_balance > 0 THEN 1 ELSE 0 END), 0) AS outstanding_customers
       FROM customers`
    );

    const where = [];
    const params = [];

    if (customerId) {
      where.push('cust.id = ?');
      params.push(customerId);
    }
    if (status) {
      where.push('cust.status = ?');
      params.push(status);
    }
    const scope = [
      'cust.current_balance > 0',
      'cust.credit_limit > 0',
      'EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.customer_id = cust.id)',
    ];
    const whereSql = `WHERE (${scope.join(' OR ')})${where.length ? ` AND ${where.join(' AND ')}` : ''}`;

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM customers cust ${whereSql}`,
      params
    );

    const [rows] = await conn.query(
      `SELECT
         cust.id AS customer_id, cust.name, cust.status, cust.credit_limit, cust.current_balance,
         COALESCE(win.created_amount, 0) AS created_amount,
         COALESCE(win.created_count, 0) AS created_count,
         COALESCE(win.collected_amount, 0) AS collected_amount,
         COALESCE(win.collected_count, 0) AS collected_count,
         COALESCE(win.reversed_amount, 0) AS reversed_amount,
         COALESCE(win.reversed_count, 0) AS reversed_count,
         COALESCE(asof.balance_as_of, 0) AS balance_as_of
       FROM customers cust
       LEFT JOIN (
         SELECT customer_id,
           COALESCE(SUM(CASE WHEN transaction_type = 'created' THEN amount ELSE 0 END), 0) AS created_amount,
           COALESCE(SUM(CASE WHEN transaction_type = 'created' THEN 1 ELSE 0 END), 0) AS created_count,
           COALESCE(SUM(CASE WHEN transaction_type = 'collected' THEN amount ELSE 0 END), 0) AS collected_amount,
           COALESCE(SUM(CASE WHEN transaction_type = 'collected' THEN 1 ELSE 0 END), 0) AS collected_count,
           COALESCE(SUM(CASE WHEN transaction_type = 'credit_reversal' THEN amount ELSE 0 END), 0) AS reversed_amount,
           COALESCE(SUM(CASE WHEN transaction_type = 'credit_reversal' THEN 1 ELSE 0 END), 0) AS reversed_count
         FROM credit_transactions
         WHERE created_at >= ? AND created_at < ?
         GROUP BY customer_id
       ) win ON win.customer_id = cust.id
       LEFT JOIN (
         SELECT customer_id,
           COALESCE(SUM(CASE WHEN transaction_type = 'created' THEN amount ELSE -amount END), 0) AS balance_as_of
         FROM credit_transactions
         WHERE created_at < ?
         GROUP BY customer_id
       ) asof ON asof.customer_id = cust.id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [fromDate, toDateExclusive, toDateExclusive, ...params, limit, offset]
    );

    return { summary: { ...windowAgg, ...outstanding }, rows, total };
  });
}

// ---------------------------------------------------------------------
// CUSTOMERS (per-customer sales summary)
// ---------------------------------------------------------------------
async function customersReport({ fromDate, toDateExclusive, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const having = search ? `HAVING customer_name LIKE ?` : '';
    const havingParams = search ? [`%${search}%`] : [];

    const [rows] = await conn.query(
      `SELECT
         COALESCE(s.customer_id, 0) AS customer_id,
         COALESCE(c.name, 'Walk-in Customer') AS customer_name,
         COUNT(*) AS sales_count,
         COALESCE(SUM(s.total_amount), 0) AS gross_sales,
         COALESCE(SUM(s.paid_amount), 0) AS paid_amount,
         COALESCE(SUM(s.balance_due), 0) AS balance_due
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY COALESCE(s.customer_id, 0), COALESCE(c.name, 'Walk-in Customer')
       ${having}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [fromDate, toDateExclusive, ...havingParams, limit, offset]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT COALESCE(s.customer_id, 0) AS cid, COALESCE(c.name, 'Walk-in Customer') AS customer_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
         GROUP BY COALESCE(s.customer_id, 0), COALESCE(c.name, 'Walk-in Customer')
         HAVING customer_name LIKE ?
       ) t`,
      search ? [fromDate, toDateExclusive, `%${search}%`] : [fromDate, toDateExclusive, '%']
    );

    const [returnRows] = await conn.query(
      `SELECT
         COALESCE(s.customer_id, 0) AS customer_id,
         COUNT(DISTINCT r.id) AS return_count,
         COALESCE(SUM(r.refund_amount), 0) AS returned_amount
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?
       GROUP BY COALESCE(s.customer_id, 0)`,
      [fromDate, toDateExclusive]
    );

    const [[summary]] = await conn.query(
      `SELECT COUNT(DISTINCT COALESCE(s.customer_id, 0)) AS customers_with_sales,
              COUNT(*) AS sales_count,
              COALESCE(SUM(s.total_amount), 0) AS gross_sales,
              COALESCE(SUM(s.paid_amount), 0) AS paid_amount,
              COALESCE(SUM(s.balance_due), 0) AS balance_due
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    const [[returnsSummary]] = await conn.query(
      `SELECT COALESCE(SUM(r.refund_amount), 0) AS returned_amount
       FROM sale_returns r
       JOIN sales s ON s.id = r.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    return { summary: { ...summary, ...returnsSummary }, rows: { rows, returnRows }, total };
  });
}

// ---------------------------------------------------------------------
// PRODUCTS (per-product sales summary)
// ---------------------------------------------------------------------
async function productsReport({ fromDate, toDateExclusive, categoryId, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const where = [
      `${ACTIVE}`,
      's.sale_date >= ?',
      's.sale_date < ?',
    ];
    const params = [fromDate, toDateExclusive];

    let productFilter = '';
    let filterParams = [];

    if (categoryId) {
      productFilter += ' AND p.category_id = ?';
      filterParams.push(categoryId);
    }
    if (search) {
      productFilter += ' AND (p.name LIKE ? OR p.sku LIKE ?)';
      filterParams.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await conn.query(
      `SELECT
         p.id AS product_id, p.sku, p.name, p.unit, p.category_id,
         c.name AS category_name,
         COALESCE(SUM(si.quantity), 0) AS quantity_sold,
         COALESCE(SUM(si.line_total), 0) AS gross_sales
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where.join(' AND ')}${productFilter}
       GROUP BY p.id, p.sku, p.name, p.unit, p.category_id, c.name
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, ...filterParams, limit, offset]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT si.product_id
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE ${where.join(' AND ')}${productFilter}
         GROUP BY si.product_id
       ) t`,
      [...params, ...filterParams]
    );

    const [returnRows] = await conn.query(
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

    const [[summary]] = await conn.query(
      `SELECT
         COUNT(DISTINCT si.product_id) AS product_count,
         COALESCE(SUM(si.quantity), 0) AS quantity_sold,
         COALESCE(SUM(si.line_total), 0) AS gross_sales
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    const [[returnsSummary]] = await conn.query(
      `SELECT
         COALESCE(SUM(sri.quantity), 0) AS quantity_returned,
         COALESCE(SUM(sri.line_total), 0) AS returned_amount
       FROM sale_return_items sri
       JOIN sale_items si ON si.id = sri.sale_item_id
       JOIN sales s ON s.id = si.sale_id
       WHERE ${ACTIVE} AND s.sale_date >= ? AND s.sale_date < ?`,
      [fromDate, toDateExclusive]
    );

    return { summary: { ...summary, ...returnsSummary }, rows: { rows, returnRows }, total };
  });
}

// ---------------------------------------------------------------------
// SUPPLIERS (per-supplier purchase summary)
// ---------------------------------------------------------------------
async function suppliersReport({ fromDate, toDate, search, orderBy, limit, offset }) {
  return snapshot(async (conn) => {
    const params = [];

    if (search) {
      params.push(`%${search}%`);
    }

    const [rows] = await conn.query(
      `SELECT
         su.id AS supplier_id, su.name AS supplier_name,
         COALESCE(agg.purchase_count, 0) AS purchase_count,
         COALESCE(agg.cancelled_count, 0) AS cancelled_count,
         COALESCE(piag.total_quantity, 0) AS total_quantity,
         COALESCE(agg.total_amount, 0) AS total_amount
       FROM suppliers su
       LEFT JOIN (
         SELECT pu.supplier_id,
           SUM(CASE WHEN pu.status = 'completed' THEN 1 ELSE 0 END) AS purchase_count,
           SUM(CASE WHEN pu.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
           SUM(CASE WHEN pu.status = 'completed' THEN pu.total_amount ELSE 0 END) AS total_amount
         FROM purchases pu
         WHERE pu.purchase_date >= ? AND pu.purchase_date <= ?
         GROUP BY pu.supplier_id
       ) agg ON agg.supplier_id = su.id
       LEFT JOIN (
         SELECT pu.supplier_id, SUM(pi.quantity) AS total_quantity
         FROM purchase_items pi
         JOIN purchases pu ON pu.id = pi.purchase_id
         WHERE pu.status = 'completed' AND pu.purchase_date >= ? AND pu.purchase_date <= ?
         GROUP BY pu.supplier_id
       ) piag ON piag.supplier_id = su.id
       WHERE agg.supplier_id IS NOT NULL${search ? ' AND su.name LIKE ?' : ''}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [fromDate, toDate, fromDate, toDate, ...params, limit, offset]
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM (SELECT pu.supplier_id
             FROM purchases pu
             JOIN suppliers su ON su.id = pu.supplier_id
             WHERE pu.purchase_date >= ? AND pu.purchase_date <= ?${search ? ' AND su.name LIKE ?' : ''}
             GROUP BY pu.supplier_id) t`,
      [fromDate, toDate, ...params]
    );

    const [[summary]] = await conn.query(
      `SELECT
         COUNT(DISTINCT pu.supplier_id) AS supplier_count,
         SUM(CASE WHEN pu.status = 'completed' THEN 1 ELSE 0 END) AS completed_purchase_count,
         SUM(CASE WHEN pu.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_purchase_count,
         SUM(CASE WHEN pu.status = 'completed' THEN pu.total_amount ELSE 0 END) AS total_amount
       FROM purchases pu
       WHERE pu.purchase_date >= ? AND pu.purchase_date <= ?`,
      [fromDate, toDate]
    );

    const [[quantitySummary]] = await conn.query(
      `SELECT COALESCE(SUM(pi.quantity), 0) AS total_quantity
       FROM purchase_items pi
       JOIN purchases pu ON pu.id = pi.purchase_id
       WHERE pu.status = 'completed' AND pu.purchase_date >= ? AND pu.purchase_date <= ?`,
      [fromDate, toDate]
    );

    return { summary: { ...summary, ...quantitySummary }, rows, total };
  });
}

module.exports = {
  salesReport,
  purchasesReport,
  expenseIncomeReport,
  stockReport,
  creditReport,
  customersReport,
  productsReport,
  suppliersReport,
};