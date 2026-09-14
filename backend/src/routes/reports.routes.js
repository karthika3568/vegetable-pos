const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const reportValidator = require('../validators/report.validator');
const reportController = require('../controllers/report.controller');

router.use(authenticate);
router.use(authorize('reports.view'));

router.get('/sales', reportValidator.sales, validate, reportController.sales);
router.get('/purchases', reportValidator.purchases, validate, reportController.purchases);
router.get('/expenses', reportValidator.expenses, validate, reportController.expenses);
router.get('/income', reportValidator.income, validate, reportController.income);
router.get('/profit', reportValidator.profit, validate, reportController.profit);
router.get('/stock', reportValidator.stock, validate, reportController.stock);
router.get('/credit', reportValidator.credit, validate, reportController.credit);
router.get('/customers', reportValidator.customers, validate, reportController.customers);
router.get('/products', reportValidator.products, validate, reportController.products);
router.get('/suppliers', reportValidator.suppliers, validate, reportController.suppliers);

module.exports = router;