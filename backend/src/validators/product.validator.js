const { body, param, query } = require('express-validator');

const ALLOWED_UNITS = [
  'kg',
  'g',
  'piece',
  'dozen',
  'bunch',
  'litre',
];

const create = [
  body('productCode')
    .trim()
    .notEmpty()
    .withMessage('productCode is required')
    .isLength({ max: 50 })
    .withMessage('productCode must be at most 50 characters'),

  body('barcode')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('barcode must be at most 100 characters'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ max: 150 })
    .withMessage('name must be at most 150 characters'),

  body('categoryId')
    .isInt({ min: 1 })
    .withMessage('categoryId must be a positive integer'),

  body('unit')
    .isIn(ALLOWED_UNITS)
    .withMessage(`unit must be one of: ${ALLOWED_UNITS.join(', ')}`),

  body('purchasePrice')
    .isFloat({ min: 0 })
    .withMessage('purchasePrice must be a non-negative number'),

  body('sellingPrice')
    .isFloat({ min: 0 })
    .withMessage('sellingPrice must be a non-negative number'),

  body('hsnCode')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('hsnCode must be at most 20 characters'),

  body('taxCodeId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('taxCodeId must be a positive integer'),

  body('mrp')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('mrp must be a non-negative number'),

  body('priceIncludesTax')
    .optional()
    .isBoolean()
    .withMessage('priceIncludesTax must be true or false'),

  body('currentStock')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('currentStock must be a non-negative number'),

  body('minimumStock')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('minimumStock must be a non-negative number'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ max: 150 })
    .withMessage('name must be at most 150 characters'),

  body('categoryId')
    .isInt({ min: 1 })
    .withMessage('categoryId must be a positive integer'),

  body('unit')
    .isIn(ALLOWED_UNITS)
    .withMessage(`unit must be one of: ${ALLOWED_UNITS.join(', ')}`),

  body('purchasePrice')
    .isFloat({ min: 0 })
    .withMessage('purchasePrice must be a non-negative number'),

  body('sellingPrice')
    .isFloat({ min: 0 })
    .withMessage('sellingPrice must be a non-negative number'),

  body('hsnCode')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('hsnCode must be at most 20 characters'),

  body('taxCodeId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('taxCodeId must be a positive integer'),

  body('mrp')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('mrp must be a non-negative number'),

  body('priceIncludesTax')
    .optional()
    .isBoolean()
    .withMessage('priceIncludesTax must be true or false'),

  body('currentStock')
    .isFloat({ min: 0 })
    .withMessage('currentStock must be a non-negative number'),

  body('minimumStock')
    .isFloat({ min: 0 })
    .withMessage('minimumStock must be a non-negative number'),
];

const setStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('status')
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),
];

const getById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

const list = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),

  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),

  query('categoryId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('categoryId must be a positive integer'),

  query('lowStockOnly')
    .optional()
    .isBoolean()
    .withMessage('lowStockOnly must be true or false'),

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