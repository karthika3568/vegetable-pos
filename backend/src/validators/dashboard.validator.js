const { query } = require('express-validator');

const dashboard = [
  query('fromDate').optional().isISO8601().withMessage('fromDate must be a valid date'),
  query('toDate').optional().isISO8601().withMessage('toDate must be a valid date'),
  query('top')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('top must be an integer between 1 and 20'),
];

module.exports = { dashboard };