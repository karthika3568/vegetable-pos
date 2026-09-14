const router = require('express').Router();
const settingController = require('../controllers/setting.controller');
const settingValidator = require('../validators/setting.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('settings.manage'));

router.get('/', settingController.list);
router.get('/:key', settingValidator.getByKey, validate, settingController.getByKey);
router.put('/:key', settingValidator.update, validate, settingController.update);

module.exports = router;