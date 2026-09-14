const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await authService.login({ username, password, ipAddress: req.ip });
  response.ok(res, result, 'Login successful');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id, req.ip);
  response.ok(res, null, 'Logged out successfully');
});

const me = asyncHandler(async (req, res) => {
  const profile = await authService.getProfile(req.user.id);
  response.ok(res, profile);
});

module.exports = { login, logout, me };
