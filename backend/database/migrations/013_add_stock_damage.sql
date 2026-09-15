-- =====================================================================
-- Migration 013: STOCK DAMAGE / WASTAGE
--
--   Widens stock_transactions.transaction_type to include 'damage',
--   a pure stock-reduction / wastage movement (NOT a sale, NOT a
--   purchase, NOT an invoice) recorded through the new endpoint
--   POST /api/v1/stock/:productId/damage.
--
--   Non-destructive: only the ENUM allowed-value list is expanded.
--   No table is dropped, no existing rows are touched, and existing
--   transaction types keep their exact semantics. Damage rows reuse the
--   existing columns for everything else:
--     quantity_change  -> negative quantity (stock out)
--     quantity_before  -> snapshot before the damage
--     quantity_after   -> snapshot after the damage
--     note             -> reason (+ optional free-text note)
--     created_by       -> recorded-by user
--     created_at       -> actual transaction timestamp
--
--   Applied manually (the project never runs npm run db:migrate).
-- =====================================================================

ALTER TABLE stock_transactions
    MODIFY COLUMN transaction_type ENUM(
        'purchase',
        'sale',
        'return_purchase',
        'return_sale',
        'adjustment',
        'cancellation_reversal',
        'damage'
    ) NOT NULL;