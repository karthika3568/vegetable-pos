const router = require('express').Router();
const supplierController = require('../controllers/supplier.controller');
const supplierValidator = require('../validators/supplier.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('suppliers.manage'));

router.get('/', supplierValidator.list, validate, supplierController.list);
router.get('/:id', supplierValidator.getById, validate, supplierController.getById);
router.post('/', supplierValidator.create, validate, supplierController.create);
router.put('/:id', supplierValidator.update, validate, supplierController.update);
router.patch('/:id/status', supplierValidator.setStatus, validate, supplierController.setStatus);

module.exports = router;