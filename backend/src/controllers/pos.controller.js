/**
 * POS controller - cashier-scoped read endpoints for the POS screen.
 *
 * The regular /products, /customers and /categories routes require
 * products.manage / customers.manage, which a cashier role does NOT
 * have. These endpoints expose only the ACTIVE lookups the POS cart
 * needs, guarded by the far weaker `sales.create` permission, and stay
 * read-only - a cashier can neither create nor edit master data here.
 */

const productService = require('../services/product.service');
const customerService = require('../services/customer.service');
const categoryService = require('../services/category.service');
const taxCodeService = require('../services/tax-code.service');
const settingRepository = require('../repositories/setting.repository');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const listProducts = asyncHandler(async (req, res) => {
  const { search, categoryId, page, limit } = req.query;

  const result = await productService.list({
    search,
    status: 'active',
    categoryId: categoryId ? Number(categoryId) : undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 50,
  });

  response.paginated(res, result.items, result.pagination);
});

const listCustomers = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const result = await customerService.list({
    search,
    status: 'active',
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });

  response.paginated(res, result.items, result.pagination);
});

const listCategories = asyncHandler(async (req, res) => {
  const result = await categoryService.list({
    status: 'active',
    page: 1,
    limit: 50,
  });

  response.paginated(res, result.items, result.pagination);
});

const listTaxCodes = asyncHandler(async (req, res) => {
  const items = await taxCodeService.getActiveAll();
  response.ok(res, items);
});

// POS-relevant shop settings (receipt identity + GST state logic). Only
// the whitelisted keys are exposed; settings.manage is NOT needed to read
// them because they are printed on every receipt anyway.
const POS_SETTING_KEYS = new Set([
  'shop_name',
  'shop_state',
  'currency',
  'invoice_prefix',
  'tax_rate_percent',
]);

const getSettings = asyncHandler(async (req, res) => {
  const all = await settingRepository.findAll();
  const settings = {};
  for (const setting of all) {
    if (POS_SETTING_KEYS.has(setting.setting_key)) {
      settings[setting.setting_key] = setting.setting_value;
    }
  }
  response.ok(res, settings);
});

module.exports = {
  listProducts,
  listCustomers,
  listCategories,
  listTaxCodes,
  getSettings,
};