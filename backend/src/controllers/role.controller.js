const roleRepository = require('../repositories/role.repository');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const roles = await roleRepository.findAll();
  response.ok(res, roles);
});

module.exports = { list };
