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
  '/history',
  authenticate,
  authorize('purchases.view'),
  purchaseValidator.history,
  validate,
  purchaseController.history
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

router.post(
  '/:id/payments',
  authenticate,
  authorize('purchases.create'),
  purchaseValidator.recordPayment,
  validate,
  purchaseController.recordPayment
);

router.patch(
  '/:id/actual-amount',
  authenticate,
  authorize('purchases.create'),
  purchaseValidator.setActualAmount,
  validate,
  purchaseController.setActualAmount
);

router.get(
  '/:id/payments',
  authenticate,
  authorize('purchases.view'),
  purchaseValidator.getPayments,
  validate,
  purchaseController.getPayments
);

module.exports = router;