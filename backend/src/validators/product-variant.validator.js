const { body, param, query } = require('express-validator');

const productId = param('productId')
  .isInt({ min: 1 })
  .withMessage('productId must be a positive integer');

const variantId = param('variantId')
  .isInt({ min: 1 })
  .withMessage('variantId must be a positive integer');

const nameField = body('name')
  .isString()
  .withMessage('name must be a string')
  .trim()
  .notEmpty()
  .withMessage('name is required')
  .isLength({ max: 100 })
  .withMessage('name must be at most 100 characters');

const purchasePriceField = body('purchasePrice')
  .isFloat({ min: 0 })
  .withMessage('purchasePrice must be a non-negative number');

const sellingPriceField = body('sellingPrice')
  .isFloat({ min: 0 })
  .withMessage('sellingPrice must be a non-negative number');

const attributeOptions = {
  quality: ['Premium', 'Standard', 'Grade A', 'Grade B'],
  size: ['Small', 'Medium', 'Large'],
  variety: ['Local', 'Hybrid', 'Country', 'Other'],
  origin: ['Local', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Other'],
  organic: ['Organic', 'Normal'],
  color: ['Red', 'Green', 'Yellow', 'White', 'Purple'],
  processing: ['Fresh', 'Cleaned', 'Peeled', 'Cut', 'Packed'],
};

const attributesField = body('attributes')
  .optional({ nullable: true })
  .isObject()
  .withMessage('attributes must be an object')
  .custom((attributes) => {
    for (const [key, value] of Object.entries(attributes)) {
      if (!Object.prototype.hasOwnProperty.call(attributeOptions, key)) {
        throw new Error(`Unsupported attribute: ${key}`);
      }
      if (!attributeOptions[key].includes(value)) {
        throw new Error(`Invalid value for attribute: ${key}`);
      }
    }
    return true;
  });

const create = [
  productId,
  nameField,
  purchasePriceField,
  sellingPriceField,
  attributesField,
];

const update = [
  productId,
  variantId,
  nameField,
  purchasePriceField,
  sellingPriceField,
  attributesField,
];

const setStatus = [
  productId,
  variantId,
  body('status')
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),
];

const getById = [
  productId,
  variantId,
];

const list = [
  productId,
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),
  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

module.exports = {
  create,
  update,
  setStatus,
  getById,
  list,
};