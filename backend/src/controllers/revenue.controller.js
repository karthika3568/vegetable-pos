const revenueService = require('../services/revenue.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { fromDate, toDate, top } = req.query;
  const dashboard = await revenueService.list({ fromDate, toDate, top });
  response.ok(res, dashboard);
});

module.exports = { list };