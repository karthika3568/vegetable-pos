const { body, param, query } = require('express-validator');

const create = [
  body('name')
    .trim()
    .notEmpty().withMessage('name is required')
    .isLength({ max: 100 }).withMessage('name must be at most 100 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('description must be at most 255 characters'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('name must be at most 100 characters'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('description must be at most 255 characters'),
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