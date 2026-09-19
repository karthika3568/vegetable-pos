const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { status, roleId, page, limit } = req.query;
  const result = await userService.list({
    status,
    roleId: roleId ? Number(roleId) : undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(Number(req.params.id));
  response.ok(res, user);
});

const create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body, req.user);
  response.created(res, user, 'Employee created');
});

const update = asyncHandler(async (req, res) => {
  const user = await userService.update(Number(req.params.id), req.body, req.user);
  response.ok(res, user, 'Employee updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const user = await userService.setStatus(Number(req.params.id), req.body.status, req.user, req.ip);
  response.ok(res, user, 'Employee status updated');
});

const setPermissions = asyncHandler(async (req, res) => {
  const user = await userService.setPermissions(Number(req.params.id), req.body.permissions, req.user, req.ip);
  response.ok(res, user, 'Employee permissions updated');
});

const forceLogout = asyncHandler(async (req, res) => {
  await userService.forceLogout(Number(req.params.id), req.user, req.ip);
  response.ok(res, null, 'Employee has been logged out of all sessions');
});

module.exports = { list, getById, create, update, setStatus, setPermissions, forceLogout };
