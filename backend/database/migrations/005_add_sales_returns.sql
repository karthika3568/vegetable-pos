-- =====================================================================
-- Phase 7C incremental migration: sales returns & cancellation.
--
-- Existing schema already anticipated the *money* of cancelled/returned
-- sales: sales.status is ENUM('completed','cancelled','returned') and
-- stock_transactions.transaction_type already includes 'return_sale'
-- and 'cancellation_reversal'. What is missing is an audit home for
-- returns/refunds, plus a way to reverse the credit a cancelled or
-- returned sale pushed onto a customer's balance. Exactly those two
-- gaps are filled here.
--
-- Documented business interpretations:
--   * Cancellation = a full void of a completed sale. The sale goes to
--     'cancelled'; the SOLD-FOR-RETURNED remainder of every line is
--     restored to stock via stock_transactions 'cancellation_reversal'
--     (reference_table 'sales'); the credit 'created' for this sale is
--     reversed (credit_reversal ledger row) by the outstanding amount
--     not already reversed, capped at the customer's current balance.
--     No 'refund' payment row is written - payment/receipt history is
--     append-only and a refund is an invoice-line / journal fact, not
--     a new cash receipt on the books.
--   * Return = a partial or full goods return of a completed sale. A
--     sale_returns header + sale_return_items rows freeze the returned
--     quantities at their ORIGINAL sale unit_price (frozen snapshot,
--     same invariant as invoices); stock is restored per line via
--     'return_sale' rows; credit is reversed by the refundable amount
--     (refund portion of the still-created credit, capped at the
--     customer's current balance). A return that covers every line
--     quantity flips the sale to status 'returned'.
--   * Credit cap: credit_reversal never exceeds the customer's current
--     balance, so customers.current_balance and the ledger CHECK
--     (balance_after >= 0) can never go negative. A customer who
--     already collected their credit simply has nothing left to reverse
--     and no reversal row is written.
--   * The old UNIQUE(sale_id) on credit_transactions is replaced by a
--     FUNCTIONAL unique index that enforces UNIQUE(sale_id) ONLY for
--     'created' rows (the create-once-per-sale idempotency backstop)
--     while allowing many 'credit_reversal' rows per sale (one per
--     return, plus one on cancellation). Functional key parts require
--     MySQL >= 8.0.13 (this deployment is 8.0.x).
--
-- FRESH installs: database/schema.sql + database/seed.sql already
-- include everything below.
-- EXISTING data: apply this file directly (never `npm run db:migrate`):
--
--     mysql -u root -p < database/migrations/005_add_sales_returns.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. sale_returns - one row per return event of a sale
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_returns (
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

-- ---------------------------------------------------------------------
-- 2. sale_return_items - returned lines frozen at original sale price
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_return_items (
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

-- ---------------------------------------------------------------------
-- 3. credit_transactions: add credit_reversal + keep 'created' unique
-- ---------------------------------------------------------------------
ALTER TABLE credit_transactions
    MODIFY COLUMN transaction_type
    ENUM('created','collected','credit_reversal') NOT NULL;

ALTER TABLE credit_transactions
    DROP INDEX uq_credit_transactions_sale,
    ADD UNIQUE KEY uq_credit_created_sale
        ((CASE WHEN transaction_type = 'created' THEN sale_id END));