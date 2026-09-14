/**
 * Product variant service - business rules for optional product
 * subtypes (e.g. Tomato -> Local / Hybrid).
 *
 * - Variants belong to exactly one parent product (nested routes always
 *   carry productId; a variant is only reachable through its own parent).
 * - Variant names are unique WITHIN a product (service returns 409; the
 *   DB UNIQUE (product_id, variant_name) stays as second protection).
 * - Same name under a different parent product is allowed.
 * - Prices only need to be non-negative - consistent with products,
 *   which has no selling >= purchase rule in this system.
 * - Variants override the parent product's prices for POS selection in
 *   a future module; the product's own prices are intentionally left
 *   untouched for backward compatibility.
 * - No hard delete: variants are disabled via status so any future
 *   per-variant stock/sales/purchase history stays intact.
 */

const productVariantRepository = require('../repositories/product-variant.repository');
const productRepository = require('../repositories/product.repository');
const ApiError = require('../utils/ApiError');

async function ensureProductExists(productId) {
  const product = await productRepository.findById(productId);

  if (!product) {
    throw ApiError.notFound(`Product ${productId} not found`);
  }

  return product;
}

async function ensureVariantExists(productId, variantId) {
  const variant = await productVariantRepository.findByProductAndId(
    productId,
    variantId
  );

  if (!variant) {
    throw ApiError.notFound(`Variant ${variantId} not found`);
  }

  return variant;
}

async function ensureVariantNameAvailable(productId, name, excludeId = null) {
  const existing = await productVariantRepository.findByProductAndName(
    productId,
    name,
    excludeId
  );

  if (existing) {
    throw ApiError.conflict(
      `Variant "${name}" already exists for this product`
    );
  }
}

async function list({ productId, search, status, page = 1, limit = 20 }) {
  await ensureProductExists(productId);

  const offset = (page - 1) * limit;

  const { rows, total } = await productVariantRepository.list({
    productId,
    search,
    status,
    limit,
    offset,
  });

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(productId, variantId) {
  await ensureProductExists(productId);

  return ensureVariantExists(productId, variantId);
}

async function create({ productId, name, purchasePrice, sellingPrice, attributes }) {
  await ensureProductExists(productId);
  await ensureVariantNameAvailable(productId, name);

  return productVariantRepository.create({
    productId,
    name,
    purchasePrice,
    sellingPrice,
    attributes,
  });
}

async function update(
  productId,
  variantId,
  { name, purchasePrice, sellingPrice, attributes }
) {
  await ensureProductExists(productId);
  await ensureVariantExists(productId, variantId);
  await ensureVariantNameAvailable(productId, name, variantId);

  return productVariantRepository.update(productId, variantId, {
    name,
    purchasePrice,
    sellingPrice,
    attributes,
  });
}

async function setStatus(productId, variantId, status) {
  await ensureProductExists(productId);
  await ensureVariantExists(productId, variantId);

  return productVariantRepository.setStatus(productId, variantId, status);
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
};