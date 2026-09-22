ALTER TABLE purchase_items
  ADD COLUMN variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE sale_items
  ADD COLUMN variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE stock
  ADD COLUMN variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

ALTER TABLE stock_transactions
  ADD COLUMN variant_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER product_id;

CREATE INDEX idx_purchase_items_variant ON purchase_items(variant_id);
CREATE INDEX idx_sale_items_variant ON sale_items(variant_id);
CREATE UNIQUE INDEX uq_stock_product_variant ON stock(product_id, variant_id);
CREATE INDEX idx_stock_variant ON stock(variant_id);
CREATE INDEX idx_stock_tx_variant ON stock_transactions(variant_id);
