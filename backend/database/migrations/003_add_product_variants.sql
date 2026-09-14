-- =====================================================================
-- Phase 4 incremental migration: product variants / types.
--
-- Adds the product_variants master-data table (optional subtypes of a
-- product, e.g. Tomato -> Local / Hybrid), each variant with its own
-- purchase and selling price. If you already ran `npm run db:migrate`
-- and have data you want to keep, run this file instead of re-running
-- schema.sql (which DROPs every table). If you're fine reprovisioning
-- from scratch, the updated schema.sql already includes this table and
-- you don't need to run this file.
--
--     CREATE TABLE IF NOT EXISTS ...
--
-- Variant names are unique WITHIN a product (partitioned by
-- product_id); the same name may exist under a different product.
-- No hard deletes: variants are disabled via is_active so future
-- per-variant stock / sales / purchase history stays resolvable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_variants (
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