-- =====================================================================
-- 022: Multi-branch architecture
-- Adds branches, branch_products (per-branch product availability),
-- purchase_returns/purchase_return_items, pre_bookings/pre_booking_items,
-- and branch_id scoping columns on stock, stock_transactions, sales,
-- purchases, purchase_orders.
--
-- Run 021_catchup_variant_wholesale.sql first on any database that
-- predates variant tracking / wholesale pricing.
--
-- Safe for an existing database with data: creates a "Main Branch" row
-- first, then backfills every new branch_id column to it, so existing
-- stock/sales/purchases keep working unchanged under the new schema.
-- Idempotent (IF NOT EXISTS / IF EXISTS guards, safe on MySQL 8.0.29+).
-- =====================================================================

CREATE TABLE IF NOT EXISTS branches (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    is_main         TINYINT(1)   NOT NULL DEFAULT 0,
    address         VARCHAR(255) NULL,
    phone           VARCHAR(20)  NULL,
    gstin           VARCHAR(20)  NULL,
    invoice_header  VARCHAR(255) NULL,
    invoice_footer  VARCHAR(255) NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_branches_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE branches ADD INDEX IF NOT EXISTS idx_branches_status (status);

-- Seed the Main Branch that every pre-existing row backfills to. Pulls
-- shop_name/address from settings when present so the branch record
-- starts with real values instead of a placeholder.
INSERT INTO branches (name, is_main, address, phone, status)
SELECT
    COALESCE((SELECT setting_value FROM settings WHERE setting_key = 'shop_name' LIMIT 1), 'Main Branch'),
    1, NULL, NULL, 'active'
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE is_main = 1);

CREATE TABLE IF NOT EXISTS branch_products (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    branch_id       INT UNSIGNED NOT NULL,
    product_id      INT UNSIGNED NOT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_branch_products UNIQUE (branch_id, product_id),
    CONSTRAINT fk_branch_products_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_branch_products_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE branch_products ADD INDEX IF NOT EXISTS idx_branch_products_product (product_id);
ALTER TABLE branch_products ADD INDEX IF NOT EXISTS idx_branch_products_active (branch_id, is_active);

-- Every existing product becomes available in the Main Branch so
-- Products/POS/Stock keep showing the same data they did before.
INSERT INTO branch_products (branch_id, product_id, is_active)
SELECT b.id, p.id, 1
FROM products p, (SELECT id FROM branches WHERE is_main = 1 LIMIT 1) b
WHERE NOT EXISTS (
    SELECT 1 FROM branch_products bp WHERE bp.branch_id = b.id AND bp.product_id = p.id
);

-- branch_id scoping columns: added NULL-able first, backfilled to the
-- Main Branch, then locked to NOT NULL - avoids hard-coding branch id 1.
ALTER TABLE stock ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL AFTER id;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL AFTER id;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL AFTER id;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL AFTER id;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id INT UNSIGNED NULL AFTER id;

UPDATE stock SET branch_id = (SELECT id FROM branches WHERE is_main = 1 LIMIT 1) WHERE branch_id IS NULL;
UPDATE stock_transactions SET branch_id = (SELECT id FROM branches WHERE is_main = 1 LIMIT 1) WHERE branch_id IS NULL;
UPDATE sales SET branch_id = (SELECT id FROM branches WHERE is_main = 1 LIMIT 1) WHERE branch_id IS NULL;
UPDATE purchases SET branch_id = (SELECT id FROM branches WHERE is_main = 1 LIMIT 1) WHERE branch_id IS NULL;
UPDATE purchase_orders SET branch_id = (SELECT id FROM branches WHERE is_main = 1 LIMIT 1) WHERE branch_id IS NULL;

ALTER TABLE stock MODIFY COLUMN branch_id INT UNSIGNED NOT NULL;
ALTER TABLE stock_transactions MODIFY COLUMN branch_id INT UNSIGNED NOT NULL;
ALTER TABLE sales MODIFY COLUMN branch_id INT UNSIGNED NOT NULL;
ALTER TABLE purchases MODIFY COLUMN branch_id INT UNSIGNED NOT NULL;
ALTER TABLE purchase_orders MODIFY COLUMN branch_id INT UNSIGNED NOT NULL;

-- stock's uniqueness becomes (branch_id, product_id, variant_id). Guarded:
-- only touches the index if it's still in the pre-branch shape.
SET @old_stock_unique := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock' AND INDEX_NAME = 'uq_stock_product_variant'
);
SET @sql := IF(@old_stock_unique > 0,
    'ALTER TABLE stock DROP INDEX uq_stock_product_variant, ADD CONSTRAINT uq_stock_branch_product_variant UNIQUE (branch_id, product_id, variant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- MySQL has no "ADD CONSTRAINT IF NOT EXISTS" for foreign keys, so each
-- one is guarded via information_schema + dynamic SQL (safe to re-run).
DROP PROCEDURE IF EXISTS _add_branch_fk_if_missing;
DELIMITER //
CREATE PROCEDURE _add_branch_fk_if_missing(IN p_table VARCHAR(64), IN p_constraint VARCHAR(64))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_constraint
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table, ' ADD CONSTRAINT ', p_constraint,
            ' FOREIGN KEY (branch_id) REFERENCES branches(id) ON UPDATE CASCADE ON DELETE RESTRICT');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

CALL _add_branch_fk_if_missing('stock', 'fk_stock_branch');
CALL _add_branch_fk_if_missing('stock_transactions', 'fk_stock_tx_branch');
CALL _add_branch_fk_if_missing('sales', 'fk_sales_branch');
CALL _add_branch_fk_if_missing('purchases', 'fk_purchases_branch');
CALL _add_branch_fk_if_missing('purchase_orders', 'fk_purchase_orders_branch');

DROP PROCEDURE IF EXISTS _add_branch_fk_if_missing;

ALTER TABLE stock ADD INDEX IF NOT EXISTS idx_stock_branch (branch_id);
ALTER TABLE stock_transactions ADD INDEX IF NOT EXISTS idx_stock_tx_branch (branch_id);
ALTER TABLE sales ADD INDEX IF NOT EXISTS idx_sales_branch (branch_id);
ALTER TABLE purchases ADD INDEX IF NOT EXISTS idx_purchases_branch (branch_id);
ALTER TABLE purchase_orders ADD INDEX IF NOT EXISTS idx_purchase_orders_branch (branch_id);

-- Purchase returns
CREATE TABLE IF NOT EXISTS purchase_returns (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_id       INT UNSIGNED NOT NULL,
    return_date       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason            VARCHAR(255) NULL,
    adjustment_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_by        INT UNSIGNED NOT NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_returns_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_returns_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_purchase_returns_adjustment CHECK (adjustment_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE purchase_returns ADD INDEX IF NOT EXISTS idx_purchase_returns_purchase (purchase_id);
ALTER TABLE purchase_returns ADD INDEX IF NOT EXISTS idx_purchase_returns_created_at (created_at);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_id        INT UNSIGNED NOT NULL,
    purchase_item_id INT UNSIGNED NOT NULL,
    product_id       INT UNSIGNED NOT NULL,
    variant_id       INT UNSIGNED NOT NULL DEFAULT 0,
    quantity         DECIMAL(10,3) NOT NULL,
    unit_cost        DECIMAL(10,2) NOT NULL,
    line_total       DECIMAL(12,2) NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_return_items_return FOREIGN KEY (return_id) REFERENCES purchase_returns(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_return_items_purchase_item FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_return_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_purchase_return_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_purchase_return_items_line_total CHECK (line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE purchase_return_items ADD INDEX IF NOT EXISTS idx_purchase_return_items_return (return_id);
ALTER TABLE purchase_return_items ADD INDEX IF NOT EXISTS idx_purchase_return_items_purchase_item (purchase_item_id);
ALTER TABLE purchase_return_items ADD INDEX IF NOT EXISTS idx_purchase_return_items_product (product_id);

-- Customer pre-bookings
CREATE TABLE IF NOT EXISTS pre_bookings (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    branch_id         INT UNSIGNED NOT NULL,
    booking_number    VARCHAR(50)  NOT NULL,
    customer_id       INT UNSIGNED NULL,
    customer_name     VARCHAR(150) NULL,
    customer_phone    VARCHAR(20)  NULL,
    booking_date      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    needed_by_date    DATE NULL,
    notes             VARCHAR(255) NULL,
    status            ENUM('pending','converted','cancelled') NOT NULL DEFAULT 'pending',
    converted_sale_id INT UNSIGNED NULL,
    converted_at      DATETIME NULL,
    created_by        INT UNSIGNED NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_pre_bookings_number UNIQUE (booking_number),
    CONSTRAINT fk_pre_bookings_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_pre_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_pre_bookings_converted_sale FOREIGN KEY (converted_sale_id) REFERENCES sales(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_pre_bookings_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pre_bookings ADD INDEX IF NOT EXISTS idx_pre_bookings_branch (branch_id);
ALTER TABLE pre_bookings ADD INDEX IF NOT EXISTS idx_pre_bookings_status (status);
ALTER TABLE pre_bookings ADD INDEX IF NOT EXISTS idx_pre_bookings_customer (customer_id);

CREATE TABLE IF NOT EXISTS pre_booking_items (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pre_booking_id  INT UNSIGNED NOT NULL,
    product_id      INT UNSIGNED NOT NULL,
    variant_id      INT UNSIGNED NOT NULL DEFAULT 0,
    quantity        DECIMAL(10,3) NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pre_booking_items_booking FOREIGN KEY (pre_booking_id) REFERENCES pre_bookings(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_pre_booking_items_product FOREIGN KEY (product_id) REFERENCES products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_pre_booking_items_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pre_booking_items ADD INDEX IF NOT EXISTS idx_pre_booking_items_booking (pre_booking_id);
ALTER TABLE pre_booking_items ADD INDEX IF NOT EXISTS idx_pre_booking_items_product (product_id);
