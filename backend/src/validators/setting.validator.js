const { body, param } = require('express-validator');

const getByKey = [
  param('key')
    .isString()
    .withMessage('key must be a string')
    .trim()
    .notEmpty()
    .withMessage('key is required')
    .isLength({ max: 100 })
    .withMessage('key must be at most 100 characters'),
];

const update = [
  param('key')
    .isString()
    .withMessage('key must be a string')
    .trim()
    .notEmpty()
    .withMessage('key is required')
    .isLength({ max: 100 })
    .withMessage('key must be at most 100 characters'),

  body('value')
    .isString()
    .withMessage('value must be a string'),

  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('description must be at most 255 characters'),
];

module.exports = {
  getByKey,
  update,
};