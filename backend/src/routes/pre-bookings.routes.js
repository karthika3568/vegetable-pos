const router = require('express').Router();

const preBookingController = require('../controllers/pre-booking.controller');
const preBookingValidator = require('../validators/pre-booking.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { requireBranch, resolveBranch } = require('../middleware/branchScope');

router.use(authenticate, authorize('bookings.manage'));

router.get('/', resolveBranch, preBookingValidator.list, validate, preBookingController.list);
router.get('/:id', preBookingValidator.getById, validate, preBookingController.getById);

router.post(
  '/',
  requireBranch,
  preBookingValidator.create,
  validate,
  preBookingController.create
);

router.patch(
  '/:id/cancel',
  preBookingValidator.cancel,
  validate,
  preBookingController.cancel
);

router.post(
  '/:id/convert',
  preBookingValidator.convert,
  validate,
  preBookingController.convert
);

module.exports = router;
