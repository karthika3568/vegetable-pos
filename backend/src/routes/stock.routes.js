const router = require('express').Router();

const stockController = require('../controllers/stock.controller');
const stockValidator = require('../validators/stock.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { requireBranch } = require('../middleware/branchScope');

router.use(authenticate, requireBranch);

router.get(
  '/',
  authorize('stock.view'),
  stockValidator.list,
  validate,
  stockController.list
);

router.get(
  '/:productId',
  authorize('stock.view'),
  stockValidator.getByProduct,
  validate,
  stockController.getByProduct
);

router.get(
  '/:productId/transactions',
  authorize('stock.view'),
  stockValidator.transactions,
  validate,
  stockController.transactions
);

router.patch(
  '/:productId/adjust',
  authorize('stock.adjust'),
  stockValidator.adjust,
  validate,
  stockController.adjust
);

router.post(
  '/:productId/damage',
  authorize('stock.adjust'),
  stockValidator.damage,
  validate,
  stockController.damage
);

module.exports = router;