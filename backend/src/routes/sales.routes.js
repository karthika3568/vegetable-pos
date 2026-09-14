const router = require('express').Router();

const saleController = require('../controllers/sale.controller');
const saleValidator = require('../validators/sale.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get(
  '/',
  authenticate,
  authorize('sales.view'),
  saleValidator.list,
  validate,
  saleController.list
);

router.get(
  '/:id',
  authenticate,
  authorize('sales.view'),
  saleValidator.getById,
  validate,
  saleController.getById
);

router.post(
  '/',
  authenticate,
  authorize('sales.create'),
  saleValidator.create,
  validate,
  saleController.create
);

router.patch(
  '/:saleId/cancel',
  authenticate,
  authorize('sales.cancel'),
  saleValidator.cancel,
  validate,
  saleController.cancel
);

router.post(
  '/:saleId/return',
  authenticate,
  authorize('sales.cancel'),
  saleValidator.returnSale,
  validate,
  saleController.returnSale
);

module.exports = router;