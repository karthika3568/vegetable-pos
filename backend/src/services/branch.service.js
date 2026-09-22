/**
 * Branch service - business rules for the branches module.
 *
 * Handles:
 * - CRUD on branches (name uniqueness, never hard-deleted - status only)
 * - Branch-product availability (the branch_products join table)
 */

const branchRepository = require('../repositories/branch.repository');
const productRepository = require('../repositories/product.repository');
const ApiError = require('../utils/ApiError');

async function list({ status, search }) {
  return branchRepository.findAll({ status, search });
}

async function getById(id) {
  const branch = await branchRepository.findById(id);

  if (!branch) {
    throw ApiError.notFound(`Branch ${id} not found`);
  }

  return branch;
}

async function ensureNameAvailable(name, excludeId = null) {
  const existing = await branchRepository.findByName(name, excludeId);

  if (existing) {
    throw ApiError.conflict(`Branch "${name}" already exists`);
  }
}

async function create({ name, address, phone, gstin, invoiceHeader, invoiceFooter }) {
  await ensureNameAvailable(name);

  return branchRepository.create({ name, address, phone, gstin, invoiceHeader, invoiceFooter });
}

async function update(id, { name, address, phone, gstin, invoiceHeader, invoiceFooter }) {
  await getById(id);
  await ensureNameAvailable(name, id);

  return branchRepository.update(id, { name, address, phone, gstin, invoiceHeader, invoiceFooter });
}

async function setStatus(id, status) {
  const branch = await getById(id);

  if (!['active', 'inactive'].includes(status)) {
    throw ApiError.badRequest('status must be "active" or "inactive"');
  }

  if (branch.is_main === 1 && status === 'inactive') {
    throw ApiError.badRequest('The main branch cannot be deactivated');
  }

  return branchRepository.setStatus(id, status);
}

async function listProducts(branchId) {
  await getById(branchId);

  return branchRepository.listProductsForBranch(branchId);
}

async function setProducts(branchId, productIds) {
  await getById(branchId);

  const uniqueIds = [...new Set(productIds.map((id) => Number(id)))];

  for (const productId of uniqueIds) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw ApiError.notFound(`Product ${productId} not found`);
    }
  }

  return branchRepository.setBranchProducts(branchId, uniqueIds);
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
  listProducts,
  setProducts,
};
