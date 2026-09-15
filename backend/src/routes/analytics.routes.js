const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const analyticsValidator = require('../validators/analytics.validator');
const analyticsController = require('../controllers/analytics.controller');

router.use(authenticate);
router.use(authorize('reports.view'));

router.get('/products', analyticsValidator.listProducts, validate, analyticsController.listProducts);
router.get(
  '/products/:productId/sales-by-time',
  analyticsValidator.salesByTime,
  validate,
  analyticsController.salesByTime
);
router.get(
  '/products/:productId/sales',
  analyticsValidator.sales,
  validate,
  analyticsController.listSales
);
router.get(
  '/products/:productId/stock-transactions',
  analyticsValidator.stockTransactions,
  validate,
  analyticsController.stockTransactions
);
router.get(
  '/products/:productId/price-history',
  analyticsValidator.priceHistory,
  validate,
  analyticsController.priceHistory
);
router.get(
  '/products/:productId/price-as-of',
  analyticsValidator.priceAsOf,
  validate,
  analyticsController.priceAsOf
);
router.get(
  '/products/:productId',
  analyticsValidator.getProduct,
  validate,
  analyticsController.getProduct
);

module.exports = router;