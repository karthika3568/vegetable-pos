const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const dashboardValidator = require('../validators/dashboard.validator');
const dashboardController = require('../controllers/dashboard.controller');

router.use(authenticate);
router.use(authorize('reports.view'));

router.get('/', dashboardValidator.dashboard, validate, dashboardController.getDashboard);

module.exports = router;