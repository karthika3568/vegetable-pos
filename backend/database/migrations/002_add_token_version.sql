-- =====================================================================
-- Phase 3 incremental migration.
--
-- If you already ran `npm run db:migrate` in Phase 1/2 and have data
-- you want to keep, run this instead of re-running the full
-- schema.sql (which DROPs every table). If you're fine reprovisioning
-- from scratch, `npm run db:migrate:seed` already includes this change
-- via the updated schema.sql and you don't need this file.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER status;
