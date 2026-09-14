const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const getDashboard = asyncHandler(async (req, res) => {
  const payload = await dashboardService.dashboard(req.query);
  response.ok(res, payload);
});

module.exports = { getDashboard };