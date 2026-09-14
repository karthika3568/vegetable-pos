const categoryService = require('../services/category.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query;
  const result = await categoryService.list({
    search,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const category = await categoryService.getById(Number(req.params.id));
  response.ok(res, category);
});

const create = asyncHandler(async (req, res) => {
  const category = await categoryService.create({ ...req.body, actorId: req.user.id });
  response.created(res, category, 'Category created');
});

const update = asyncHandler(async (req, res) => {
  const category = await categoryService.update(Number(req.params.id), {
    ...req.body,
    actorId: req.user.id,
  });
  response.ok(res, category, 'Category updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const category = await categoryService.setStatus(
    Number(req.params.id),
    req.body.status,
    req.user.id
  );
  response.ok(res, category, 'Category status updated');
});

module.exports = { list, getById, create, update, setStatus };
