const { body, param } = require('express-validator');

const create = [
  param('purchaseId')
    .isInt({ min: 1 })
    .withMessage('purchaseId must be a positive integer'),

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

  body('items.*.variantId')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('each item variantId must be a non-negative integer when provided'),

  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('each item quantity must be a positive number'),
];

const list = [
  param('purchaseId')
    .isInt({ min: 1 })
    .withMessage('purchaseId must be a positive integer'),
];

module.exports = {
  create,
  list,
};
