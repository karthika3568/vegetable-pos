-- Migration 018: Fix chk_payments_one_target so sale payments may carry
-- the sale's customer_id.
--
-- Context: a completed POS sale for a registered/named customer inserts
-- a payments row with BOTH sale_id and customer_id set (walk-in sales
-- keep customer_id NULL). The previous CHECK required customer_id NULL on
-- sale payments, so any database built from the old schema.sql rejected
-- every named-customer sale with a CHECK constraint violation inside the
-- sale transaction, rolling the whole sale back.
--
-- The corrected branch 1 keeps sale payments on their own target (no
-- purchase_id / supplier_id) while allowing the sale's customer_id.
-- The purchase / credit / supplier branches are unchanged, so no invalid
-- combination (sale+purchase, purchase+customer, customer+supplier, ...)
-- is newly permitted.
--
-- Non-destructive: only replaces a CHECK constraint; no data is touched.
-- The corrected DDL is also what schema.sql now ships, so fresh databases
-- born from schema.sql are identical to databases upgraded by this file.

ALTER TABLE payments DROP CHECK chk_payments_one_target;

ALTER TABLE payments
  ADD CONSTRAINT chk_payments_one_target CHECK (
    (sale_id IS NOT NULL AND purchase_id IS NULL AND supplier_id IS NULL) OR
    (sale_id IS NULL AND purchase_id IS NOT NULL AND customer_id IS NULL) OR
    (sale_id IS NULL AND purchase_id IS NULL AND customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (sale_id IS NULL AND purchase_id IS NULL AND customer_id IS NULL AND supplier_id IS NOT NULL)
  );