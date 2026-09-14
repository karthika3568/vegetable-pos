-- =====================================================================
-- Phase 7 incremental migration: credit management.
--
-- The existing payments table records money RECEIVED (POS sale
-- payments, customer credit repayments, supplier purchase payments) -
-- see its schema comment. Credit CREATION (money owed after a
-- completed sale) has no home in the current schema, so a dedicated
-- credit ledger table is genuinely required to give customers a full
-- immutable +CREDIT_CREATED / -CREDIT_COLLECTED history.
--
-- Documented business interpretations (against the live schema):
--   * customers.current_balance is the single outstanding-credit
--     balance. It is maintained ONLY by the credit module, never by
--     Customer CRUD (customers.manage can edit name/phone/address/
--     credit_limit, never current_balance).
--   * customers.credit_limit = 0 means "no credit allowed"; a positive
--     credit_limit is a hard ceiling on current_balance. A credit
--     creation that would push current_balance above credit_limit is
--     rejected.
--   * A credit COLLECTION is also written to payments as a
--     payment_type 'credit_payment' row with sale_id NULL,
--     purchase_id NULL and customer_id set - satisfying
--     chk_payments_one_target and the append-only "credit history also
--     lives in payments" design. The ledger row links to it via
--     payment_id. Sale payment history is never rewritten.
--   * Credit is created at most ONCE per sale: UNIQUE(sale_id) is the
--     database-backed idempotency backstop (sale_id is only set on
--     'created' rows; NULL sale_ids on 'collected' rows are exempt).
--
-- If you already have data, do NOT re-run `npm run db:migrate` (it
-- DROPs every table). Apply this file directly:
--
--     mysql -u root -p < database/migrations/004_add_credit_transactions.sql
--
-- For fresh installs database/schema.sql already includes this table
-- and database/seed.sql already seeds the credit.* permissions.
-- =====================================================================

CREATE TABLE IF NOT EXISTS credit_transactions (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id      INT UNSIGNED NOT NULL,
    transaction_type ENUM('created','collected') NOT NULL,
    amount           DECIMAL(12,2) NOT NULL, -- always positive; direction implied by transaction_type
    sale_id          INT UNSIGNED NULL,       -- set ONLY on 'created' rows
    payment_id       INT UNSIGNED NULL,       -- set ONLY on 'collected' rows
    balance_before   DECIMAL(12,2) NOT NULL,
    balance_after    DECIMAL(12,2) NOT NULL,
    notes            VARCHAR(255) NULL,
    created_by       INT UNSIGNED NOT NULL,   -- cashier / collector
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_credit_transactions_sale UNIQUE (sale_id),
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