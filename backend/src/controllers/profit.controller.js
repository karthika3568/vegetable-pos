const profitService = require('../services/profit.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const summary = await profitService.list({ fromDate, toDate });
  response.ok(res, summary);
});

module.exports = { list };