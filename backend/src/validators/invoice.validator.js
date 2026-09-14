const { param, query } = require('express-validator');

const getById = [
  param('saleId')
    .isInt({ min: 1 })
    .withMessage('saleId must be a positive integer'),
];

const getByNumber = [
  param('invoiceNumber')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('invoiceNumber must be a string of at most 50 characters'),
];

const list = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),

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
  getById,
  getByNumber,
  list,
};