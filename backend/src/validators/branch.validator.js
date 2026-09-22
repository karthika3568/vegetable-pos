const { body, param, query } = require('express-validator');

const create = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ max: 150 })
    .withMessage('name must be at most 150 characters'),

  body('address')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('address must be at most 255 characters'),

  body('phone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('phone must be at most 20 characters'),

  body('gstin')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('gstin must be at most 20 characters'),

  body('invoiceHeader')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('invoiceHeader must be at most 255 characters'),

  body('invoiceFooter')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('invoiceFooter must be at most 255 characters'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  ...create,
];

const getById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

const setStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('status')
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),
];

const list = [
  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),

  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),
];

const listProducts = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),
];

const setProducts = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('productIds')
    .isArray()
    .withMessage('productIds must be an array'),

  body('productIds.*')
    .isInt({ min: 1 })
    .withMessage('each productId must be a positive integer'),
];

module.exports = {
  create,
  update,
  getById,
  setStatus,
  list,
  listProducts,
  setProducts,
};
