/**
 * Verifies the database is correctly provisioned:
 *   1. All 18 expected tables exist.
 *   2. Foreign keys and CHECK constraints exist (via information_schema).
 *   3. A full purchase -> stock -> sale -> payment -> credit flow can be
 *      inserted with correct referential integrity, decimal precision,
 *      and generated-column math - all inside ONE transaction that is
 *      ROLLED BACK at the end, so this script never leaves test data
 *      behind and is safe to run against a real database.
 *   4. Key constraints (CHECK / FK / UNIQUE) actually reject bad data.
 *
 * Usage:
 *   npm run db:verify
 *
 * Exit code 0 = all checks passed. Non-zero = something failed; the
 * failing check is printed. Nothing here should be trusted as "the
 * database works" until this has actually been run against a live
 * MySQL server and printed ALL CHECKS PASSED.
 */

require('dotenv').config();
const { pool } = require('../config/db');

const EXPECTED_TABLES = [
  'roles', 'users', 'permissions', 'user_permissions', 'categories',
  'suppliers', 'customers', 'products', 'purchases', 'purchase_items',
  'stock', 'stock_transactions', 'sales', 'sale_items', 'payments',
  'expenses', 'audit_logs', 'settings',
];

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

/** Runs an INSERT and returns its insertId. */
async function insertAndGetId(connection, sql, params) {
  const [result] = await connection.query(sql, params);
  return result.insertId;
}

/** Runs a SELECT expected to return exactly one row, and returns it. */
async function selectOne(connection, sql, params) {
  const [rows] = await connection.query(sql, params);
  return rows[0];
}

async function verifyStructure(dbName) {
  console.log('\n1. Checking table existence...');
  const [rows] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
    [dbName]
  );
  const existing = rows.map((r) => r.TABLE_NAME);
  for (const table of EXPECTED_TABLES) {
    check(`table "${table}" exists`, existing.includes(table));
  }

  console.log('\n2. Checking foreign keys are registered...');
  const [fks] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [dbName]
  );
  check('at least 20 foreign keys registered', fks[0].cnt >= 20, `found ${fks[0].cnt}`);

  console.log('\n3. Checking CHECK constraints are registered...');
  const [checks] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ?`,
    [dbName]
  );
  check('at least 10 CHECK constraints registered', checks[0].cnt >= 10, `found ${checks[0].cnt}`);
}

async function verifyBusinessFlow() {
  console.log('\n4. Running end-to-end business flow smoke test (rolled back afterward)...');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // --- reference data ---
    const roleId = await insertAndGetId(connection,
      `INSERT INTO roles (name, description) VALUES ('smoke_test_role','x')`);
    const userId = await insertAndGetId(connection,
      `INSERT INTO users (role_id, username, password_hash, full_name)
       VALUES (?, 'smoke_test_user', 'x', 'Smoke Test')`, [roleId]);
    const categoryId = await insertAndGetId(connection,
      `INSERT INTO categories (name) VALUES ('Smoke Test Category')`);
    const supplierId = await insertAndGetId(connection,
      `INSERT INTO suppliers (name) VALUES ('Smoke Test Supplier')`);
    const customerId = await insertAndGetId(connection,
      `INSERT INTO customers (name, phone, credit_limit) VALUES ('Smoke Test Customer','9999999999', 5000.00)`);
    const productId = await insertAndGetId(connection,
      `INSERT INTO products (category_id, sku, name, unit, cost_price, selling_price)
       VALUES (?, 'SMOKE-SKU-1', 'Smoke Test Tomato', 'kg', 20.00, 35.00)`, [categoryId]);

    await connection.query(`INSERT INTO stock (product_id, quantity) VALUES (?, 0)`, [productId]);

    // --- purchase: 10.500 kg at cost 20.00 -> stock increases ---
    const purchaseId = await insertAndGetId(connection,
      `INSERT INTO purchases (supplier_id, invoice_number, purchase_date, total_amount, created_by)
       VALUES (?, 'SMOKE-PUR-1', CURDATE(), 210.00, ?)`, [supplierId, userId]);
    await connection.query(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (?, ?, 10.500, 20.00)`,
      [purchaseId, productId]
    );

    const stockBeforePurchase = await selectOne(connection,
      `SELECT quantity FROM stock WHERE product_id = ?`, [productId]);
    const newQtyAfterPurchase = Number(stockBeforePurchase.quantity) + 10.5;
    await connection.query(`UPDATE stock SET quantity = ? WHERE product_id = ?`, [newQtyAfterPurchase, productId]);
    await connection.query(
      `INSERT INTO stock_transactions
        (product_id, transaction_type, quantity_change, quantity_before, quantity_after, reference_table, reference_id, created_by)
       VALUES (?, 'purchase', 10.500, ?, ?, 'purchases', ?, ?)`,
      [productId, stockBeforePurchase.quantity, newQtyAfterPurchase, purchaseId, userId]
    );

    const purchaseItemCheck = await selectOne(connection,
      `SELECT line_total FROM purchase_items WHERE purchase_id = ?`, [purchaseId]);
    check('purchase_items.line_total generated column = quantity * unit_cost (10.5 * 20.00 = 210.00)',
      Number(purchaseItemCheck.line_total) === 210.00, `got ${purchaseItemCheck.line_total}`);

    const stockAfterPurchase = await selectOne(connection,
      `SELECT quantity FROM stock WHERE product_id = ?`, [productId]);
    check('stock quantity increased by purchase amount (0 + 10.5 = 10.5)',
      Number(stockAfterPurchase.quantity) === 10.5, `got ${stockAfterPurchase.quantity}`);

    // --- credit sale: 2.000 kg at 35.00, partially paid ---
    const saleId = await insertAndGetId(connection,
      `INSERT INTO sales (customer_id, invoice_number, subtotal, total_amount, paid_amount, payment_type, created_by)
       VALUES (?, 'SMOKE-INV-1', 70.00, 70.00, 30.00, 'partial', ?)`, [customerId, userId]);
    await connection.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES (?, ?, 2.000, 35.00)`,
      [saleId, productId]
    );

    const saleCheck = await selectOne(connection,
      `SELECT total_amount, paid_amount, balance_due FROM sales WHERE id = ?`, [saleId]);
    check('sales.balance_due generated column = total_amount - paid_amount (70.00 - 30.00 = 40.00)',
      Number(saleCheck.balance_due) === 40.00, `got ${saleCheck.balance_due}`);

    const saleItemCheck = await selectOne(connection,
      `SELECT line_total FROM sale_items WHERE sale_id = ?`, [saleId]);
    check('sale_items.line_total generated column = quantity * unit_price - discount (2 * 35.00 - 0 = 70.00)',
      Number(saleItemCheck.line_total) === 70.00, `got ${saleItemCheck.line_total}`);

    // stock decrease for the sale
    const stockBeforeSale = await selectOne(connection,
      `SELECT quantity FROM stock WHERE product_id = ?`, [productId]);
    const newQtyAfterSale = Number(stockBeforeSale.quantity) - 2.0;
    await connection.query(`UPDATE stock SET quantity = ? WHERE product_id = ?`, [newQtyAfterSale, productId]);
    await connection.query(
      `INSERT INTO stock_transactions
        (product_id, transaction_type, quantity_change, quantity_before, quantity_after, reference_table, reference_id, created_by)
       VALUES (?, 'sale', -2.000, ?, ?, 'sales', ?, ?)`,
      [productId, stockBeforeSale.quantity, newQtyAfterSale, saleId, userId]
    );
    const stockAfterSale = await selectOne(connection,
      `SELECT quantity FROM stock WHERE product_id = ?`, [productId]);
    check('stock quantity decreased by sale amount (10.5 - 2 = 8.5)',
      Number(stockAfterSale.quantity) === 8.5, `got ${stockAfterSale.quantity}`);

    // payment against the sale + customer credit balance update
    await connection.query(
      `INSERT INTO payments (sale_id, customer_id, amount, payment_method, payment_type, received_by)
       VALUES (?, ?, 30.00, 'cash', 'sale_payment', ?)`,
      [saleId, customerId, userId]
    );
    await connection.query(
      `UPDATE customers SET current_balance = current_balance + 40.00 WHERE id = ?`, [customerId]
    );
    const customerCheck = await selectOne(connection,
      `SELECT current_balance FROM customers WHERE id = ?`, [customerId]);
    check('customer current_balance reflects outstanding credit (40.00)',
      Number(customerCheck.current_balance) === 40.00, `got ${customerCheck.current_balance}`);

    // --- constraint enforcement checks (each expected to throw) ---
    console.log('\n5. Checking constraints reject invalid data...');

    try {
      await connection.query(`UPDATE stock SET quantity = -1 WHERE product_id = ?`, [productId]);
      check('CHECK chk_stock_quantity rejects negative stock', false, 'no error was thrown');
    } catch (e) {
      check('CHECK chk_stock_quantity rejects negative stock', /Check constraint|CONSTRAINT/i.test(e.message), e.message);
    }

    try {
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES (?, ?, -1, 10.00)`,
        [saleId, productId]
      );
      check('CHECK chk_sale_items_qty rejects non-positive quantity', false, 'no error was thrown');
    } catch (e) {
      check('CHECK chk_sale_items_qty rejects non-positive quantity', /Check constraint|CONSTRAINT/i.test(e.message), e.message);
    }

    try {
      await connection.query(
        `INSERT INTO sales (customer_id, invoice_number, total_amount, created_by) VALUES (?, ?, 1, 9999999)`,
        [customerId, 'SMOKE-INV-BAD-FK']
      );
      check('FK fk_sales_created_by rejects unknown user id', false, 'no error was thrown');
    } catch (e) {
      check('FK fk_sales_created_by rejects unknown user id', /foreign key constraint/i.test(e.message), e.message);
    }

    try {
      await connection.query(
        `INSERT INTO purchases (supplier_id, invoice_number, purchase_date, total_amount, created_by)
         VALUES (?, 'SMOKE-PUR-1', CURDATE(), 1, ?)`,
        [supplierId, userId]
      );
      check('UNIQUE uq_purchases_supplier_invoice rejects duplicate invoice per supplier', false, 'no error was thrown');
    } catch (e) {
      check('UNIQUE uq_purchases_supplier_invoice rejects duplicate invoice per supplier', /Duplicate entry/i.test(e.message), e.message);
    }

    // Always roll back - this script must never leave data behind.
    await connection.rollback();
    console.log('\n(all smoke-test rows rolled back - database left untouched)');
  } catch (err) {
    await connection.rollback();
    console.error('\nSmoke test aborted by unexpected error:', err.message);
    failures += 1;
  } finally {
    connection.release();
  }
}

async function main() {
  const dbName = process.env.DB_NAME;
  console.log(`Verifying database "${dbName}"...`);
  await verifyStructure(dbName);
  await verifyBusinessFlow();

  console.log('\n' + '='.repeat(60));
  if (failures === 0) {
    console.log('ALL CHECKS PASSED');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
  }
  console.log('='.repeat(60));

  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
