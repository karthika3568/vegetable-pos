/**
 * Report validators - shared query validation for every /reports endpoint.
 *
 * Common rules:
 *   - fromDate / toDate are optional ISO dates; the report service then
 *     runs the same strict normalizeDate + round-trip check used by the
 *     profit module (so 2026-02-31 and fromDate > toDate both fail).
 *   - page/limit drive pagination (limit clamped to 100).
 *   - sortBy is validated against a per-endpoint allowlist in the service
 *     AND here, so an unknown column can never reach ORDER BY.
 *   - sortOrder is asc/desc only.
 */

const { query } = require('express-validator');

const dateChecks = [
  query('fromDate').optional({ values: 'falsy' }).isISO8601().withMessage('fromDate must be a valid date'),
  query('toDate').optional({ values: 'falsy' }).isISO8601().withMessage('toDate must be a valid date'),
];

const paginationChecks = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
  query('sortOrder').optional({ values: 'falsy' }).isIn(['asc', 'desc']).withMessage('sortOrder must be asc or desc'),
  query('search').optional({ values: 'falsy' }).isString().trim(),
];

const sales = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['date', 'total', 'status', 'id']).withMessage('sortBy not allowed for this report'),
  query('status').optional({ values: 'falsy' }).isIn(['completed', 'cancelled', 'returned']).withMessage('status must be completed, cancelled or returned'),
  query('paymentType').optional({ values: 'falsy' }).isIn(['cash', 'credit', 'partial']).withMessage('paymentType must be cash, credit or partial'),
  query('customerId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('customerId must be a positive integer').toInt(),
];

const purchases = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['date', 'total', 'supplier', 'id']).withMessage('sortBy not allowed for this report'),
  query('status').optional({ values: 'falsy' }).isIn(['completed', 'cancelled']).withMessage('status must be completed or cancelled'),
  query('supplierId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('supplierId must be a positive integer').toInt(),
];

const expenses = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['date', 'amount', 'category', 'id']).withMessage('sortBy not allowed for this report'),
  query('category').optional({ values: 'undefined' }).isString().trim().notEmpty().withMessage('category cannot be empty'),
];

const income = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['date', 'amount', 'category', 'id']).withMessage('sortBy not allowed for this report'),
  query('category').optional({ values: 'undefined' }).isString().trim().notEmpty().withMessage('category cannot be empty'),
];

const profit = [...dateChecks];

const stock = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['name', 'sku', 'current', 'id']).withMessage('sortBy not allowed for this report'),
  query('categoryId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('categoryId must be a positive integer').toInt(),
];

const credit = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['balance', 'name', 'id']).withMessage('sortBy not allowed for this report'),
  query('customerId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('customerId must be a positive integer').toInt(),
  query('status').optional({ values: 'falsy' }).isIn(['active', 'inactive']).withMessage('status must be active or inactive'),
];

const customers = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['name', 'gross', 'salesCount']).withMessage('sortBy not allowed for this report'),
];



const products = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['name', 'gross', 'quantitySold']).withMessage('sortBy not allowed for this report'),
  query('categoryId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('categoryId must be a positive integer').toInt(),
  query('search').optional({ values: 'falsy' }).isString().trim(),
];

const suppliers = [
  ...dateChecks,
  ...paginationChecks,
  query('sortBy').optional({ values: 'falsy' }).isIn(['name', 'total', 'purchaseCount']).withMessage('sortBy not allowed for this report'),
];

module.exports = { sales, purchases, expenses, income, profit, stock, credit, customers, products, suppliers };