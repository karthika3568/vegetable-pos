const router = require('express').Router();

const productController = require('../controllers/product.controller');
const productImageController = require('../controllers/productImage.controller');
const productValidator = require('../validators/product.validator');
const { uploadProductImage } = require('../middleware/upload');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('products.manage'));

router.get('/', productValidator.list, validate, productController.list);
router.get('/:id', productValidator.getById, validate, productController.getById);
router.post('/', productValidator.create, validate, productController.create);
router.put('/:id', productValidator.update, validate, productController.update);
router.patch('/:id/status', productValidator.setStatus, validate, productController.setStatus);

router.put('/:id/image', productValidator.getById, validate, uploadProductImage, productImageController.upload);
router.delete('/:id/image', productValidator.getById, validate, productImageController.remove);

router.use('/:productId/variants', require('./product-variants.routes'));

module.exports = router;