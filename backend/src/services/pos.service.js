/**
 * POS service - read-only snapshot endpoints for the sale screen.
 *
 * The POS frontend must only ever see data through these endpoints
 * (never through /products or /customers admin endpoints, which the
 * cashier role does not have permission to call). Every endpoint here
 * requires the `sales.create` permission so any user allowed to sell
 * can load the POS, and no more.
 */

const productRepository = require('../repositories/product.repository');
const customerRepository = require('../repositories/customer.repository');
const settingRepository = require('../repositories/setting.repository');
const taxCodeRepository = require('../repositories/tax-code.repository');

const POS_LIMIT = 200;

async function products({ search, categoryId }) {
  const { rows } = await productRepository.list({
    search,
    status: 'active',
    categoryId,
    lowStockOnly: false,
    limit: POS_LIMIT,
    offset: 0,
  });

  return rows;
}

async function customers({ search }) {
  const { rows } = await customerRepository.findAll({
    status: 'active',
    search,
    limit: 100,
    offset: 0,
  });

  return rows;
}

async function taxCodes() {
  return taxCodeRepository.findAllActive();
}

/**
 * POS-facing configuration: shop identity, invoice prefix, wheel and
 * tax settings the sale screen needs for live previews. Exposes only
 * the allowlisted keys.
 */
async function settings() {
  const ALLOWED_KEYS = [
    'shop_name',
    'currency',
    'invoice_prefix',
    'tax_rate_percent',
    'shop_state',
    'app_language',
    'sound_enabled',
    'sound_product',
    'sound_payment',
    'sound_invoice',
    'sound_error',
  ];

  const all = await settingRepository.findAll();
  const result = {};

  for (const setting of all) {
    if (ALLOWED_KEYS.includes(setting.setting_key)) {
      result[setting.setting_key] = setting.setting_value;
    }
  }

  return result;
}

module.exports = {
  products,
  customers,
  taxCodes,
  settings,
};