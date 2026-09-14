const router = require('express').Router();

const posController = require('../controllers/pos.controller');
const posValidator = require('../validators/pos.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Cashier-scoped POS lookups - only `sales.create` is required.
router.use(
  authenticate,
  authorize('sales.create')
);

router.get(
  '/products',
  posValidator.listProducts,
  validate,
  posController.listProducts
);
router.get(
  '/customers',
  posValidator.listCustomers,
  validate,
  posController.listCustomers
);
router.get('/categories', posController.listCategories);
router.get('/tax-codes', posController.listTaxCodes);
router.get('/settings', posController.getSettings);

module.exports = router;