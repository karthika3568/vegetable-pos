const router = require('express').Router();

router.use('/public', require('./public.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/roles', require('./roles.routes'));
router.use('/permissions', require('./permissions.routes'));
router.use('/categories', require('./categories.routes'));
router.use('/products', require('./products.routes'));
router.use('/suppliers', require('./suppliers.routes'));
router.use('/customers', require('./customers.routes'));
router.use('/purchases', require('./purchases.routes'));
router.use('/stock', require('./stock.routes'));
router.use('/sales', require('./sales.routes'));
router.use('/pos', require('./pos.routes'));
router.use('/credits', require('./credit.routes'));
router.use('/invoices', require('./invoice.routes'));
router.use('/expenses', require('./expenses.routes'));
router.use('/income', require('./income.routes'));
router.use('/profit', require('./profit.routes'));
router.use('/reports', require('./reports.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/tax-codes', require('./tax-codes.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/tax-codes', require('./tax-codes.routes'));
router.use('/pos', require('./pos.routes'));
router.use('/audit-logs', require('./audit-logs.routes'));

module.exports = router;