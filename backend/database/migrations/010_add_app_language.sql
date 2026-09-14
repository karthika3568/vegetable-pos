-- Adds an application language setting if missing
-- Migration: 010_add_app_language.sql
-- Inserts a default `app_language = 'en'` row only when not present.

INSERT INTO settings (setting_key, setting_value, description)
SELECT 'app_language', 'en', 'Application UI language (en|ta)'
WHERE NOT EXISTS (
  SELECT 1 FROM settings WHERE setting_key = 'app_language'
);
