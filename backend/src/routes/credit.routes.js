const router = require('express').Router();

const creditController = require('../controllers/credit.controller');
const creditValidator = require('../validators/credit.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get(
  '/',
  authenticate,
  authorize('credit.view'),
  creditValidator.list,
  validate,
  creditController.list
);

router.post(
  '/',
  authenticate,
  authorize('credit.create'),
  creditValidator.createFromSale,
  validate,
  creditController.createFromSale
);

router.get(
  '/:customerId',
  authenticate,
  authorize('credit.view'),
  creditValidator.getById,
  validate,
  creditController.getCustomerCredit
);

router.post(
  '/:customerId/collect',
  authenticate,
  authorize('credit.collect'),
  creditValidator.collect,
  validate,
  creditController.collect
);

router.get(
  '/:customerId/transactions',
  authenticate,
  authorize('credit.view'),
  creditValidator.getTransactions,
  validate,
  creditController.getTransactions
);

module.exports = router;