const { body, param, query } = require('express-validator');

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'other'];

const createFromSale = [
  body('saleId')
    .isInt({ min: 1 })
    .withMessage('saleId must be a positive integer'),
];

const collect = [
  param('customerId')
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),

  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a positive number'),

  body('method')
    .isIn(PAYMENT_METHODS)
    .withMessage(`method must be one of: ${PAYMENT_METHODS.join(', ')}`),

  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('notes must be at most 255 characters'),
];

const getById = [
  param('customerId')
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),
];

const getTransactions = [
  param('customerId')
    .isInt({ min: 1 })
    .withMessage('customerId must be a positive integer'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const list = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),

  query('outstanding')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('outstanding must be "true" or "false"'),

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
  createFromSale,
  collect,
  getById,
  getTransactions,
  list,
};