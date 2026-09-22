const router = require('express').Router();

const branchController = require('../controllers/branch.controller');
const branchValidator = require('../validators/branch.validator');

const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Readable by any authenticated user (branch-selector dropdown); writes
// require branches.manage.
router.use(authenticate);

router.get('/', branchValidator.list, validate, branchController.list);
router.get('/:id', branchValidator.getById, validate, branchController.getById);

router.post(
  '/',
  authorize('branches.manage'),
  branchValidator.create,
  validate,
  branchController.create
);

router.put(
  '/:id',
  authorize('branches.manage'),
  branchValidator.update,
  validate,
  branchController.update
);

router.patch(
  '/:id/status',
  authorize('branches.manage'),
  branchValidator.setStatus,
  validate,
  branchController.setStatus
);

router.get(
  '/:id/products',
  branchValidator.listProducts,
  validate,
  branchController.listProducts
);

router.put(
  '/:id/products',
  authorize('branches.manage'),
  branchValidator.setProducts,
  validate,
  branchController.setProducts
);

module.exports = router;
