const { body, param, query } = require('express-validator');

const create = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('code is required')
    .isLength({ max: 20 })
    .withMessage('code must be at most 20 characters'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('name is required')
    .isLength({ max: 100 })
    .withMessage('name must be at most 100 characters'),

  body('cgstRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('cgstRate must be between 0 and 100'),

  body('sgstRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('sgstRate must be between 0 and 100'),

  body('igstRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('igstRate must be between 0 and 100'),
];

const update = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('id must be a positive integer'),

  body('code')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('code must be at most 20 characters'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('name must be at most 100 characters'),

  body('cgstRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('cgstRate must be between 0 and 100'),

  body('sgstRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('sgstRate must be between 0 and 100'),

  body('igstRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('igstRate must be between 0 and 100'),
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
