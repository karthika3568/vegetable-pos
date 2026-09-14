const router = require('express').Router();
const taxCodeController = require('../controllers/tax-code.controller');
const taxCodeValidator = require('../validators/tax-code.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const authorizeAny = require('../middleware/authorizeAny');

// Active tax-code lookup is needed by the PRODUCT form too (products.manage),
// so it is open to either settings managers or product managers. It must be
// declared before the settings.manage guard below so product managers are not
// locked out purely because the tax master module uses settings.manage.
router.get(
  '/active',
  authenticate,
  authorizeAny('settings.manage', 'products.manage'),
  taxCodeController.getActiveAll
);

router.use(authenticate, authorize('settings.manage'));

router.get('/', taxCodeValidator.list, validate, taxCodeController.list);
router.get('/:id', taxCodeValidator.getById, validate, taxCodeController.getById);
router.post('/', taxCodeValidator.create, validate, taxCodeController.create);
router.put('/:id', taxCodeValidator.update, validate, taxCodeController.update);
router.patch('/:id/status', taxCodeValidator.setStatus, validate, taxCodeController.setStatus);

module.exports = router;