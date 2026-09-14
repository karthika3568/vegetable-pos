const router = require('express').Router();
const auditController = require('../controllers/audit.controller');
const auditValidator = require('../validators/audit.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('audit.view'));

router.get('/', auditValidator.list, validate, auditController.list);
router.get('/:id', auditValidator.getById, validate, auditController.getById);

module.exports = router;