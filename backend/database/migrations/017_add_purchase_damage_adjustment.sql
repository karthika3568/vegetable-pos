-- Migration 017: Add damage adjustment columns to purchases table.
-- These track the monetary value of damaged goods and whether the
-- supplier has agreed to deduct that amount from the payable.
-- Non-destructive: only adds columns, does not modify existing data.

ALTER TABLE purchases
  ADD COLUMN damage_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER paid_amount,
  ADD COLUMN damage_adjustment_accepted TINYINT(1) NOT NULL DEFAULT 0
    AFTER damage_adjustment;
