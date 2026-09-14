const router = require('express').Router();
const incomeController = require('../controllers/income.controller');
const incomeValidator = require('../validators/income.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('expenses.manage'));

router.get('/', incomeValidator.list, validate, incomeController.list);
router.get('/:id', incomeValidator.getById, validate, incomeController.getById);
router.post('/', incomeValidator.create, validate, incomeController.create);
router.patch('/:id', incomeValidator.update, validate, incomeController.update);

module.exports = router;