const { body, param, query } = require('express-validator');

const TX_TYPES = [
  'purchase',
  'sale',
  'return_purchase',
  'return_sale',
  'adjustment',
  'cancellation_reversal',
];

const productId = param('productId')
  .isInt({ min: 1 })
  .withMessage('productId must be a positive integer');

const list = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),

  query('productStatus')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('productStatus must be "active" or "inactive"'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const getByProduct = [
  productId,
];

const adjust = [
  productId,

  body('delta')
    .isFloat()
    .withMessage('delta must be a number'),

  body('note')
    .isString()
    .withMessage('note must be a string')
    .trim()
    .notEmpty()
    .withMessage('note is required (reason for the stock change)')
    .isLength({ max: 255 })
    .withMessage('note must be at most 255 characters'),
];

const transactions = [
  productId,

  query('type')
    .optional()
    .isIn(TX_TYPES)
    .withMessage(`type must be one of: ${TX_TYPES.join(', ')}`),

  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('fromDate must be a valid date'),

  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('toDate must be a valid date'),

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
  list,
  getByProduct,
  adjust,
  transactions,
};