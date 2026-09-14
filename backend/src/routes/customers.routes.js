const router = require('express').Router();
const customerController = require('../controllers/customer.controller');
const customerValidator = require('../validators/customer.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('customers.manage'));

router.get('/', customerValidator.list, validate, customerController.list);
router.get('/:id', customerValidator.getById, validate, customerController.getById);
router.post('/', customerValidator.create, validate, customerController.create);
router.put('/:id', customerValidator.update, validate, customerController.update);
router.patch('/:id/status', customerValidator.setStatus, validate, customerController.setStatus);

module.exports = router;