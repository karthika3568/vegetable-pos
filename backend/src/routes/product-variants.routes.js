const router = require('express').Router({ mergeParams: true });
const productVariantController = require('../controllers/product-variant.controller');
const productVariantValidator = require('../validators/product-variant.validator');
const validate = require('../middleware/validate');

router.get('/', productVariantValidator.list, validate, productVariantController.list);
router.get('/:variantId', productVariantValidator.getById, validate, productVariantController.getById);
router.post('/', productVariantValidator.create, validate, productVariantController.create);
router.put('/:variantId', productVariantValidator.update, validate, productVariantController.update);
router.patch('/:variantId/status', productVariantValidator.setStatus, validate, productVariantController.setStatus);

module.exports = router;