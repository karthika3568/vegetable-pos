/**
 * Purchase Return service - business rules for the purchase-returns
 * module. Mirrors sale.service.js's returnGoods() (merge duplicate
 * product+variant lines, validate shape, delegate authoritative
 * over-return / stock / status logic to the repository's locked
 * transaction).
 */

const purchaseReturnRepository = require('../repositories/purchase-return.repository');
const purchaseRepository = require('../repositories/purchase.repository');
const ApiError = require('../utils/ApiError');

function normalizeItems(items) {
  const merged = new Map();
  for (const raw of items) {
    const productId = Number(raw.productId);
    const variantId = raw.variantId !== undefined && raw.variantId !== null ? Number(raw.variantId) : 0;
    const quantity = Number(raw.quantity);

    if (!Number.isInteger(productId) || productId < 1) {
      throw ApiError.badRequest('each item productId must be a positive integer');
    }
    if (!Number.isInteger(variantId) || variantId < 0) {
      throw ApiError.badRequest('each item variantId must be a non-negative integer');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw ApiError.badRequest('each item quantity must be a positive number');
    }
    if (quantity > 100000) {
      throw ApiError.badRequest('each return quantity is unrealistically large');
    }

    const key = `${productId}:${variantId}`;
    const current = merged.get(key) || { productId, variantId, quantity: 0 };
    current.quantity = Math.round((current.quantity + quantity) * 1000) / 1000;
    merged.set(key, current);
  }
  return [...merged.values()];
}

async function create({ purchaseId, items, reason, createdBy }) {
  if (!Number.isInteger(purchaseId) || purchaseId < 1) {
    throw ApiError.badRequest('purchaseId must be a positive integer');
  }

  const normalized = normalizeItems(items);

  if (normalized.length === 0) {
    throw ApiError.badRequest('at least one return item is required');
  }
  if (reason !== undefined && reason !== null && String(reason).length > 255) {
    throw ApiError.badRequest('reason must be at most 255 characters');
  }

  const result = await purchaseReturnRepository.create({
    purchaseId,
    items: normalized,
    reason: reason || null,
    createdBy,
  });

  return purchaseRepository.findById(purchaseId).then((purchase) => ({
    ...purchase,
    returnId: result.returnId,
    adjustmentAmount: result.adjustmentAmount,
  }));
}

async function listByPurchase(purchaseId) {
  const purchase = await purchaseRepository.findById(purchaseId);

  if (!purchase) {
    throw ApiError.notFound(`Purchase ${purchaseId} not found`);
  }

  return purchaseReturnRepository.findByPurchase(purchaseId);
}

module.exports = {
  create,
  listByPurchase,
};
