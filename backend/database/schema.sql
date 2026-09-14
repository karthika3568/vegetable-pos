-- =====================================================================
-- Vegetable Shop POS Management System
-- PHASE 1: DATABASE SCHEMA (MySQL 8.0+)
-- =====================================================================
-- Design principles enforced throughout this file:
--   1. Backend/DB is the single source of truth for stock, sales,
--      purchases, payments, discounts, profit, expenses.
--   2. Nothing is ever hard-deleted if it has business history.
--      Entities that can appear in historical records (users, products,
--      suppliers, customers, sales, purchases, payments) are disabled
--      via a status/flag column, never DELETEd.
--   3. Every stock quantity change is backed by an immutable ledger row
--      in stock_transactions. `stock.quantity` is a materialized
--      snapshot that must only ever be changed in the SAME database
--      transaction as the stock_transactions row that explains it.
--   4. Money uses DECIMAL, never FLOAT/DOUBLE. Weight/quantity uses
--      DECIMAL(10,3) to support fractional kg (e.g. 0.250 kg).
--   5. payments, audit_logs, stock_transactions are insert-only ledgers.
--      Corrections are new rows (reversals), never UPDATEs/DELETEs of
--      historical rows.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Drop order (children first) - only used for clean re-provisioning of
-- a dev/test database. Never run this against a production database.
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sale_return_items;
DROP TABLE IF EXISTS sale_returns;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS stock_transactions;
DROP TABLE IF EXISTS stock;
DROP TABLE IF EXISTS purchase_items;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS income;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 1. ROLES
-- Coarse job function (admin / manager / cashier). Kept deliberately
-- simple: fine-grained access control lives in permissions +
-- user_permissions below, per the required core-entity list.
-- =====================================================================
CREATE TABLE roles (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(50)  NOT NULL,
    description     VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_roles_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 2. USERS
-- Employees/operators of the system (cashiers, managers, admins).
-- Never hard-deleted: sales, purchases, audit_logs all reference the
-- acting user, so a user must remain resolvable forever. Deactivation
-- is done via `status`.
-- =====================================================================
CREATE TABLE users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_id         INT UNSIGNED NOT NULL,
    username        VARCHAR(50)  NOT NULL,
    email           VARCHAR(100) NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    phone           VARCHAR(20)  NULL,
    status          ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
    -- Incremented on logout, force-logout, and disable. authenticate
    -- compares this against the JWT's tokenVersion every request, so a
    -- bump immediately invalidates every previously-issued token.
    token_version   INT UNSIGNED NOT NULL DEFAULT 1,
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_status ON users(status);

-- =====================================================================
-- 3. PERMISSIONS
-- Master list of fine-grained capabilities the backend checks before
-- honoring an API request (e.g. 'sales.create', 'stock.adjust',
-- 'reports.view', 'users.manage').
-- =====================================================================
CREATE TABLE permissions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(100) NOT NULL,
    module          VARCHAR(50)  NOT NULL,
    description     VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_permissions_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_permissions_module ON permissions(module);

-- =====================================================================
-- 4. USER_PERMISSIONS
-- Grants (or explicit denies) of individual permissions to individual
-- users. This is what backend authorization middleware checks; roles
-- alone are not sufficient for the "validate permissions on the
-- backend" requirement.
-- =====================================================================
CREATE TABLE user_permissions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    permission_id   INT UNSIGNED NOT NULL,
    is_granted      TINYINT(1) NOT NULL DEFAULT 1, -- 1 = grant, 0 = explicit deny override
    granted_by      INT UNSIGNED NULL,
    granted_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_permission UNIQUE (user_id, permission_id),
    CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_user_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_user_permissions_granted_by FOREIGN KEY (granted_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);

-- =====================================================================
-- 5. CATEGORIES
-- Product grouping (Leafy Greens, Root Vegetables, Fruits, etc).
-- Disabled, not deleted, so historical products/sales keep resolving.
-- =====================================================================
CREATE TABLE categories (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(255) NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_categories_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 6. SUPPLIERS
-- Disabled (not deleted) so historical purchases remain intact, per
-- requirement: "Disabled suppliers must retain historical purchases."
-- =====================================================================
CREATE TABLE suppliers (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(100) NULL,
    phone           VARCHAR(20)  NULL,
    email           VARCHAR(100) NULL,
    address         VARCHAR(255) NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_suppliers_phone ON suppliers(phone);
CREATE INDEX idx_suppliers_status ON suppliers(status);

-- =====================================================================
-- 7. CUSTOMERS
-- credit_limit / current_balance are cached/materialized values.
-- They must ONLY be written inside the same DB transaction as the
-- sale/payment row that changes them (see business flow notes in the
-- accompanying explanation). The true source of truth is the sum of
-- sales.balance_due for that customer; current_balance is a fast-read
-- cache of that sum, reconciled by every write path, never guessed.
-- =====================================================================
CREATE TABLE customers (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    phone           VARCHAR(20)  NULL,
    email           VARCHAR(100) NULL,
    address         VARCHAR(255) NULL,
    credit_limit    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- outstanding credit owed to shop
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_customers_phone UNIQUE (phone),
    CONSTRAINT chk_customers_balance CHECK (current_balance >= 0),
    CONSTRAINT chk_customers_credit_limit CHECK (credit_limit >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_customers_status ON customers(status);

-- =====================================================================
-- 8. PRODUCTS
-- Disabled (not deleted) so historical sales/purchases keep resolving,
-- per requirement: "Disabled products must retain historical sales."
-- cost_price is the last known purchase cost (reference only - actual
-- purchase cost per batch lives on purchase_items). selling_price is
-- the current POS price.
-- =====================================================================
CREATE TABLE products (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id     INT UNSIGNED NOT NULL,
    sku             VARCHAR(50)  NOT NULL,
    name            VARCHAR(150) NOT NULL,
    unit            ENUM('kg','g','piece','dozen','bunch','litre') NOT NULL DEFAULT 'kg',
    cost_price      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price   DECIMAL(10,2) NOT NULL,
    image_path      VARCHAR(255) NULL,
    reorder_level   DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_products_sku UNIQUE (sku),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_products_prices CHECK (cost_price >= 0 AND selling_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_active ON products(is_active);

-- =====================================================================
-- 8a. PRODUCT VARIANTS / TYPES
-- Optional subtypes of a product (e.g. Tomato -> Local / Hybrid).
-- Each variant carries its own purchase and selling price. Per-variant
-- stock and POS price selection are future modules; this table only
-- establishes the master-data structure. Variant names are unique
-- WITHIN one parent product (Tomato -> Local, Tomato -> Hybrid valid;
-- Tomato -> Local twice is not), but the same name may exist under a
-- different parent (Banana -> Local). Variants are disabled via
-- is_active, never deleted, so any future stock/sales/purchase history
-- referencing them stays resolvable. The parent product's unit and
-- reorder_level apply to all of its variants.
-- =====================================================================
CREATE TABLE product_variants (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id      INT UNSIGNED NOT NULL,
    variant_name    VARCHAR(100) NOT NULL,
    purchase_price  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price   DECIMAL(10,2) NOT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_variants_product_name UNIQUE (product_id, variant_name),
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_product_variants_prices CHECK (purchase_price >= 0 AND selling_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_product_variants_active ON product_variants(is_active);

-- =====================================================================
-- 9. PURCHASES
-- Header record for a supplier purchase (goods received). Never
-- deleted, only cancelled via `status`, to preserve history.
-- =====================================================================
CREATE TABLE purchases (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_id     INT UNSIGNED NOT NULL,
    invoice_number  VARCHAR(50)  NOT NULL,
    purchase_date   DATE NOT NULL,
    total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    paid_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    payment_status  ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
    status          ENUM('completed','cancelled') NOT NULL DEFAULT 'completed',
    notes           VARCHAR(255) NULL,
    invoice_image_path VARCHAR(255) NULL,
    created_by      INT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchases_supplier_invoice UNIQUE (supplier_id, invoice_number),
    CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_purchases_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_purchases_amounts CHECK (total_amount >= 0 AND paid_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_date ON purchases(purchase_date);
CREATE INDEX idx_purchases_status ON purchases(status);

-- =====================================================================
-- 10. PURCHASE_ITEMS
-- Line items of a purchase. Drives stock increases (via
-- stock_transactions) and preserves the true per-batch cost of goods.
-- =====================================================================
CREATE TABLE purchase_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_id     INT UNSIGNED NOT NULL,
    product_id      INT UNSIGNED NOT NULL,
    quantity        DECIMAL(10,3) NOT NULL,
    unit_cost       DECIMAL(10,2) NOT NULL,
    line_total      DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_items_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_purchase_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_purchase_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_purchase_items_cost CHECK (unit_cost >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product ON purchase_items(product_id);

-- =====================================================================
-- 11. STOCK
-- One row per product: the current on-hand quantity. This is a
-- materialized snapshot, NOT the source of historical truth -
-- stock_transactions is. Every UPDATE to stock.quantity must happen in
-- the same DB transaction as the stock_transactions row that caused it.
-- =====================================================================
CREATE TABLE stock (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id      INT UNSIGNED NOT NULL,
    quantity        DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_stock_product UNIQUE (product_id),
    CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_stock_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 12. STOCK_TRANSACTIONS
-- Immutable ledger of every stock movement. This is the audit trail
-- and the real source of truth that stock.quantity is derived from.
-- quantity_before/quantity_after are recorded at write time so the
-- ledger is self-verifying even if `stock` were ever rebuilt from it.
-- =====================================================================
CREATE TABLE stock_transactions (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id          INT UNSIGNED NOT NULL,
    transaction_type    ENUM('purchase','sale','return_purchase','return_sale','adjustment','cancellation_reversal') NOT NULL,
    quantity_change     DECIMAL(10,3) NOT NULL, -- signed: positive = stock in, negative = stock out
    quantity_before     DECIMAL(10,3) NOT NULL,
    quantity_after      DECIMAL(10,3) NOT NULL,
    reference_table     VARCHAR(30) NULL,  -- e.g. 'purchases', 'sales'
    reference_id        INT UNSIGNED NULL, -- id within reference_table
    note                VARCHAR(255) NULL,
    created_by          INT UNSIGNED NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_stock_tx_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_stock_tx_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_stock_tx_after CHECK (quantity_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_stock_tx_product ON stock_transactions(product_id);
CREATE INDEX idx_stock_tx_reference ON stock_transactions(reference_table, reference_id);
CREATE INDEX idx_stock_tx_created_at ON stock_transactions(created_at);

-- =====================================================================
-- 13. SALES
-- Header record for a POS sale (cash, credit, or partial). Never
-- deleted - cancellations/returns are reflected via `status`, per
-- requirement: "Cancelled sales must remain in history."
-- balance_due is generated from total/paid so it can never drift from
-- the two numbers it's derived from.
-- =====================================================================
CREATE TABLE sales (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id     INT UNSIGNED NULL, -- NULL = walk-in / cash customer
    invoice_number  VARCHAR(50) NOT NULL,
    sale_date       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    paid_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    balance_due     DECIMAL(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
    payment_type    ENUM('cash','credit','partial') NOT NULL DEFAULT 'cash',
    status          ENUM('completed','cancelled','returned') NOT NULL DEFAULT 'completed',
    created_by      INT UNSIGNED NOT NULL, -- cashier
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_sales_invoice_number UNIQUE (invoice_number),
    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sales_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_sales_amounts CHECK (
        subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0
        AND total_amount >= 0 AND paid_amount >= 0
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_created_by ON sales(created_by);

-- =====================================================================
-- 14. SALE_ITEMS
-- Line items of a sale. Drives stock decreases (via stock_transactions)
-- and preserves the exact price charged at time of sale, independent
-- of later changes to products.selling_price.
-- =====================================================================
CREATE TABLE sale_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sale_id         INT UNSIGNED NOT NULL,
    product_id      INT UNSIGNED NOT NULL,
    quantity        DECIMAL(10,3) NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    line_total      DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount) STORED,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_sale_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_sale_items_price CHECK (unit_price >= 0 AND discount_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- =====================================================================
-- 15. PAYMENTS
-- Insert-only payment ledger. Covers POS sale payments, customer
-- credit repayments, and supplier purchase payments through one table
-- so "Payment History" and "Credit History" both come from a single
-- append-only source of truth. Corrections are new rows referencing
-- `reversed_payment_id`, never edits of a historical payment.
-- Exactly one of sale_id / purchase_id must be set; customer_id is
-- always set for sale/credit payments and NULL for purchase payments.
-- =====================================================================
CREATE TABLE payments (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sale_id             INT UNSIGNED NULL,
    purchase_id         INT UNSIGNED NULL,
    customer_id         INT UNSIGNED NULL,
    amount              DECIMAL(12,2) NOT NULL,
    payment_method      ENUM('cash','card','upi','bank_transfer','other') NOT NULL DEFAULT 'cash',
    payment_type        ENUM('sale_payment','credit_payment','purchase_payment') NOT NULL,
    payment_date        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversed_payment_id INT UNSIGNED NULL, -- set on a reversal row, pointing back at the original
    notes               VARCHAR(255) NULL,
    received_by         INT UNSIGNED NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
       ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_payments_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id)
       ON UPDATE RESTRICT ON DELETE RESTRICT,
   CONSTRAINT fk_payments_reversed FOREIGN KEY (reversed_payment_id) REFERENCES payments(id)
       ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_payments_received_by FOREIGN KEY (received_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_payments_amount CHECK (amount <> 0),
    CONSTRAINT chk_payments_one_target CHECK (
        (sale_id IS NOT NULL AND purchase_id IS NULL) OR
        (sale_id IS NULL AND purchase_id IS NOT NULL) OR
        (sale_id IS NULL AND purchase_id IS NULL AND customer_id IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_payments_sale ON payments(sale_id);
CREATE INDEX idx_payments_purchase ON payments(purchase_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- =====================================================================
-- 16. CREDIT_TRANSACTIONS
-- Append-only credit ledger owned by the credit module. The payments
-- table covers money RECEIVED (sale payments, credit repayments,
-- purchase payments); this table records credit CREATION (money owed
-- from a completed sale with an outstanding balance), a mirrored row
-- for every credit COLLECTION, and a 'credit_reversal' row whenever a
-- cancelled or returned sale lowers what a customer owes:
--
--     CREDIT_CREATED    +400   (sale_id set)
--     CREDIT_COLLECTED  -200   (payment_id -> payments.credit_payment)
--     CREDIT_REVERSAL   -200   (sale_id set - cancelled/returned sale)
--
-- customers.current_balance is maintained ONLY here (never by customer
-- CRUD). credit_limit = 0 means "no credit allowed"; a positive limit
-- is a hard ceiling on current_balance. A reversal never exceeds the
-- customer's current balance, so the balance_after >= 0 CHECK can
-- never be violated. A FUNCTIONAL unique index enforces exactly one
-- 'created' row per sale at the database level (create-once backstop)
-- while allowing many 'credit_reversal' rows per sale (one per return,
-- plus one on cancellation); 'collected' rows have NULL sale_id and
-- are unaffected by the index.
-- =====================================================================
CREATE TABLE credit_transactions (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id      INT UNSIGNED NOT NULL,
    transaction_type ENUM('created','collected','credit_reversal') NOT NULL,
    amount           DECIMAL(12,2) NOT NULL, -- always positive; direction implied by transaction_type
    sale_id          INT UNSIGNED NULL,       -- set on 'created' and 'credit_reversal' rows
    payment_id       INT UNSIGNED NULL,       -- set ONLY on 'collected' rows
    balance_before   DECIMAL(12,2) NOT NULL,
    balance_after    DECIMAL(12,2) NOT NULL,
    notes            VARCHAR(255) NULL,
    created_by       INT UNSIGNED NOT NULL,   -- cashier / collector
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_credit_created_sale
        ((CASE WHEN transaction_type = 'created' THEN sale_id END)),
    CONSTRAINT fk_credit_transactions_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_credit_transactions_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_credit_transactions_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_credit_transactions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_credit_transactions_amount CHECK (amount > 0),
    CONSTRAINT chk_credit_transactions_balance CHECK (balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_credit_transactions_customer ON credit_transactions(customer_id);
CREATE INDEX idx_credit_transactions_sale ON credit_transactions(sale_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);

-- =====================================================================
-- 17. SALE_RETURNS
-- One row per return event against a completed sale. A return restores
-- the returned goods to stock (stock_transactions 'return_sale', ref
-- 'sales') and, for credit sales, reverses the created credit by the
-- refundable portion capped at the customer's current balance. Money
-- already received stays on the append-only payments ledger - the
-- refund fact is this row's refund_amount, never a new receipt. A
-- return covering every line quantity flips the sale to 'returned'.
-- =====================================================================
CREATE TABLE sale_returns (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sale_id        INT UNSIGNED NOT NULL,
    return_date    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason         VARCHAR(255) NULL,
    refund_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_by     INT UNSIGNED NOT NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sale_returns_sale FOREIGN KEY (sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sale_returns_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_sale_returns_refund CHECK (refund_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX idx_sale_returns_created_at ON sale_returns(created_at);

-- =====================================================================
-- 18. SALE_RETURN_ITEMS
-- Returned line items frozen at the ORIGINAL sale unit_price (the same
-- frozen-snapshot invariant as sale_items / invoices), so a return
-- never depends on later price changes. line_total = quantity * unit_price
-- (recorded, NOT generated - unlike sale_items) so the snapshot is
-- explicit. Over-returning is prevented by the module's per-item guard
-- (already-returned + requested <= sold quantity) inside the sale
-- transaction; these rows are the audit history for it.
-- =====================================================================
CREATE TABLE sale_return_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_id       INT UNSIGNED NOT NULL,
    sale_item_id    INT UNSIGNED NOT NULL,
    product_id      INT UNSIGNED NOT NULL,
    quantity        DECIMAL(10,3) NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    line_total      DECIMAL(12,2) NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sale_return_items_return FOREIGN KEY (return_id) REFERENCES sale_returns(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sale_return_items_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sale_return_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_sale_return_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_sale_return_items_line_total CHECK (line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sale_return_items_return ON sale_return_items(return_id);
CREATE INDEX idx_sale_return_items_sale_item ON sale_return_items(sale_item_id);
CREATE INDEX idx_sale_return_items_product ON sale_return_items(product_id);

-- =====================================================================
-- 19. EXPENSES
-- Shop operating expenses (rent, electricity, transport, wastage...),
-- feeding into profit/reports alongside sales and purchases.
-- =====================================================================
CREATE TABLE expenses (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category        VARCHAR(50) NOT NULL,
    description     VARCHAR(255) NULL,
    amount          DECIMAL(12,2) NOT NULL,
    expense_date    DATE NOT NULL,
    created_by      INT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expenses_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_expenses_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- =====================================================================
-- 20. INCOME
-- NON-SALES receipts (scrap sales, rent received, service charges,
-- other operating income). Financially isolated from the sales/payments/
-- credit/purchases ledgers on purpose - sales revenue, customer credit
-- and supplier payments are each recorded strictly in their own tables,
-- so income money is never double-counted. Mirrors the expenses design:
-- created_by columns only, no status, no hard deletes - every row is
-- immutable history backed by the insert-only audit trail.
-- =====================================================================
CREATE TABLE income (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category        VARCHAR(50) NOT NULL,
    description     VARCHAR(255) NULL,
    amount          DECIMAL(12,2) NOT NULL,
    income_date     DATE NOT NULL,
    created_by      INT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_income_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_income_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_income_date ON income(income_date);
CREATE INDEX idx_income_category ON income(category);

-- =====================================================================
-- 21. AUDIT_LOGS
-- Insert-only trail of who did what to which record. Feeds
-- accountability requirements: "Audit records must remain traceable."
-- user_id is nullable to allow system-originated entries (e.g.
-- scheduled jobs) without breaking the FK.
-- =====================================================================
CREATE TABLE audit_logs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NULL,
    action          VARCHAR(100) NOT NULL,  -- e.g. 'CREATE_SALE','CANCEL_SALE','STOCK_ADJUST'
    entity_type     VARCHAR(50) NOT NULL,   -- e.g. 'sales','products'
    entity_id       INT UNSIGNED NULL,
    old_values      JSON NULL,
    new_values      JSON NULL,
    ip_address      VARCHAR(45) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =====================================================================
-- 22. SETTINGS
-- Shop-wide key/value configuration (currency, tax rate, invoice
-- prefix, low-stock threshold default, business name/address, etc).
-- =====================================================================
CREATE TABLE settings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key     VARCHAR(100) NOT NULL,
    setting_value   TEXT NULL,
    description     VARCHAR(255) NULL,
    updated_by      INT UNSIGNED NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_settings_key UNIQUE (setting_key),
    CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
