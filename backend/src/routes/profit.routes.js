const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const profitValidator = require('../validators/profit.validator');
const profitController = require('../controllers/profit.controller');

router.use(authenticate);
router.use(authorize('reports.view'));

router.get('/', profitValidator.list, validate, profitController.list);

module.exports = router;