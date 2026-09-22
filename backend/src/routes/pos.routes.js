const router = require('express').Router();

const posController = require('../controllers/pos.controller');
const posValidator = require('../validators/pos.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { resolveBranch } = require('../middleware/branchScope');

// Cashier-scoped POS lookups - only `sales.create` is required. Branch
// is resolved (not required) so the POS product list can be filtered to
// the selected branch's branch_products/stock without breaking a caller
// that has not adopted branch selection yet.
router.use(
  authenticate,
  authorize('sales.create'),
  resolveBranch
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