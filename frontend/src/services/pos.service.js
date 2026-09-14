/**
 * POS read service.
 *
 * The POS must NEVER call the admin /products, /customers or /settings
 * endpoints - the cashier role cannot access those. These methods hit
 * the dedicated /pos/* endpoints (permission: sales.create) which the
 * server exposes specifically for the sale screen, plus the anonymous
 * /public/app-config when available.
 */

import { api } from '../api/client.js';

function mapProduct(raw) {
  return {
    id: Number(raw.id),
    productCode: raw.sku || raw.product_code,
    name: raw.name,
    barcode: raw.barcode || null,
    hsnCode: raw.hsn_code || null,
    unit: raw.unit,
    purchasePrice: Number(raw.cost_price ?? raw.purchase_price),
    sellingPrice: Number(raw.selling_price),
    wholesalePrice: raw.wholesale_price != null && raw.wholesale_price !== '' ? Number(raw.wholesale_price) : null,
    mrp: raw.mrp != null && raw.mrp !== '' ? Number(raw.mrp) : null,
    priceIncludesTax: raw.price_includes_tax === 1 || raw.price_includes_tax === true,
    taxCodeId: raw.tax_code_id ? Number(raw.tax_code_id) : null,
    taxCode: raw.tax_code || null,
    taxCodeName: raw.tax_code_name || null,
    cgstRate: Number(raw.cgst_rate || 0),
    sgstRate: Number(raw.sgst_rate || 0),
    igstRate: Number(raw.igst_rate || 0),
    imagePath: raw.image_path || null,
    currentStock: Number(raw.current_stock),
    minimumStock: Number(raw.minimum_stock),
    status: raw.status || raw.is_active,
  };
}

function mapCustomer(raw) {
  return {
    id: Number(raw.id),
    name: raw.name,
    phone: raw.phone || null,
    state: raw.state || null,
    creditLimit: Number(raw.credit_limit),
    currentBalance: Number(raw.current_balance),
    status: raw.status,
  };
}

function mapTaxCode(raw) {
  return {
    id: Number(raw.id),
    code: raw.code,
    name: raw.name,
    cgstRate: Number(raw.cgst_rate || 0),
    sgstRate: Number(raw.sgst_rate || 0),
    igstRate: Number(raw.igst_rate || 0),
    status: raw.status,
  };
}

export const posService = {
  async products({ search, limit = 200 } = {}) {
    const payload = await api.get('/pos/products', {
      params: {
        search: search || undefined,
        limit,
      },
    });
    return (payload?.data ?? []).map(mapProduct);
  },

  async customers({ search, limit = 100 } = {}) {
    const payload = await api.get('/pos/customers', {
      params: {
        search: search || undefined,
        limit,
      },
    });
    return (payload?.data ?? []).map(mapCustomer);
  },

  async taxCodes() {
    const payload = await api.get('/pos/tax-codes');
    return (payload?.data ?? []).map(mapTaxCode);
  },

  /**
   * POS-facing settings (allowlisted server-side). Values keep their
   * string form; numeric coercion is left to the caller.
   */
  async settings() {
    const payload = await api.get('/pos/settings');
    return payload?.data ?? {};
  },
};