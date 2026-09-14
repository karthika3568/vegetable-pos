const publicService = require('../services/public.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const getAppConfig = asyncHandler(async (req, res) => {
  const config = await publicService.appConfig();
  response.ok(res, config);
});

module.exports = {
  getAppConfig,
};