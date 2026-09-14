const router = require('express').Router();

const purchaseController = require('../controllers/purchase.controller');
const purchaseValidator = require('../validators/purchase.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { uploadInvoiceImageOptional } = require('../middleware/upload');

router.get(
  '/',
  authenticate,
  authorize('purchases.view'),
  purchaseValidator.list,
  validate,
  purchaseController.list
);

router.get(
  '/:id',
  authenticate,
  authorize('purchases.view'),
  purchaseValidator.getById,
  validate,
  purchaseController.getById
);

router.post(
  '/',
  authenticate,
  authorize('purchases.create'),
  uploadInvoiceImageOptional,
  purchaseValidator.create,
  validate,
  purchaseController.create
);

router.patch(
  '/:id/status',
  authenticate,
  authorize('purchases.create'),
  purchaseValidator.setStatus,
  validate,
  purchaseController.setStatus
);

module.exports = router;