const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const dashboardValidator = require('../validators/dashboard.validator');
const dashboardController = require('../controllers/dashboard.controller');
const { resolveBranch } = require('../middleware/branchScope');

router.use(authenticate);
router.use(authorize('reports.view'));
router.use(resolveBranch);

router.get('/', dashboardValidator.dashboard, validate, dashboardController.getDashboard);

module.exports = router;