const { body, param, query } = require('express-validator');

const create = [
  body('supplierId')
    .isInt({ min: 1 })
    .withMessage('supplierId must be a positive integer'),

  body('orderDate')
    .isISO8601()
    .withMessage('orderDate must be a valid date'),

  body('expectedDeliveryDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('expectedDeliveryDate must be a valid date'),

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

  body('items.*.orderedQuantity')
    .isFloat({ gt: 0 })
    .withMessage('each item orderedQuantity must be a positive number'),

  body('items.*.expectedPrice')
    .isFloat({ min: 0 })
    .withMessage('each item expectedPrice must be a non-negative number'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('supplierId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('supplierId must be a positive integer'),

  body('orderDate')
    .optional()
    .isISO8601()
    .withMessage('orderDate must be a valid date'),

  body('expectedDeliveryDate')
    .optional({ nullable: true })
    .custom((value) => value === null || value === '' || !Number.isNaN(Date.parse(value)))
    .withMessage('expectedDeliveryDate must be a valid date, empty or null'),

  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('notes must be at most 255 characters'),

  body('items')
    .optional()
    .isArray({ min: 1, max: 200 })
    .withMessage('items must be a non-empty array of at most 200 items'),

  body('items.*.productId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('each item productId must be a positive integer'),

  body('items.*.orderedQuantity')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('each item orderedQuantity must be a positive number'),

  body('items.*.expectedPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('each item expectedPrice must be a non-negative number'),
];

const getId = [
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
    .isIn(['draft', 'sent', 'partially_received', 'received', 'cancelled'])
    .withMessage('status must be one of: draft, sent, partially_received, received, cancelled'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

const receive = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('receivedDate')
    .optional()
    .isISO8601()
    .withMessage('receivedDate must be a valid date'),

  body('items')
    .isArray({ min: 1, max: 200 })
    .withMessage('items must be a non-empty array of at most 200 items'),

  body('items.*.purchaseOrderItemId')
    .isInt({ min: 1 })
    .withMessage('each item purchaseOrderItemId must be a positive integer'),

  body('items.*.receivedQuantity')
    .isFloat({ min: 0 })
    .withMessage('each item receivedQuantity must be a non-negative number'),

  body('items.*.damagedQuantity')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('each item damagedQuantity must be a non-negative number'),

  body('items.*.purchasePrice')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('each item purchasePrice must be a non-negative number'),
];

module.exports = {
  create,
  update,
  getId,
  list,
  receive,
};