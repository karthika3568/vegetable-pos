const { param, query } = require('express-validator');

const list = [
  query('userId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('userId must be a positive integer'),

  query('action')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('action must be at most 100 characters'),

  query('entityType')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('entityType must be at most 100 characters'),

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

const getById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

module.exports = { list, getById };