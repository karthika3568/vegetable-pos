const router = require('express').Router();
const roleController = require('../controllers/role.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get('/', authenticate, authorize('users.manage'), roleController.list);

module.exports = router;
