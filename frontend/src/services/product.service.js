import { api } from '../api/client.js';

/**
 * Products API service. The backend returns snake_case columns joined
 * from products/categories/tax_codes/stock; every call here maps them to
 * the camelCase shape the pages and form have always consumed.
 */
function mapProduct(raw) {
  return {
    id: Number(raw.id),
    productCode: raw.product_code ?? raw.sku ?? null,
    barcode: raw.barcode ?? null,
    hsnCode: raw.hsn_code ?? null,
    taxCodeId: raw.tax_code_id ? Number(raw.tax_code_id) : null,
    taxCode: raw.tax_code ?? null,
    taxCodeName: raw.tax_code_name ?? null,
    cgstRate: Number(raw.cgst_rate || 0),
    sgstRate: Number(raw.sgst_rate || 0),
    igstRate: Number(raw.igst_rate || 0),
    name: raw.name,
    categoryId: Number(raw.category_id),
    categoryName: raw.category_name ?? null,
    unit: raw.unit,
    purchasePrice: Number(raw.purchase_price),
    sellingPrice: Number(raw.selling_price),
    mrp: raw.mrp != null ? Number(raw.mrp) : null,
    wholesalePrice: raw.wholesale_price != null && raw.wholesale_price !== '' ? Number(raw.wholesale_price) : null,
    priceIncludesTax: raw.price_includes_tax === 1 || raw.price_includes_tax === true,
    imagePath: raw.image_path ?? null,
    currentStock: Number(raw.current_stock),
    minimumStock: Number(raw.minimum_stock),
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export const productService = {
  async list(params) {
    const payload = await api.get('/products', { params });
    return {
      items: (payload?.data ?? []).map(mapProduct),
      pagination: payload?.meta ?? null,
    };
  },

  async getById(id) {
    const payload = await api.get(`/products/${id}`);
    return payload?.data ? mapProduct(payload.data) : null;
  },

  async create(body) {
    const payload = await api.post('/products', body);
    return payload?.data ? mapProduct(payload.data) : null;
  },

  async update(id, body) {
    const payload = await api.put(`/products/${id}`, body);
    return payload?.data ? mapProduct(payload.data) : null;
  },

  async setStatus(id, status) {
    const payload = await api.patch(`/products/${id}/status`, { status });
    return payload?.data ? mapProduct(payload.data) : null;
  },

  /** Multipart upload that sets/replaces the product photo. */
  async uploadImage(id, file) {
    const formData = new FormData();
    formData.append('image', file);
    const payload = await api.upload(`/products/${id}/image`, formData);
    return payload?.data ? mapProduct(payload.data) : null;
  },

  /** Removes the product photo (database reference + stored file). */
  async removeImage(id) {
    const payload = await api.del(`/products/${id}/image`);
    return payload?.data ? mapProduct(payload.data) : null;
  },
};