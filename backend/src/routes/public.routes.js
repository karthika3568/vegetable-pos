const router = require('express').Router();
const publicController = require('../controllers/public.controller');

// Deliberately no authenticate: this endpoint must work for the login
// screen to render in the right language before an account exists.
router.get('/app-config', publicController.getAppConfig);

module.exports = router;