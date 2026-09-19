
-- =====================================================================
-- Migration 016: OPENING BALANCES & SUPPLIER PAYMENTS
--
-- 1. Suppliers Opening Balance:
--    Records the amount already owed to a supplier before the POS went live.
--    This is NOT a purchase, not a payment, and not stock movement.
--
-- 2. Customers Opening Balance:
--    Records any existing receivable credit balance before using the POS.
--
-- 3. Supplier Payments:
--    Adds optional supplier_id to payments to support payments recorded
--    directly against a supplier's account (such as paying opening balance).
--
-- Non-destructive and idempotent.
-- =====================================================================

ALTER TABLE suppliers
    ADD COLUMN opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER address;

ALTER TABLE customers
    ADD COLUMN opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER address;

ALTER TABLE payments
    ADD COLUMN supplier_id INT UNSIGNED NULL AFTER customer_id;
