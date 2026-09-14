const { body, param, query } = require('express-validator');

const list = [
  query('search')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('search must be at most 255 characters'),

  query('category')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('category must be at most 50 characters'),

  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('fromDate must be a valid date'),

  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('toDate must be a valid date'),

  query('sortBy')
    .optional()
    .isIn(['id', 'date', 'amount', 'category'])
    .withMessage('sortBy must be one of "id", "date", "amount", "category"'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be "asc" or "desc"'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const getById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

const create = [
  body('category')
    .isString()
    .withMessage('category must be a string')
    .trim()
    .notEmpty()
    .withMessage('category is required')
    .isLength({ max: 50 })
    .withMessage('category must be at most 50 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('description must be at most 255 characters'),

  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('amount must be a number greater than 0'),

  body('expenseDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('expenseDate must be a valid date'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('category')
    .optional()
    .isString()
    .withMessage('category must be a string')
    .trim()
    .notEmpty()
    .withMessage('category must not be empty')
    .isLength({ max: 50 })
    .withMessage('category must be at most 50 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('description must be at most 255 characters'),

  body('amount')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('amount must be a number greater than 0'),

  body('expenseDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('expenseDate must be a valid date'),
];

module.exports = {
  list,
  getById,
  create,
  update,
};