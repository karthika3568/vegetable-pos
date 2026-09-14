const router = require('express').Router();
const expenseController = require('../controllers/expense.controller');
const expenseValidator = require('../validators/expense.validator');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('expenses.manage'));

router.get('/', expenseValidator.list, validate, expenseController.list);
router.get('/:id', expenseValidator.getById, validate, expenseController.getById);
router.post('/', expenseValidator.create, validate, expenseController.create);
router.patch('/:id', expenseValidator.update, validate, expenseController.update);

module.exports = router;