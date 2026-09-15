const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const revenueValidator = require('../validators/revenue.validator');
const revenueController = require('../controllers/revenue.controller');

router.use(authenticate);
router.use(authorize('reports.view'));

router.get('/', revenueValidator.list, validate, revenueController.list);

module.exports = router;