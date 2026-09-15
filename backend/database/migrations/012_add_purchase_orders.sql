-- =====================================================================
-- Migration 012: Purchase Orders + Goods Receiving
--
-- Two-stage procurement: a Purchase Order (PO) is created first with NO
-- stock effect; stock only moves when goods are RECEIVED against the
-- PO. Each receive creates a row in the existing `purchases` /
-- `purchase_items` tables (the project's purchase-history + stock
-- ledger vehicle), linked back to the PO via purchases.purchase_order_id.
--
-- Semantics (enforced by the PO module):
--   * purchase_orders.status drives the workflow:
--       draft -> sent -> (partially_received) -> received
--       draft / sent / partially_received -> cancelled
--   * purchase_order_items:
--       ordered_quantity  - what was ordered
--       received_quantity - good quantity actually received (only this
--                           ever becomes a purchases purchase_items row,
--                           i.e. the ONLY quantity that increases stock)
--       damaged_quantity  - received but not saleable (recorded, never
--                           stocked, never a purchase_items row)
--   * A draft PO stores only intent: no purchases, no stock movement.
--   * Receiving writes a `completed` purchase (payment_type 'credit',
--     paid 0 / payment_status 'unpaid' so payment stays owned by the
--     payments module) and reconciles stock via the existing
--     stockRepository.syncPurchaseStock (transaction_type 'purchase').
--
-- Applied manually (the project never runs npm run db:migrate).
-- =====================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    po_number               VARCHAR(50)  NOT NULL,
    supplier_id             INT UNSIGNED NOT NULL,
    order_date              DATE NOT NULL,
    expected_delivery_date  DATE NULL,
    notes                   VARCHAR(255) NULL,
    status                  ENUM('draft','sent','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
    created_by              INT UNSIGNED NOT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchase_orders_po_number UNIQUE (po_number),
    CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_date ON purchase_orders(order_date);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id   INT UNSIGNED NOT NULL,
    product_id          INT UNSIGNED NOT NULL,
    ordered_quantity    DECIMAL(10,3) NOT NULL,
    expected_price      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    received_quantity   DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    damaged_quantity    DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchase_order_items_line UNIQUE (purchase_order_id, product_id),
    CONSTRAINT fk_purchase_order_items_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_purchase_order_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_purchase_order_items_ordered CHECK (ordered_quantity > 0),
    CONSTRAINT chk_purchase_order_items_price CHECK (expected_price >= 0),
    CONSTRAINT chk_purchase_order_items_received CHECK (received_quantity >= 0),
    CONSTRAINT chk_purchase_order_items_damaged CHECK (damaged_quantity >= 0),
    CONSTRAINT chk_purchase_order_items_received_le_ordered CHECK (received_quantity + damaged_quantity <= ordered_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_purchase_order_items_product ON purchase_order_items(product_id);

-- Link a goods-receiving purchase (receipt) back to the PO that
-- generated it, without making purchases.purchase_order_id required
-- (direct purchases without a PO must keep working).
ALTER TABLE purchases
    ADD COLUMN purchase_order_id INT UNSIGNED NULL AFTER supplier_id,
    ADD CONSTRAINT fk_purchases_purchase_order FOREIGN KEY (purchase_order_id)
        REFERENCES purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_purchases_purchase_order ON purchases(purchase_order_id);