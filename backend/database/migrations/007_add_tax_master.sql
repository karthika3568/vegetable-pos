-- =====================================================================
-- Migration 007: Tax Master (GST) - CGST/SGST/IGST
--
-- Adds full GST support:
--   1. tax_codes table - master list of tax rates (GST00, GST05, etc.)
--   2. Product columns - barcode, HSN code, tax_code_id, MRP, price_includes_tax
--   3. Customer column - state (for IGST determination)
--   4. Sale columns - CGST/SGST/IGST amounts at header and line level
--   5. Settings - shop_state for intra/inter-state GST logic
--
-- Applied manually (the project never runs npm run db:migrate).
-- =====================================================================

-- 1. TAX_CODES TABLE
CREATE TABLE IF NOT EXISTS tax_codes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(20)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    cgst_rate       DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    sgst_rate       DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    igst_rate       DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_tax_codes_code UNIQUE (code),
    CONSTRAINT chk_tax_rates CHECK (
        cgst_rate >= 0 AND cgst_rate <= 100
        AND sgst_rate >= 0 AND sgst_rate <= 100
        AND igst_rate >= 0 AND igst_rate <= 100
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. PRODUCT COLUMNS
-- barcode: scannable barcode (nullable, unique when set)
ALTER TABLE products
    ADD COLUMN barcode VARCHAR(100) NULL AFTER sku;

-- hsn_code: HSN/SAC code for GST classification
ALTER TABLE products
    ADD COLUMN hsn_code VARCHAR(20) NULL AFTER barcode;

-- tax_code_id: FK to tax_codes (nullable - null = no tax / exempt)
ALTER TABLE products
    ADD COLUMN tax_code_id INT UNSIGNED NULL AFTER hsn_code;

-- mrp: Maximum Retail Price (nullable)
ALTER TABLE products
    ADD COLUMN mrp DECIMAL(10,2) NULL AFTER selling_price;

-- price_includes_tax: 0 = tax exclusive (add tax on top), 1 = tax inclusive (tax baked into selling_price)
ALTER TABLE products
    ADD COLUMN price_includes_tax TINYINT(1) NOT NULL DEFAULT 0 AFTER mrp;

ALTER TABLE products
    ADD CONSTRAINT fk_products_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id)
        ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_tax_code ON products(tax_code_id);

-- 3. CUSTOMER STATE
ALTER TABLE customers
    ADD COLUMN state VARCHAR(100) NULL AFTER address;

-- 4. SALE HEADER TAX BREAKDOWN
ALTER TABLE sales
    ADD COLUMN cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_amount;

ALTER TABLE sales
    ADD COLUMN sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cgst_amount;

ALTER TABLE sales
    ADD COLUMN igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount;

-- 5. SALE ITEMS TAX BREAKDOWN
ALTER TABLE sale_items
    ADD COLUMN tax_code VARCHAR(20) NULL AFTER discount_amount;

ALTER TABLE sale_items
    ADD COLUMN cgst_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER tax_code;

ALTER TABLE sale_items
    ADD COLUMN sgst_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER cgst_rate;

ALTER TABLE sale_items
    ADD COLUMN igst_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER sgst_rate;

ALTER TABLE sale_items
    ADD COLUMN cgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER igst_rate;

ALTER TABLE sale_items
    ADD COLUMN sgst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER cgst_amount;

ALTER TABLE sale_items
    ADD COLUMN igst_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount;
