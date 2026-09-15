const { body, param, query } = require('express-validator');

const create = [
  body('username')
    .trim()
    .notEmpty().withMessage('username is required')
    .isLength({ min: 3, max: 50 }).withMessage('username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage('username may only contain letters, numbers, dots, underscores and hyphens'),
  body('password')
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('email').optional({ nullable: true }).trim().isEmail().withMessage('email must be valid'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('phone must be at most 20 characters')
    .custom((value) => {
      const digitCount = (value.match(/\d/g) || []).length;
      if (!/^\+?[0-9()\s.-]+$/.test(value) || digitCount < 7) {
        throw new Error('phone must contain at least 7 digits and use a valid phone format');
      }
      return true;
    }),
  body('address').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('address must be at most 255 characters'),
  body('roleId').isInt({ min: 1 }).withMessage('roleId must be a positive integer'),
  body('permissions').optional().isArray().withMessage('permissions must be an array of permission codes'),
  body('permissions.*').optional().isString(),
];

const update = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('fullName').optional().trim().notEmpty().withMessage('fullName cannot be empty'),
  body('email').optional({ nullable: true }).trim().isEmail().withMessage('email must be valid'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('phone must be at most 20 characters')
    .custom((value) => {
      const digitCount = (value.match(/\d/g) || []).length;
      if (!/^\+?[0-9()\s.-]+$/.test(value) || digitCount < 7) {
        throw new Error('phone must contain at least 7 digits and use a valid phone format');
      }
      return true;
    }),
  body('address').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('address must be at most 255 characters'),
  body('roleId').optional().isInt({ min: 1 }).withMessage('roleId must be a positive integer'),
];

const setStatus = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('status must be active, inactive, or suspended'),
];

const setPermissions = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
  body('permissions').isArray().withMessage('permissions must be an array of permission codes'),
  body('permissions.*').isString(),
];

const getById = [
  param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
];

const list = [
  query('status').optional().isIn(['active', 'inactive', 'suspended']),
  query('roleId').optional().isInt({ min: 1 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

module.exports = { create, update, setStatus, setPermissions, getById, list };
