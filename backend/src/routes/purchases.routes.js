const router = require('express').Router();

const purchaseController = require('../controllers/purchase.controller');
const purchaseValidator = require('../validators/purchase.validator');
const purchaseReturnController = require('../controllers/purchase-return.controller');
const purchaseReturnValidator = require('../validators/purchase-return.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { uploadInvoiceImageOptional } = require('../middleware/upload');
const { requireBranch, resolveBranch } = require('../middleware/branchScope');

router.get(
  '/',
  authenticate,
  authorize('purchases.view'),
  resolveBranch,
  purchaseValidator.list,
  validate,
  purchaseController.list
);

router.get(
  '/history',
  authenticate,
  authorize('purchases.view'),
  resolveBranch,
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
  requireBranch,
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

router.post(
  '/:purchaseId/return',
  authenticate,
  authorize('purchases.create'),
  purchaseReturnValidator.create,
  validate,
  purchaseReturnController.create
);

router.get(
  '/:purchaseId/returns',
  authenticate,
  authorize('purchases.view'),
  purchaseReturnValidator.list,
  validate,
  purchaseReturnController.list
);

module.exports = router;