-- =====================================================================
-- Migration 011: Product Price History
--
-- Adds an append-only ledger of product pricing so the analytics module
-- can answer "what price applied on date X" without deriving old prices
-- from today's price.
--
-- Semantics:
--   * Every row means: from `effective_from` onward, this product's
--     selling_price / cost_price were in force, until the next row (or
--     now). This is a point-in-time (state) ledger, not a record of
--     every sale.
--   * Rows are written by the product module whenever:
--       - a product is created            (initial price, effective NOW()),
--       - an update changes selling_price or cost_price (new row with the
--         new prices, effective NOW()).
--   * No row is ever updated/deleted once written.
--   * `created_by` records who changed the price; NULL when unknown
--     (e.g. DB-seeded products, backfill).
--
-- Backfill for existing products (before this migration there was no
-- price versioning, so the ONLY recorded pricing facts are the current
-- products.selling_price/cost_price and the product's creation time):
-- one row per product, effective from products.created_at, with the
-- current prices. No price is invented: this is the earliest date at
-- which we can truthfully say the stored value was in force.
--
-- Applied manually (the project never runs npm run db:migrate).
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_price_history (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id     INT UNSIGNED NOT NULL,
    selling_price  DECIMAL(10,2) NOT NULL,
    cost_price     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    effective_from DATETIME      NOT NULL,
    created_by     INT UNSIGNED NULL,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_price_history_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_product_price_history_selling CHECK (selling_price >= 0),
    CONSTRAINT chk_product_price_history_cost CHECK (cost_price >= 0),
    KEY idx_product_price_history_product_effective (product_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO product_price_history (product_id, selling_price, cost_price, effective_from)
SELECT p.id, p.selling_price, p.cost_price, p.created_at
FROM products p
LEFT JOIN product_price_history ph ON ph.product_id = p.id
WHERE ph.id IS NULL;