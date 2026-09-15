/**
 * Validation chains for the /analytics routes (Product Stock & Sales
 * Analytics). Same express-validator conventions as the rest of the app:
 * ISO dates, positive page/limit (limit capped at 100), coercible params.
 */

const { query, param } = require('express-validator');

const dateChecks = [
  query('fromDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('fromDate must be a valid date (YYYY-MM-DD)'),
  query('toDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('toDate must be a valid date (YYYY-MM-DD)'),
];

const paginationChecks = [
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
];

const productIdCheck = [
  param('productId').isInt({ min: 1 }).withMessage('productId must be a positive integer').toInt(),
];

const listProducts = [
  ...dateChecks,
  ...paginationChecks,
  query('search')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('search must be a string')
    .trim()
    .escape(),
];

const getProduct = [...productIdCheck, ...dateChecks];

const sales = [...productIdCheck, ...dateChecks, ...paginationChecks];

const salesByTime = [
  ...productIdCheck,
  ...dateChecks,
  query('slotHours')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 6 })
    .withMessage('slotHours must be an integer between 1 and 6')
    .toInt(),
];

const priceHistory = [...productIdCheck, ...paginationChecks];

const priceAsOf = [
  ...productIdCheck,
  query('date')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('date must be a valid date (YYYY-MM-DD)'),
];

const stockTransactions = [
  ...productIdCheck,
  ...dateChecks,
  ...paginationChecks,
  query('type')
    .optional({ values: 'falsy' })
    .isIn([
      'purchase',
      'sale',
      'return_purchase',
      'return_sale',
      'adjustment',
      'cancellation_reversal',
    ])
    .withMessage('type is not a valid stock transaction type'),
];

module.exports = {
  listProducts,
  getProduct,
  sales,
  salesByTime,
  priceHistory,
  priceAsOf,
  stockTransactions,
};