const router = require('express').Router();
const userController = require('../controllers/user.controller');
const userValidator = require('../validators/user.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Every route below requires authentication AND the users.manage
// permission (which admin always has via the isAdmin bypass).
router.use(authenticate, authorize('users.manage'));

router.get('/', userValidator.list, validate, userController.list);
router.get('/:id', userValidator.getById, validate, userController.getById);
router.post('/', userValidator.create, validate, userController.create);
router.put('/:id', userValidator.update, validate, userController.update);
router.patch('/:id/status', userValidator.setStatus, validate, userController.setStatus);
router.put('/:id/permissions', userValidator.setPermissions, validate, userController.setPermissions);
router.post('/:id/logout', userValidator.getById, validate, userController.forceLogout);

module.exports = router;
