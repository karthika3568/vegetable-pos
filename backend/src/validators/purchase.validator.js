const { body, param, query } = require('express-validator');

const create = [
  body('supplierId')
    .isInt({ min: 1 })
    .withMessage('supplierId must be a positive integer'),

  body('invoiceNumber')
    .isString()
    .withMessage('invoiceNumber must be a string')
    .trim()
    .notEmpty()
    .withMessage('invoiceNumber is required')
    .isLength({ max: 50 })
    .withMessage('invoiceNumber must be at most 50 characters'),

  body('purchaseDate')
    .isISO8601()
    .withMessage('purchaseDate must be a valid date'),

  body('paymentType')
    .optional()
    .isIn(['cash', 'upi', 'credit'])
    .withMessage('paymentType must be one of: cash, upi, credit'),

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

  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('each item quantity must be a positive number'),

  body('items.*.purchasePrice')
    .isFloat({ min: 0 })
    .withMessage('each item purchasePrice must be a non-negative number'),
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

  query('supplierId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('supplierId must be a positive integer'),

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
    .isIn(['completed', 'cancelled'])
    .withMessage('status must be "completed" or "cancelled"'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const setStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('status')
    .isIn(['completed', 'cancelled'])
    .withMessage('status must be "completed" or "cancelled"'),
];

module.exports = {
  create,
  getById,
  list,
  setStatus,
};