const { body, param, query } = require('express-validator');

const create = [
  body('customerId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),

  body('customerName')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('customerName must be at most 150 characters'),

  body('customerPhone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('customerPhone must be at most 20 characters'),

  body('neededByDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('neededByDate must be a valid date'),

  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('notes must be at most 255 characters'),

  body('items')
    .isArray({ min: 1, max: 200 })
    .withMessage('items must be a non-empty array of at most 200 items'),

  body('items.*.productId')
    .isInt({ min: 1 })
    .withMessage('each item productId must be a positive integer'),

  body('items.*.variantId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('each item variantId must be a positive integer when provided'),

  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('each item quantity must be a positive number'),

  body('items.*.unitPrice')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('each item unitPrice must be a non-negative number'),
];

const getById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

const list = [
  query('status')
    .optional()
    .isIn(['pending', 'converted', 'cancelled'])
    .withMessage('status must be "pending", "converted" or "cancelled"'),

  query('customerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const cancel = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

const convert = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('saleType')
    .optional()
    .isIn(['retail', 'wholesale'])
    .withMessage('saleType must be "retail" or "wholesale"'),

  body('discount')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('discount must be a non-negative number'),

  body('payments')
    .optional()
    .isArray({ max: 20 })
    .withMessage('payments must be an array of at most 20 payment records'),

  body('payments.*.method')
    .optional()
    .isIn(['cash', 'card', 'upi', 'bank_transfer', 'other'])
    .withMessage('payment method is invalid'),

  body('payments.*.amount')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('each payment amount must be a positive number'),

  body('creditRequested')
    .optional()
    .isBoolean()
    .withMessage('creditRequested must be a boolean'),
];

module.exports = {
  create,
  getById,
  list,
  cancel,
  convert,
};
