const { body } = require('express-validator');

const login = [
  body('username').trim().notEmpty().withMessage('username is required'),
  body('password').notEmpty().withMessage('password is required'),
];

module.exports = { login };
