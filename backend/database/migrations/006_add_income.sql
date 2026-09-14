-- =====================================================================
-- Migration 006: INCOME table
--
-- Phase 8A - Expenses & Income Management.
--
-- The financial module gains a dedicated `income` ledger for NON-SALES
-- receipts (scrap sales, rent received, service charges, other
-- operating income). Key principles:
--
--   1. Income is FINANCIALLY ISOLATED from the other ledgers on
--      purpose. Sales revenue lives in sales/sale_items/payments,
--      customer credit lives in credit_transactions, and supplier
--      payments live in purchases. Income money must NEVER be
--      recorded in those tables (double-counting).

--   2. The table is created-by-only (no payment_method, no status).
--      This mirrors the existing `expenses` design and keeps every
--      row immutable history: once recorded it can be updated
--      (its values re-audited) but never hard-deleted. traceability
--      is guaranteed by the insert-only audit_logs trail.

--   3. amount > 0 is enforced in the schema (CHECK constraint, as on
--      expenses) AND validated + rounded to 2 decimal places in the
--      service layer. The column type DECIMAL(12,2) stores money.

--   4. created_by FK -> users RESTRICT: an income row can never
--      outlive its creator user.
--
-- Applied manually (the project never runs npm run db:migrate).
-- =====================================================================

CREATE TABLE IF NOT EXISTS income (
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