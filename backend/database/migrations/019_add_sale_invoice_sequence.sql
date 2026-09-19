-- =====================================================================
-- 019: Per-prefix gap-free invoice counter for sales
-- =====================================================================
-- Sales invoice numbers were `${invoice_prefix}${sale.id}` up to now
-- (INV-74, INV-63, INV-48...). Because `sales.id` is an auto-increment
-- that also jumps on cancelled / failed / returned inserts, the DISPLAYED
-- invoice numbers had gaps. The counter below fixes that:
--
--   * SEQUENTIAL      - a sale gets the NEXT number for its prefix
--                       (INV-001, INV-002, ...), not its column id
--   * CONCURRENCY-SAFE- the row is read with SELECT ... FOR UPDATE
--                       inside the sale-creation transaction, so two
--                       cashiers can never be handed the same number
--   * CONTIGUOUS      - the counter is incremented in the SAME statement
--                       and the sale + counter commit atomically, so a
--                       rolled-back / failed sale attempt never burns a
--                       number (INV-002 cannot follow INV-001 if the
--                       002 attempt failed)
--
-- The counter is keyed by the SAME prefix that sales use (INV-, from
-- settings 'invoice_prefix'), so each prefix has its own run and sales
-- keep their prefix format. `sales.invoice_number` stays UNIQUE; the
-- leading zeroes are cosmetic (plain-text search still matches).
--
-- This file is the MANUAL upgrade for EXISTING deployments:
--   mysql -u root -p your_database < database/migrations/019_add_sale_invoice_sequence.sql
-- Fresh databases get the same table from database/schema.sql
-- (migrate.js applies schema.sql).
--
-- The table deliberately keeps the legacy misspelled name
-- `invoice_sequencens` so this migration stays in lockstep with
-- schema.sql and the seed counter row.
-- =====================================================================
CREATE TABLE IF NOT EXISTS invoice_sequencens (
    prefix        VARCHAR(50) NOT NULL,
    next_invoice  INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Back-fill the counter ONLY for prefixes that already exist, seeding it
-- so the next sale continues after the highest invoice number already in
-- use for that prefix. Prefixes with no sales default to next_invoice = 1.
INSERT INTO invoice_sequencens (prefix, next_invoice)
SELECT
    inv.invoice_prefix,
    COALESCE(MAX(CAST(SUBSTRING(s.invoice_number,
                                LENGTH(inv.invoice_prefix) + 1)
                     AS UNSIGNED)),
             0) + 1
FROM (SELECT setting_value AS invoice_prefix
      FROM settings
      WHERE setting_key = 'invoice_prefix') inv
LEFT JOIN sales s
       ON LEFT(s.invoice_number, LENGTH(inv.invoice_prefix)) =
          inv.invoice_prefix
      AND s.invoice_number NOT LIKE 'TMP-%'
GROUP BY inv.invoice_prefix
ON DUPLICATE KEY UPDATE next_invoice = next_invoice;
