const router = require('express').Router();
const permissionController = require('../controllers/permission.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.get('/', authenticate, authorize('users.manage'), permissionController.list);

module.exports = router;
