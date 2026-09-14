-- =====================================================================
-- Baseline seed data - NOT sample/demo business data.
-- This only seeds the fixed reference data the system needs to boot:
-- roles, a core permission set, one initial admin user, and default
-- settings. No fake sales/purchases/customers are created here.
-- =====================================================================

INSERT INTO roles (name, description) VALUES
    ('admin',   'Full system access'),
    ('manager', 'Manage products, stock, purchases, reports'),
    ('cashier', 'Operate POS, process sales and payments');

INSERT INTO permissions (code, module, description) VALUES
    ('sales.create',      'sales',     'Create a POS sale'),
    ('sales.cancel',      'sales',     'Cancel/return a sale'),
    ('sales.view',        'sales',     'View sales history'),
    ('purchases.create',  'purchases', 'Record a supplier purchase'),
    ('purchases.view',    'purchases', 'View purchase history'),
    ('stock.adjust',      'stock',     'Manually adjust stock quantity'),
    ('stock.view',        'stock',     'View stock levels'),
    ('products.manage',   'products',  'Create/edit/disable products'),
    ('customers.manage',  'customers', 'Create/edit customers, take credit payments'),
    ('suppliers.manage',  'suppliers', 'Create/edit suppliers'),
    ('expenses.manage',   'expenses',  'Record shop expenses'),
    ('reports.view',      'reports',   'View dashboard and reports'),
    ('users.manage',      'users',     'Create/edit users and permissions'),
    ('settings.manage',   'settings',  'Change shop settings'),
    ('credit.create',     'credit',    'Create customer credit from a completed sale'),
    ('credit.collect',    'credit',    'Collect outstanding customer credit'),
    ('credit.view',       'credit',    'View customer credit balances and history');

-- Default admin user. This is a REAL bcrypt hash (cost 10) of the
-- development-only password 'ChangeMe123!', generated via:
--   npm run hash-password -- "ChangeMe123!"
-- Generate your own hash and replace it for any real deployment; never
-- use this developer credential in production. Change the password on
-- first login.
INSERT INTO users (role_id, username, email, password_hash, full_name, status)
VALUES (
    (SELECT id FROM roles WHERE name = 'admin'),
    'admin',
    'admin@example.com',
    '$2b$10$4hkSOLnx8R830vrCJMzomOKt2r2H6JnnIEsLUYJyBGpxZbhjWPaEy',
    'System Administrator',
    'active'
);

-- Grant the admin user every defined permission.
INSERT INTO user_permissions (user_id, permission_id, is_granted, granted_by)
SELECT (SELECT id FROM users WHERE username = 'admin'), p.id, 1, (SELECT id FROM users WHERE username = 'admin')
FROM permissions p;

INSERT INTO tax_codes (code, name, cgst_rate, sgst_rate, igst_rate, is_active) VALUES
    ('GST00', 'Nil Rate / Exempt',  0.00, 0.00, 0.00, 1),
    ('GST05', '5% GST',             2.50, 2.50, 5.00, 1),
    ('GST12', '12% GST',            6.00, 6.00, 12.00, 1),
    ('GST18', '18% GST',            9.00, 9.00, 18.00, 1),
    ('GST28', '28% GST',           14.00, 14.00, 28.00, 1);

INSERT INTO settings (setting_key, setting_value, description) VALUES
    ('shop_name',           'My Vegetable Shop', 'Displayed on invoices and reports'),
    ('currency',             'INR',               'Currency code used across the system'),
    ('tax_rate_percent',     '0',                 'Default tax percentage applied at POS'),
    ('invoice_prefix',       'INV-',              'Prefix for generated sale invoice numbers'),
    ('low_stock_threshold',  '5',                 'Default reorder alert threshold (used if a product has no reorder_level set)'),
    ('shop_state',           'Maharashtra',       'State of the shop for GST calculation (IGST for inter-state, CGST+SGST for intra-state)');
