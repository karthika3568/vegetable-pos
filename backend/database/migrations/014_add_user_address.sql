-- =====================================================================
-- Migration 014: USER ADDRESS
--
-- Adds optional profile address data without changing existing users,
-- authentication fields, roles, or permissions.
-- Applied manually; never run npm run db:migrate against an existing DB.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN address VARCHAR(255) NULL AFTER phone;