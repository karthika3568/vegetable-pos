-- =====================================================================
-- Migration 009: Purchase Invoice Image
--
-- Adds optional web-relative path reference for supplier invoice photo.
-- The image file is stored on disk under uploads/purchase-invoices/
-- (served via express.static at /uploads/purchase-invoices), never in MySQL.
--
-- Applied manually (the project never runs npm run db:migrate).
-- The statement is additive - existing records remain intact with NULL.
-- =====================================================================

ALTER TABLE purchases
    ADD COLUMN invoice_image_path VARCHAR(255) NULL AFTER notes;
