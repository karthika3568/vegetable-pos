const router = require('express').Router();
const categoryController = require('../controllers/category.controller');
const categoryValidator = require('../validators/category.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('products.manage'));

router.get('/', categoryValidator.list, validate, categoryController.list);
router.get('/:id', categoryValidator.getById, validate, categoryController.getById);
router.post('/', categoryValidator.create, validate, categoryController.create);
router.put('/:id', categoryValidator.update, validate, categoryController.update);
router.patch('/:id/status', categoryValidator.setStatus, validate, categoryController.setStatus);

module.exports = router;
