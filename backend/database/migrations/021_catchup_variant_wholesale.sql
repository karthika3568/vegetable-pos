-- =====================================================================
-- 021: Catch-up migration for databases that predate variant tracking
-- and wholesale/GST-mode pricing.
--
-- Found while reconciling against a real production dump
-- (vegetable_shop_pos.sql): that database was missing
--   - product_variants tracking columns on purchase_items, sale_items,
--     stock, stock_transactions (migration 020's job - never applied
--     to that database)
--   - products.wholesale_price and sales.sale_type (retail/wholesale)
--     entirely - there was NO prior migration anywhere in this repo
--     that adds them, even though schema.sql (the fresh-install
--     baseline) has always included them and backend/src/services/
--     sale.service.js already depends on both columns existing.
--
-- This migration is idempotent (IF NOT EXISTS / IF EXISTS guards, safe
-- on MySQL 8.0.29+) so it is safe to run whether or not migration 020
-- was already applied, and safe to run more than once.
-- =====================================================================

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10,2) NULL AFTER selling_price;

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS sale_type ENUM('retail','wholesale') NOT NULL DEFAULT 'retail' AFTER payment_type;

ALTER TABLE purchase_items
    ADD COLUMN IF NOT EXISTS variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE sale_items
    ADD COLUMN IF NOT EXISTS variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE stock
    ADD COLUMN IF NOT EXISTS variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE stock_transactions
    ADD COLUMN IF NOT EXISTS variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE purchase_items ADD INDEX IF NOT EXISTS idx_purchase_items_variant (variant_id);
ALTER TABLE sale_items ADD INDEX IF NOT EXISTS idx_sale_items_variant (variant_id);
ALTER TABLE stock ADD INDEX IF NOT EXISTS idx_stock_variant (variant_id);
ALTER TABLE stock_transactions ADD INDEX IF NOT EXISTS idx_stock_tx_variant (variant_id);

-- stock's uniqueness must include variant_id once the column exists.
-- Guarded: only touches the index if it's still the old (product_id)-only
-- shape, so this is a no-op on a database that already has migration
-- 020 applied.
SET @old_stock_unique := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock' AND INDEX_NAME = 'uq_stock_product'
);
SET @sql := IF(@old_stock_unique > 0,
    'ALTER TABLE stock DROP INDEX uq_stock_product, ADD CONSTRAINT uq_stock_product_variant UNIQUE (product_id, variant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
