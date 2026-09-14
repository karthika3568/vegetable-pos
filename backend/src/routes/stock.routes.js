const router = require('express').Router();

const stockController = require('../controllers/stock.controller');
const stockValidator = require('../validators/stock.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get(
  '/',
  authenticate,
  authorize('stock.view'),
  stockValidator.list,
  validate,
  stockController.list
);

router.get(
  '/:productId',
  authenticate,
  authorize('stock.view'),
  stockValidator.getByProduct,
  validate,
  stockController.getByProduct
);

router.get(
  '/:productId/transactions',
  authenticate,
  authorize('stock.view'),
  stockValidator.transactions,
  validate,
  stockController.transactions
);

router.patch(
  '/:productId/adjust',
  authenticate,
  authorize('stock.adjust'),
  stockValidator.adjust,
  validate,
  stockController.adjust
);

module.exports = router;