-- =====================================================================
-- Migration 008: PRODUCT IMAGES
--
-- Adds a single web-relative path reference for the product photo.
-- The binary image file itself is stored on disk under <root>/uploads/
-- (served via express.static at /uploads), never in MySQL - the
-- database only keeps the URL path so rows stay small and the schema
-- stays portable.
--
-- Applied manually (the project never runs npm run db:migrate).
-- The statement is incremental / additive - nothing is dropped.
-- =====================================================================

ALTER TABLE products
    ADD COLUMN image_path VARCHAR(255) NULL AFTER price_includes_tax;