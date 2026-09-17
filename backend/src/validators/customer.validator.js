const { body, param, query } = require('express-validator');

const create = [
  body('name')
    .isString()
    .withMessage('name must be a string')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ max: 150 })
    .withMessage('name must be at most 150 characters'),

  body('phone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('phone must be at most 20 characters'),

  body('email')
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage('email must be valid')
    .isLength({ max: 100 })
    .withMessage('email must be at most 100 characters'),

  body('address')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('address must be at most 255 characters'),

  body('state')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('state must be at most 100 characters'),

  body('creditLimit')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('creditLimit must be a non-negative number'),

  body('openingBalance')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('openingBalance must be a non-negative number'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('name')
    .optional()
    .isString()
    .withMessage('name must be a string')
    .trim()
    .notEmpty()
    .withMessage('name cannot be empty')
    .isLength({ max: 150 })
    .withMessage('name must be at most 150 characters'),

  body('phone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('phone must be at most 20 characters'),

  body('email')
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage('email must be valid')
    .isLength({ max: 100 })
    .withMessage('email must be at most 100 characters'),

  body('address')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('address must be at most 255 characters'),

  body('state')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('state must be at most 100 characters'),

  body('creditLimit')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('creditLimit must be a non-negative number'),

  body('openingBalance')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('openingBalance must be a non-negative number'),
];

const setStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('status')
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),
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

  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('status must be "active" or "inactive"'),

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
  create,
  update,
  setStatus,
  getById,
  list,
};