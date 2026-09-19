/**
 * Sale repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly.
 *
 * Uses the existing database/schema.sql tables (plus the Phase 7C
 * return tables, see below):
 *   sales        - POS header: totals, payment_type (cash/credit/partial),
 *                  status (completed/cancelled/returned), UNIQUE
 *                  invoice_number, generated balance_due column.
 *   sale_items   - line items: product-scoped (NO variant_id), quantity
 *                  DECIMAL(10,3), unit_price frozen at time of sale,
 *                  line_total is a generated STORED column
 *                  (quantity * unit_price - discount_amount).
 *   payments     - insert-only ledger; multiple rows per sale so SPLIT
 *                  payments are schema-supported.
 *   sale_returns / sale_return_items - Phase 7C return audit: one
 *                  header per return event, items frozen at the ORIGINAL
 *                  sale unit_price (see sale_return_items.line_total).
 *   stock + stock_transactions - sale stock movement is written through
 *                  stockRepository.applyChange() so the deduction and
 *                  its signed ledger row ('sale', negative change) use
 *                  the exact same code path as every other movement;
 *                  cancellations restore via 'cancellation_reversal'
 *                  (reference_table 'sales') and returns via 'return_sale'.
 *   credit_transactions - a cancelled or returned sale that created
 *                  credit reverses the undone portion through
 *                  creditRepository.reverseForSale() (inside THIS
 *                  transaction) - customers.current_balance is owned by
 *                  the credit module and never touched directly here.
 *
 * Phase 7C operations:
 *   cancel(saleId)    - full void of a completed sale. Restores the
 *                       SOLD-FOR-RETURNED remainder of every line to
 *                       stock, reverses the created credit not already
 *                       reversed (cap: current balance), flips status
 *                       to 'cancelled'. Idempotency guard: already
 *                       cancelled/returned sales are rejected.
 *   returnGoods(...)  - partial or full goods return of a completed
 *                       sale. Validates per-item that requested +
 *                       already-returned <= sold inside the locked
 *                       transaction, restores stock ('return_sale'),
 *                       records sale_returns + sale_return_items,
 *                       reverses credit by the refundable portion, and
 *                       flips status to 'returned' only when every line
 *                       is fully returned.
 *
 * Atomicity: the entire sale (header + items + payments + stock
 * deduction + stock transaction rows) is ONE database transaction. Any
 * failure rolls back everything - a partial sale or a partial stock
 * deduction can never be left behind.
 *
 * Concurrency: product stock rows are read with SELECT ... FOR UPDATE
 * inside this transaction BEFORE anything is inserted, so two
 * simultaneous sales serialize on the same product and overselling is
 * impossible even if the frontend sent stale quantities. The sale row
 * itself is locked FOR UPDATE in cancel/return so concurrent returns
 * (and a return racing a cancellation) serialize and can never
 * over-return or double-restore.
 */

const { randomUUID } = require('crypto');
const { pool } = require('../config/db');
const stockRepository = require('./stock.repository');
const creditRepository = require('./credit.repository');
const ApiError = require('../utils/ApiError');

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const BASE_SELECT = `
  SELECT
    s.id,
    s.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    s.invoice_number,
    s.sale_date,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.cgst_amount,
    s.sgst_amount,
    s.igst_amount,
    s.total_amount,
    s.paid_amount,
    s.balance_due,
    s.payment_type,
    s.status,
    s.created_by,
    u.username AS created_by_name,
    s.created_at,
    s.updated_at
  FROM sales s
  LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN users u ON u.id = s.created_by
`;

/**
 * Backend/database-driven search + filter + pagination.
 *
 * Search: invoice number, customer name, customer phone.
 * Filters: customerId, fromDate / toDate (sale_date range, inclusive),
 * status, paymentType.
 */
async function findAll({
  search,
  customerId,
  fromDate,
  toDate,
  status,
  paymentType,
  limit,
  offset,
}) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      s.invoice_number LIKE ?
      OR c.name LIKE ?
      OR c.phone LIKE ?
    )`);
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (customerId) {
    where.push('s.customer_id = ?');
    params.push(customerId);
  }

  if (fromDate) {
    where.push('s.sale_date >= ?');
    params.push(`${fromDate} 00:00:00`);
  }

  if (toDate) {
    where.push('s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(toDate);
  }

  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }

  if (paymentType) {
    where.push('s.payment_type = ?');
    params.push(paymentType);
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY s.sale_date DESC, s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE s.id = ?`,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const [items] = await pool.query(
    `SELECT
       si.id,
       si.product_id,
       p.sku AS product_code,
       p.name AS product_name,
       p.unit,
       si.quantity,
       si.unit_price,
       si.discount_amount,
       si.line_total,
       si.tax_code,
       si.cgst_rate,
       si.sgst_rate,
       si.igst_rate,
       si.cgst_amount,
       si.sgst_amount,
       si.igst_amount
     FROM sale_items si
     JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ?
     ORDER BY si.id ASC`,
    [id]
  );

  const [payments] = await pool.query(
    `SELECT
       pt.id,
       pt.sale_id,
       pt.customer_id,
       pt.amount,
       pt.payment_method,
       pt.payment_type,
       pt.payment_date,
       pt.notes,
       pt.received_by,
       u.username AS received_by_name
     FROM payments pt
     LEFT JOIN users u ON u.id = pt.received_by
     WHERE pt.sale_id = ?
     ORDER BY pt.id ASC`,
    [id]
  );

  const [returns] = await pool.query(
    `SELECT
       sr.id,
       sr.return_date,
       sr.reason,
       sr.refund_amount,
       sr.created_by,
       u.username AS created_by_name
     FROM sale_returns sr
     LEFT JOIN users u ON u.id = sr.created_by
     WHERE sr.sale_id = ?
     ORDER BY sr.id ASC`,
    [id]
  );

  const [returnItems] = await pool.query(
    `SELECT
       sri.id,
       sri.return_id,
       sri.sale_item_id,
       sri.product_id,
       p.sku AS product_code,
       p.name AS product_name,
       p.unit,
       sri.quantity,
       sri.unit_price,
       sri.discount_amount,
       sri.line_total
     FROM sale_return_items sri
     JOIN products p ON p.id = sri.product_id
     JOIN sale_returns sr ON sr.id = sri.return_id
     WHERE sr.sale_id = ?
     ORDER BY sri.id ASC`,
    [id]
  );
  const returnItemsByReturn = new Map();
  for (const item of returnItems) {
    const key = Number(item.return_id);
    if (!returnItemsByReturn.has(key)) returnItemsByReturn.set(key, []);
    returnItemsByReturn.get(key).push(item);
  }
  for (const ret of returns) {
    ret.items = returnItemsByReturn.get(Number(ret.id)) || [];
  }

  return { ...rows[0], items, payments, returns };
}

/**
 * Atomic sale creation. `totals` are computed by the service from the
 * database's selling prices; this repository is responsible for the
 * ACID part and for stock safety.
 *
 *  1. Re-validates products exist and are active inside the transaction
 *  2. Reads stock rows FOR UPDATE (concurrency-safe oversell guard)
 *  3. Verifies enough stock for every item
 *  4. Inserts the sale header, then sets its final invoice number
 *     (prefix + auto-increment id - always unique, never frontend text)
 *  5. Inserts the sale_items rows
 *  6. Inserts the payment row(s) (multiple rows = split payments)
 *  7. Deducts stock + writes the credit stock_transactions ledger rows
 *  8. COMMITs - anything before that rolls back entirely
 */
async function create({
  customerId,
  saleDate,
  invoicePrefix,
  subtotal,
  discountAmount,
  taxAmount,
  cgstAmount,
  sgstAmount,
  igstAmount,
  total,
  paidAmount,
  paymentType,
  items,
  payments,
  creditRequested,
  createdBy,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Unique product ids in ascending order so concurrent multi-item
    // sales acquire stock locks in a consistent order (no deadlocks).
    const productIds = [...new Set(items.map((item) => item.productId))].sort(
      (a, b) => a - b
    );

    // Resolve + validate products authoritatively inside the transaction.
    const placeholders = productIds.map(() => '?').join(',');
    const [productRows] = await connection.query(
      `SELECT id, name, is_active
       FROM products
       WHERE id IN (${placeholders})`,
      productIds
    );
    const productMap = new Map(
      productRows.map((row) => [Number(row.id), row])
    );
    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product) {
        throw ApiError.notFound(`Product ${productId} not found`);
      }
      if (product.is_active !== 1) {
        throw ApiError.badRequest(
          `Product "${product.name}" is inactive and cannot be sold`
        );
      }
    }

    // Lock the stock rows of every product being sold, then verify the
    // requested quantities are available. Products with no stock row
    // simply have 0 available.
    const [stockRows] = await connection.query(
      `SELECT product_id, quantity
       FROM stock
       WHERE product_id IN (${placeholders})
       FOR UPDATE`,
      productIds
    );
    const stockMap = new Map(
      stockRows.map((row) => [Number(row.product_id), Number(row.quantity)])
    );
    for (const item of items) {
      const available = stockMap.get(item.productId) ?? 0;
      if (available < item.quantity) {
        const product = productMap.get(item.productId);
        throw ApiError.badRequest(
          `Insufficient stock for "${product.name}" (available ${available}, requested ${item.quantity})`
        );
      }
    }

    // Insert the header with a temporary placeholder invoice (the final
    // invoice number needs the auto-increment id to be unique), then
    // set the real number inside the same transaction.
const [saleResult] = await connection.query(
      `INSERT INTO sales
         (customer_id, invoice_number, sale_date, subtotal, discount_amount,
          tax_amount, cgst_amount, sgst_amount, igst_amount,
          total_amount, paid_amount, payment_type, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        customerId || null,
        `TMP-${randomUUID()}`,
        saleDate,
        subtotal,
        discountAmount,
        taxAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        total,
        paidAmount,
        paymentType,
        createdBy,
      ]
    );
    const saleId = saleResult.insertId;

    // Allocate the next gap-free invoice number for this prefix. The
    // SELECT ... FOR UPDATE locks the counter row (inside the same
    // transaction that already locked stock above), so two cashiers can
    // never be given the same number; we then UPDATE next_invoice and
    // write the final number right here - same transaction, so a failed /
    // rolled-back sale never burns a number (INV-001, INV-002, ... stay
    // contiguous for the prefix).
    const prefix = String(invoicePrefix ?? '').trim();
    if (!prefix) {
      throw ApiError.internal('invoice_prefix is not configured');
    }
    const [seqRow] = await connection.query(
      `SELECT next_invoice
       FROM invoice_sequencens
       WHERE prefix = ?
       FOR UPDATE`,
      [prefix]
    );
    const nextInvoice =
      seqRow.length > 0 ? Number(seqRow[0].next_invoice) : 1;
    if (seqRow.length === 0) {
      await connection.query(
        `INSERT INTO invoice_sequencens (prefix, next_invoice) VALUES (?, ?)`,
        [prefix, nextInvoice + 1]
      );
    } else {
      await connection.query(
        `UPDATE invoice_sequencens
            SET next_invoice = next_invoice + 1
          WHERE prefix = ?`,
        [prefix]
      );
    }
    const invoiceNumber = `${prefix}${String(nextInvoice).padStart(3, '0')}`;
    await connection.query(
      `UPDATE sales SET invoice_number = ? WHERE id = ?`,
      [invoiceNumber, saleId]
    );

    for (const item of items) {
      await connection.query(
        `INSERT INTO sale_items
           (sale_id, product_id, quantity, unit_price, discount_amount,
            tax_code, cgst_rate, sgst_rate, igst_rate,
            cgst_amount, sgst_amount, igst_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.discountAmount,
          item.taxCode || null,
          item.cgstRate,
          item.sgstRate,
          item.igstRate,
          item.cgstAmount,
          item.sgstAmount,
          item.igstAmount,
        ]
      );
    }

    for (const payment of payments) {
      await connection.query(
        `INSERT INTO payments
           (sale_id, customer_id, amount, payment_method, payment_type, notes, received_by)
         VALUES (?, ?, ?, ?, 'sale_payment', ?, ?)`,
        [
          saleId,
          customerId || null,
          payment.amount,
          payment.method,
          payment.notes || null,
          createdBy,
        ]
      );
    }

    if (creditRequested) {
      await creditRepository.createFromSale({
        connection,
        saleId,
        createdBy,
      });
    }

    for (const item of items) {
      await stockRepository.applyChange({
        conn: connection,
        productId: item.productId,
        change: -item.quantity,
        transactionType: 'sale',
        note: 'Sale completed',
        referenceTable: 'sales',
        referenceId: saleId,
        createdBy,
      });
    }

    await connection.commit();

    return findById(saleId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Load already-returned quantities per sale_item for one sale. Must be
 * called from inside the caller's transaction so the numbers are stable
 * for the duration of the cancel/return.
 */
async function getReturnedByItem(conn, saleId) {
  const [rows] = await conn.query(
    `SELECT sri.sale_item_id, COALESCE(SUM(sri.quantity), 0) AS returned_quantity
     FROM sale_return_items sri
     JOIN sale_returns sr ON sr.id = sri.return_id
     WHERE sr.sale_id = ?
     GROUP BY sri.sale_item_id`,
    [saleId]
  );
  return new Map(rows.map((row) => [Number(row.sale_item_id), Number(row.returned_quantity)]));
}

/**
 * Sum of created credit and of already-reversed credit for one sale
 * ('credit_reversal' rows). Used to compute what a cancel/return may
 * still undo.
 */
async function getCreditCreatedAndReversed(conn, saleId) {
  const [[createdRow]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS created
     FROM credit_transactions
     WHERE sale_id = ? AND transaction_type = 'created'`,
    [saleId]
  );
  const [[reversedRow]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS reversed
     FROM credit_transactions
     WHERE sale_id = ? AND transaction_type = 'credit_reversal'`,
    [saleId]
  );
  return { created: toMoney(createdRow.created), reversed: toMoney(reversedRow.reversed) };
}

/**
 * Reverse the still-outstanding credit of a sale (created minus already
 * reversed), capped at the customer's current balance. Returns null when
 * there is nothing to reverse.
 */
async function reverseRemainingCredit({ conn, sale, note, createdBy }) {
  if (!sale.customer_id) {
    return null;
  }
  const { created, reversed } = await getCreditCreatedAndReversed(conn, sale.id);
  const remainingCredit = toMoney(Math.max(0, created - reversed));
  if (!(remainingCredit > 0)) {
    return null;
  }
  return creditRepository.reverseForSale({
    conn,
    sale,
    amount: remainingCredit,
    note,
    createdBy,
  });
}

/**
 * Full-void cancellation of a completed sale.
 *   - Only 'completed' sales can be cancelled; 'cancelled' and
 *     'returned' sales are rejected (repeat cancellation is not
 *     idempotent-on-purpose: it would double-restore stock).
 *   - Restores to stock the SOLD-FOR-RETURNED remainder of every line
 *     (lines already covered by a return were restored at that time).
 *   - Reverses the sale's created credit that is not already reversed.
 *   - Flips status to 'cancelled' - the sale stays in history with its
 *     original invoice_number, items and payment rows intact.
 */
async function cancel({ saleId, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [saleRows] = await connection.query(
      `SELECT id, customer_id, invoice_number, status
       FROM sales
       WHERE id = ?
       FOR UPDATE`,
      [saleId]
    );
    const sale = saleRows[0];

    if (!sale) {
      throw ApiError.notFound(`Sale ${saleId} not found`);
    }
    if (sale.status === 'cancelled') {
      throw ApiError.badRequest('Sale is already cancelled');
    }
    if (sale.status === 'returned') {
      throw ApiError.badRequest('A fully returned sale is already closed and cannot be cancelled');
    }

    const [itemRows] = await connection.query(
      `SELECT id, product_id, quantity
       FROM sale_items
       WHERE sale_id = ?
       ORDER BY id ASC`,
      [saleId]
    );

    if (itemRows.length === 0) {
      throw ApiError.badRequest('This sale has no items and cannot be cancelled');
    }

    const returnedByItem = await getReturnedByItem(connection, saleId);

    for (const item of itemRows) {
      const alreadyReturned = returnedByItem.get(Number(item.id)) ?? 0;
      const remaining = Number(item.quantity) - alreadyReturned;
      if (remaining > 0) {
        await stockRepository.applyChange({
          conn: connection,
          productId: Number(item.product_id),
          change: remaining,
          transactionType: 'cancellation_reversal',
          note: 'Sale cancelled',
          referenceTable: 'sales',
          referenceId: saleId,
          createdBy,
        });
      }
    }

    const creditReversal = await reverseRemainingCredit({
      conn: connection,
      sale,
      note: `Credit reversed - sale ${sale.invoice_number} cancelled`,
      createdBy,
    });

    await connection.query(
      `UPDATE sales SET status = 'cancelled' WHERE id = ?`,
      [saleId]
    );

    await connection.commit();

    return { ...(await findById(saleId)), creditReversal };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Partial or full goods return of a completed sale.
 *   - Only 'completed' sales accept returns; 'cancelled' and 'returned'
 *     sales are rejected.
 *   - Every requested line must belong to the sale and
 *     requested + alreadyReturned <= sold - the over-return guard. The
 *     sale row is locked FOR UPDATE so concurrent returns serialize.
 *   - Restores returned goods to stock ('return_sale'), freezes the
 *     refund at the ORIGINAL sale unit_price (sale_return_items).
 *   - Reverses credit by the refundable portion (refund_amount of the
 *     still-created credit), capped at the customer's current balance.
 *   - Flips status to 'returned' only when every line is fully returned.
 *   Returns the full sale detail plus returnId + refundAmount +
 *   creditReversal.
 */
async function returnGoods({ saleId, items, reason, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [saleRows] = await connection.query(
      `SELECT id, customer_id, invoice_number, status
       FROM sales
       WHERE id = ?
       FOR UPDATE`,
      [saleId]
    );
    const sale = saleRows[0];

    if (!sale) {
      throw ApiError.notFound(`Sale ${saleId} not found`);
    }
    if (sale.status === 'cancelled') {
      throw ApiError.badRequest('A cancelled sale cannot have returns');
    }
    if (sale.status === 'returned') {
      throw ApiError.badRequest('Sale is already fully returned');
    }

    const [itemRows] = await connection.query(
      `SELECT si.id, si.product_id, si.quantity, si.unit_price, p.name AS product_name
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ?
       ORDER BY si.id ASC`,
      [saleId]
    );

    if (itemRows.length === 0) {
      throw ApiError.badRequest('This sale has no items and cannot be returned');
    }

    const returnedByItem = await getReturnedByItem(connection, saleId);
    const itemByProduct = new Map(
      itemRows.map((item) => [Number(item.product_id), item])
    );

    let refundAmount = 0;
    const normalized = [];

    for (const requested of items) {
      const saleItem = itemByProduct.get(requested.productId);
      if (!saleItem) {
        throw ApiError.badRequest(
          `Product ${requested.productId} is not part of sale ${saleId}`
        );
      }
      const alreadyReturned = returnedByItem.get(Number(saleItem.id)) ?? 0;
      const remaining = Number(saleItem.quantity) - alreadyReturned;
      if (requested.quantity > remaining) {
        throw ApiError.badRequest(
          `Cannot return ${requested.quantity} of "${saleItem.product_name}" - only ${remaining} more can be returned (${alreadyReturned} already returned of ${saleItem.quantity} sold)`
        );
      }
      normalized.push({
        saleItemId: Number(saleItem.id),
        productId: requested.productId,
        quantity: requested.quantity,
        unitPrice: toMoney(saleItem.unit_price),
      });
      refundAmount = toMoney(refundAmount + toMoney(requested.quantity * saleItem.unit_price));
    }

    const [returnResult] = await connection.query(
      `INSERT INTO sale_returns (sale_id, reason, refund_amount, created_by)
       VALUES (?, ?, ?, ?)`,
      [saleId, reason || null, refundAmount, createdBy]
    );
    const returnId = returnResult.insertId;

    for (const item of normalized) {
      const lineTotal = toMoney(item.quantity * item.unitPrice);
      await connection.query(
        `INSERT INTO sale_return_items
           (return_id, sale_item_id, product_id, quantity, unit_price, discount_amount, line_total)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [returnId, item.saleItemId, item.productId, item.quantity, item.unitPrice, lineTotal]
      );

      await stockRepository.applyChange({
        conn: connection,
        productId: item.productId,
        change: item.quantity,
        transactionType: 'return_sale',
        note: 'Sale return',
        referenceTable: 'sales',
        referenceId: saleId,
        createdBy,
      });
    }

    let creditReversal = null;
    if (sale.customer_id) {
      const { created, reversed } = await getCreditCreatedAndReversed(connection, saleId);
      const remainingCredit = toMoney(Math.max(0, created - reversed));
      const refundableCredit = toMoney(Math.min(refundAmount, remainingCredit));
      if (refundableCredit > 0) {
        creditReversal = await creditRepository.reverseForSale({
          conn: connection,
          sale,
          amount: refundableCredit,
          note: `Credit reversed - sale ${sale.invoice_number} return`,
          createdBy,
        });
      }
    }

    let fullyReturned = true;
    const returnedByReturn = new Map();
    for (const item of normalized) {
      returnedByReturn.set(
        item.saleItemId,
        (returnedByReturn.get(item.saleItemId) ?? 0) + item.quantity
      );
    }
    for (const item of itemRows) {
      const already = returnedByItem.get(Number(item.id)) ?? 0;
      const now = returnedByReturn.get(Number(item.id)) ?? 0;
      if (toMoney(already + now) + 0.0001 < toMoney(item.quantity)) {
        fullyReturned = false;
        break;
      }
    }

    const finalStatus = fullyReturned ? 'returned' : 'completed';
    await connection.query(
      `UPDATE sales SET status = ? WHERE id = ?`,
      [finalStatus, saleId]
    );

    await connection.commit();

    const detail = await findById(saleId);
    return {
      ...detail,
      returnId: Number(returnId),
      refundAmount,
      creditReversal,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  findAll,
  findById,
  create,
  cancel,
  returnGoods,
};