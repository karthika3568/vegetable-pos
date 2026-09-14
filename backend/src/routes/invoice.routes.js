const router = require('express').Router();

const invoiceController = require('../controllers/invoice.controller');
const invoiceValidator = require('../validators/invoice.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Invoices are the read-only representation of sales history, so every
// endpoint uses the existing sales.view permission - no new permission.

router.get(
  '/',
  authenticate,
  authorize('sales.view'),
  invoiceValidator.list,
  validate,
  invoiceController.list
);

// by-number must be registered before /:saleId.
router.get(
  '/by-number/:invoiceNumber',
  authenticate,
  authorize('sales.view'),
  invoiceValidator.getByNumber,
  validate,
  invoiceController.getByNumber
);

router.get(
  '/:saleId',
  authenticate,
  authorize('sales.view'),
  invoiceValidator.getById,
  validate,
  invoiceController.getById
);

module.exports = router;