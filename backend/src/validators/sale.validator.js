const { body, param, query } = require('express-validator');

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'other'];

const create = [
  body('customerId')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),

  body('saleDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('saleDate must be a valid date'),

  body('saleType')
    .optional()
    .isIn(['retail', 'wholesale'])
    .withMessage('saleType must be "retail" or "wholesale"'),

  body('discount')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('discount must be a non-negative number'),

  body('items')
    .isArray({ min: 1, max: 200 })
    .withMessage('items must be a non-empty array of at most 200 items'),

  body('items.*.productId')
    .isInt({ min: 1 })
    .withMessage('each item productId must be a positive integer'),

  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('each item quantity must be a positive number'),

  body('items.*.discount')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('each item discount must be a non-negative number'),

  body('payments')
    .optional()
    .isArray({ max: 20 })
    .withMessage('payments must be an array of at most 20 payment records'),

  body('payments.*.method')
    .isIn(PAYMENT_METHODS)
    .withMessage(`payment method must be one of: ${PAYMENT_METHODS.join(', ')}`),

  body('payments.*.amount')
    .isFloat({ gt: 0 })
    .withMessage('each payment amount must be a positive number'),

  body('payments.*.notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('payment notes must be at most 255 characters'),

  body('creditRequested')
    .optional()
    .isBoolean()
    .withMessage('creditRequested must be a boolean'),
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

  query('customerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),

  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('fromDate must be a valid date'),

  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('toDate must be a valid date'),

  query('status')
    .optional()
    .isIn(['completed', 'cancelled', 'returned'])
    .withMessage('status must be "completed", "cancelled" or "returned"'),

  query('paymentType')
    .optional()
    .isIn(['cash', 'credit', 'partial'])
    .withMessage('paymentType must be "cash", "credit" or "partial"'),

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
  param('saleId')
    .isInt({ min: 1 })
    .withMessage('saleId must be a positive integer'),
];

const returnSale = [
  param('saleId')
    .isInt({ min: 1 })
    .withMessage('saleId must be a positive integer'),

  body('reason')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('reason must be at most 255 characters'),

  body('items')
    .isArray({ min: 1, max: 200 })
    .withMessage('items must be a non-empty array of at most 200 items'),

  body('items.*.productId')
    .isInt({ min: 1 })
    .withMessage('each item productId must be a positive integer'),

  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('each item quantity must be a positive number'),
];

module.exports = {
  create,
  getById,
  list,
  cancel,
  returnSale,
};