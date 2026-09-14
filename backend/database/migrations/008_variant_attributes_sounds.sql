-- =====================================================================
-- Migration 008: VARIANT ATTRIBUTE OPTIONS + SOUND PREFERENCES
--
--   1. product_variants.attributes (JSON) - preselected attribute
--      options (quality / size / variety / origin / organic / color /
--      processing) stored per variant. JSON keeps the shape flexible
--      while the API validator enforces the allowed keys.
--   2. Sound preference settings (sound_enabled + per-sound toggles),
--      served to the POS through the pos.settings allowlist.
--
-- Applied manually (the project never runs npm run db:migrate).
-- All statements are incremental / additive - nothing is dropped.
-- =====================================================================

ALTER TABLE product_variants
    ADD COLUMN attributes JSON NULL AFTER selling_price;

CREATE INDEX idx_product_variants_name ON product_variants(variant_name);

INSERT INTO settings (setting_key, setting_value, description) VALUES
    ('sound_enabled', 'on',   'Master switch for application sounds (off mutes everything)'),
    ('sound_product', 'on',   'Sound when a product is added to the cart'),
    ('sound_payment', 'on',   'Sound when a payment is recorded successfully'),
    ('sound_invoice', 'on',   'Sound when an invoice is generated'),
    ('sound_error',   'on',   'Sound on an error / failed operation')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);