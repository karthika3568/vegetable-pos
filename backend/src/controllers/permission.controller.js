const permissionRepository = require('../repositories/permission.repository');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const permissions = await permissionRepository.findAll();
  response.ok(res, permissions);
});

module.exports = { list };
