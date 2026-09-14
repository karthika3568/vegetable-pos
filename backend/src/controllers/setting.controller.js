const settingService = require('../services/setting.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const settings = await settingService.list();
  response.ok(res, settings);
});

const getByKey = asyncHandler(async (req, res) => {
  const setting = await settingService.getByKey(req.params.key);
  response.ok(res, setting);
});

const update = asyncHandler(async (req, res) => {
  const { value, description } = req.body;
  const setting = await settingService.updateByKey(
    req.params.key,
    { value, description },
    req.user && req.user.id
  );
  response.ok(res, setting, 'Setting updated');
});

module.exports = { list, getByKey, update };