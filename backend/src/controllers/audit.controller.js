const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, userId, action, entityType, fromDate, toDate, page, limit } = req.query;
  const result = await auditService.list({
    search,
    userId: userId ? Number(userId) : undefined,
    action,
    entityType,
    fromDate,
    toDate,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const entry = await auditService.getById(Number(req.params.id));
  response.ok(res, entry);
});

module.exports = { list, getById };