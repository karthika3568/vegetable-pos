const router = require('express').Router();

const purchaseOrderController = require('../controllers/purchase-order.controller');
const purchaseOrderValidator = require('../validators/purchase-order.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get(
  '/',
  authenticate,
  authorize('purchases.view'),
  purchaseOrderValidator.list,
  validate,
  purchaseOrderController.list
);

router.get(
  '/:id',
  authenticate,
  authorize('purchases.view'),
  purchaseOrderValidator.getId,
  validate,
  purchaseOrderController.getById
);

router.post(
  '/',
  authenticate,
  authorize('purchases.create'),
  purchaseOrderValidator.create,
  validate,
  purchaseOrderController.create
);

router.patch(
  '/:id',
  authenticate,
  authorize('purchases.create'),
  purchaseOrderValidator.update,
  validate,
  purchaseOrderController.update
);

router.post(
  '/:id/send',
  authenticate,
  authorize('purchases.create'),
  purchaseOrderValidator.getId,
  validate,
  purchaseOrderController.send
);

router.post(
  '/:id/receive',
  authenticate,
  authorize('purchases.create'),
  purchaseOrderValidator.receive,
  validate,
  purchaseOrderController.receive
);

router.post(
  '/:id/cancel',
  authenticate,
  authorize('purchases.create'),
  purchaseOrderValidator.getId,
  validate,
  purchaseOrderController.cancel
);

module.exports = router;