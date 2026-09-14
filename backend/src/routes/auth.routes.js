const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const authValidator = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');

// Public - this is how a token is obtained in the first place.
router.post('/login', authValidator.login, validate, authController.login);

// Authenticated - invalidates the caller's own current token(s).
router.post('/logout', authenticate, authController.logout);

// Authenticated - "who am I", used by the frontend to hydrate session state on load.
router.get('/me', authenticate, authController.me);

module.exports = router;
