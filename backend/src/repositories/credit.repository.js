/**
 * Credit repository - raw SQL lives here and nowhere else for this
 * module. Services depend on this interface, never on `pool` directly.
 *
 * Uses the existing customers / sales / payments tables plus the
 * Phase 7 credit_transactions ledger (append-only: one 'created' row
 * per sale enforced by the FUNCTIONAL unique index uq_credit_created_sale,
 * 'collected' rows reference the associated payments.credit_payment
 * row, and 'credit_reversal' rows record credit undone by the Sales
 * Returns & Cancellation module).
 *
 * Ownership rules:
 *   - customers.current_balance is maintained ONLY here. Customer CRUD
 *     (customer.repository) never writes it.
 *   - A credit COLLECTION is written BOTH to payments (payment_type
 *     'credit_payment', sale_id NULL, purchase_id NULL, customer_id
 *     set - satisfies chk_payments_one_target) AND to the ledger, and
 *     the balance update, all in ONE transaction. Sale payment history
 *     is never rewritten.
 *   - credit_limit interpretation: 0 = no credit allowed; > 0 = hard
 *     ceiling on current_balance.
 *
 * Concurrency: every write path locks the customer row with
 * SELECT ... FOR UPDATE so simultaneous collections (or a collection
 * racing a credit creation for the same customer) serialize and
 * current_balance can never go negative - the customers CHECK
 * (current_balance >= 0) is a second backstop.
 */

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return toMoney(value).toFixed(2);
}

/**
 * Credit balances list. Backend-paginated; only customers with an
 * outstanding balance are returned unless outstanding=false is passed.
 */
async function findOutstanding({ search, outstandingOnly, status, limit, offset }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(name LIKE ? OR phone LIKE ?)');
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  if (outstandingOnly) {
    where.push('current_balance > 0');
  }

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM customers
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT id, name, phone, credit_limit, current_balance, status, updated_at
     FROM customers
     ${whereSql}
     ORDER BY current_balance DESC, name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

/**
 * Credit creation from a completed sale. Backend-computed outstanding
 * (sales.balance_due is the generated STORED column = total - paid).
 * Atomic, idempotent, credit-limit enforcing:
 *
 *   BEGIN
 *     1. Lock the sale (FOR UPDATE)
 *     2. Verify completed, known customer, outstanding > 0
 *     3. Lock the customer
 *     4. Verify credit was not already recorded for this sale
 *        (UNIQUE(sale_id) on 'created' rows is the DB backstop)
 *     5. Verify credit limit
 *     6. Insert ledger entry (+balance_before/after)
 *     7. Update customers.current_balance
 *   COMMIT
 */
async function createFromSale({ saleId, createdBy, connection: providedConnection = null }) {
  const connection = providedConnection || await pool.getConnection();
  const ownsTransaction = !providedConnection;

  try {
    if (ownsTransaction) await connection.beginTransaction();

    const [saleRows] = await connection.query(
      `SELECT id, customer_id, invoice_number, status, balance_due
       FROM sales
       WHERE id = ?
       FOR UPDATE`,
      [saleId]
    );
    const sale = saleRows[0];

    if (!sale) {
      throw ApiError.notFound(`Sale ${saleId} not found`);
    }
    if (sale.customer_id === null) {
      throw ApiError.badRequest(
        'Credit requires a known customer; walk-in sales cannot carry credit'
      );
    }
    if (sale.status !== 'completed') {
      throw ApiError.badRequest(
        'Credit can only be created from a completed sale'
      );
    }

    const outstanding = toMoney(sale.balance_due);
    if (!(outstanding > 0)) {
      throw ApiError.badRequest(
        'This sale has no outstanding balance to convert to credit'
      );
    }

    const [customerRows] = await connection.query(
      `SELECT id, name, status, credit_limit, current_balance
       FROM customers
       WHERE id = ?
       FOR UPDATE`,
      [sale.customer_id]
    );
    const customer = customerRows[0];

    if (!customer) {
      throw ApiError.notFound(`Customer ${sale.customer_id} not found`);
    }
    if (customer.status !== 'active') {
      throw ApiError.badRequest(
        `Customer "${customer.name}" is inactive and cannot carry credit`
      );
    }

    const currentBalance = toMoney(customer.current_balance);

    const [existingRows] = await connection.query(
      `SELECT id, amount, balance_before, balance_after
       FROM credit_transactions
       WHERE sale_id = ? AND transaction_type = 'created'`,
      [saleId]
    );

    let payload;

    if (existingRows[0]) {
      payload = {
        alreadyRecorded: true,
        transactionId: existingRows[0].id,
        saleId: Number(sale.id),
        invoiceNumber: sale.invoice_number,
        customerId: Number(customer.id),
        customerName: customer.name,
        amount: toMoney(existingRows[0].amount),
        balanceBefore: toMoney(existingRows[0].balance_before),
        balanceAfter: toMoney(existingRows[0].balance_after),
      };
    } else {
      const newBalance = toMoney(currentBalance + outstanding);
      const creditLimit = toMoney(customer.credit_limit);

      if (creditLimit === 0) {
        throw ApiError.badRequest(
          `Customer "${customer.name}" has credit_limit 0 - no credit allowed`
        );
      }
      if (newBalance > creditLimit) {
        throw ApiError.badRequest(
          `Credit of ${money(outstanding)} would exceed "${customer.name}" credit limit of ${money(creditLimit)}`
        );
      }

      const [ledgerResult] = await connection.query(
        `INSERT INTO credit_transactions
           (customer_id, transaction_type, amount, sale_id,
            balance_before, balance_after, notes, created_by)
         VALUES (?, 'created', ?, ?, ?, ?, ?, ?)`,
        [
          customer.id,
          outstanding,
          saleId,
          currentBalance,
          newBalance,
          `Credit from sale ${sale.invoice_number}`,
          createdBy,
        ]
      );

      await connection.query(
        `UPDATE customers SET current_balance = ? WHERE id = ?`,
        [newBalance, customer.id]
      );

      payload = {
        alreadyRecorded: false,
        transactionId: ledgerResult.insertId,
        saleId: Number(sale.id),
        invoiceNumber: sale.invoice_number,
        customerId: Number(customer.id),
        customerName: customer.name,
        amount: outstanding,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
      };
    }

    if (ownsTransaction) await connection.commit();
    return payload;
  } catch (error) {
    if (ownsTransaction) await connection.rollback();
    throw error;
  } finally {
    if (ownsTransaction) connection.release();
  }
}

/**
 * Credit collection. Validates against the locked, current balance and
 * records three things atomically: the payments.credit_payment row,
 * the -amount ledger entry, and the balance update. Over-collection is
 * rejected BEFORE any write, so balance and ledger stay consistent.
 */
async function collect({ customerId, amount, method, notes, receivedBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      `SELECT id, name, status, current_balance
       FROM customers
       WHERE id = ?
       FOR UPDATE`,
      [customerId]
    );
    const customer = customerRows[0];

    if (!customer) {
      throw ApiError.notFound(`Customer ${customerId} not found`);
    }
    if (customer.status !== 'active') {
      throw ApiError.badRequest(
        'Credit can only be collected from an active customer'
      );
    }

    const currentBalance = toMoney(customer.current_balance);
    const collectedAmount = toMoney(amount);

    if (collectedAmount > currentBalance) {
      throw ApiError.badRequest(
        `Collection of ${money(collectedAmount)} cannot exceed the outstanding balance of ${money(currentBalance)}`
      );
    }

    const newBalance = toMoney(currentBalance - collectedAmount);

    const [paymentResult] = await connection.query(
      `INSERT INTO payments
         (sale_id, purchase_id, customer_id, amount, payment_method,
          payment_type, notes, received_by)
       VALUES (NULL, NULL, ?, ?, ?, 'credit_payment', ?, ?)`,
      [customerId, collectedAmount, method, notes || null, receivedBy]
    );

    await connection.query(
      `INSERT INTO credit_transactions
         (customer_id, transaction_type, amount, payment_id,
          balance_before, balance_after, notes, created_by)
       VALUES (?, 'collected', ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        collectedAmount,
        paymentResult.insertId,
        currentBalance,
        newBalance,
        notes || null,
        receivedBy,
      ]
    );

    await connection.query(
      `UPDATE customers SET current_balance = ? WHERE id = ?`,
      [newBalance, customerId]
    );

    await connection.commit();

    return {
      customerId: Number(customer.id),
      customerName: customer.name,
      amount: collectedAmount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      paymentId: paymentResult.insertId,
      paymentMethod: method,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Credit reversal - called by the sale module INSIDE its own transaction
 * when a completed sale is cancelled or returned. Lowers the customer's
 * balance by the portion of the sale's created credit that the event
 * undoes, capped at the customer's current balance, and records an
 * immutable 'credit_reversal' ledger row (sale_id set).
 *
 * The cap (never more than current_balance) guarantees the ledger CHECK
 * (balance_after >= 0) and customers.current_balance can never go
 * negative; a customer who already collected their credit simply leaves
 * nothing to reverse and no row is written. The customer row is locked
 * FOR UPDATE so a simultaneous collection serializes safely.
 *
 * Because this runs inside the sale's transaction, the reversal, its
 * ledger row, the stock restoration and the sale status change commit
 * together.
 */
async function reverseForSale({ conn, sale, amount, note, createdBy }) {
  const [customerRows] = await conn.query(
    `SELECT id, name, current_balance
     FROM customers
     WHERE id = ?
     FOR UPDATE`,
    [sale.customer_id]
  );
  const customer = customerRows[0];

  if (!customer) {
    throw ApiError.notFound(`Customer ${sale.customer_id} not found`);
  }

  const currentBalance = toMoney(customer.current_balance);
  const reversalAmount = toMoney(Math.min(toMoney(amount), currentBalance));

  if (!(reversalAmount > 0)) {
    return null;
  }

  const newBalance = toMoney(currentBalance - reversalAmount);

  const [ledgerResult] = await conn.query(
    `INSERT INTO credit_transactions
       (customer_id, transaction_type, amount, sale_id,
        balance_before, balance_after, notes, created_by)
     VALUES (?, 'credit_reversal', ?, ?, ?, ?, ?, ?)`,
    [
      customer.id,
      reversalAmount,
      sale.id,
      currentBalance,
      newBalance,
      note || null,
      createdBy,
    ]
  );

  await conn.query(
    `UPDATE customers SET current_balance = ? WHERE id = ?`,
    [newBalance, customer.id]
  );

  return {
    transactionId: ledgerResult.insertId,
    customerId: Number(customer.id),
    customerName: customer.name,
    requestedAmount: toMoney(amount),
    amount: reversalAmount,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
  };
}

/**
 * Append-only history for one customer. Read-only; ledger rows are
 * immutable (schema has no UPDATE/DELETE path for this table).
 */
async function findTransactions(customerId, limit, offset) {
  const [rows] = await pool.query(
    `SELECT
       ct.id,
       ct.transaction_type,
       ct.amount,
       ct.sale_id,
       s.invoice_number,
       ct.payment_id,
       pt.payment_method,
       ct.balance_before,
       ct.balance_after,
       ct.notes,
       ct.created_by,
       u.username AS created_by_name,
       ct.created_at
     FROM credit_transactions ct
     LEFT JOIN sales s ON s.id = ct.sale_id
     LEFT JOIN payments pt ON pt.id = ct.payment_id
     LEFT JOIN users u ON u.id = ct.created_by
     WHERE ct.customer_id = ?
     ORDER BY ct.id ASC
     LIMIT ? OFFSET ?`,
    [customerId, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM credit_transactions
     WHERE customer_id = ?`,
    [customerId]
  );

  return { rows, total: Number(total) };
}

module.exports = {
  findOutstanding,
  createFromSale,
  collect,
  reverseForSale,
  findTransactions,
};