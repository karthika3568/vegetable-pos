/**
 * Product service - business rules for product/vegetable management.
 *
 * Handles:
 * - Product creation and update
 * - Product code uniqueness
 * - Category validation
 * - Price/stock validation
 * - Search, filters and backend pagination
 * - Enable / disable status
 */

const productRepository = require('../repositories/product.repository');
const categoryRepository = require('../repositories/category.repository');
const taxCodeRepository = require('../repositories/tax-code.repository');
const ApiError = require('../utils/ApiError');

const ALLOWED_UNITS = ['kg', 'g', 'piece', 'dozen', 'bunch', 'litre'];

async function validateCategory(categoryId) {
  const category = await categoryRepository.findById(categoryId);

  if (!category) {
    throw ApiError.badRequest(
      `categoryId ${categoryId} does not correspond to an existing category`
    );
  }

  if (category.status !== 'active') {
    throw ApiError.badRequest(
      'Products can only be assigned to an active category'
    );
  }

  return category;
}

function validatePrices(purchasePrice, sellingPrice, mrp) {
  if (Number(purchasePrice) < 0) {
    throw ApiError.badRequest('purchasePrice cannot be negative');
  }

  if (Number(sellingPrice) < 0) {
    throw ApiError.badRequest('sellingPrice cannot be negative');
  }

  if (mrp !== undefined && mrp !== null && Number(mrp) < 0) {
    throw ApiError.badRequest('mrp cannot be negative');
  }
}

async function validateTaxCode(taxCodeId) {
  if (taxCodeId === undefined || taxCodeId === null) {
    return null;
  }

  const taxCode = await taxCodeRepository.findById(Number(taxCodeId));

  if (!taxCode) {
    throw ApiError.badRequest(
      `taxCodeId ${taxCodeId} does not correspond to an existing tax code`
    );
  }

  return taxCode;
}

function validateStock(currentStock, minimumStock) {
  if (Number(currentStock) < 0) {
    throw ApiError.badRequest('currentStock cannot be negative');
  }

  if (Number(minimumStock) < 0) {
    throw ApiError.badRequest('minimumStock cannot be negative');
  }
}

function validateUnit(unit) {
  if (!ALLOWED_UNITS.includes(unit)) {
    throw ApiError.badRequest(
      `unit must be one of: ${ALLOWED_UNITS.join(', ')}`
    );
  }
}

async function ensureProductCodeAvailable(productCode, excludeId = null) {
  const existing = await productRepository.findByProductCode(
    productCode,
    excludeId
  );

  if (existing) {
    throw ApiError.conflict(
      `Product code "${productCode}" already exists`
    );
  }
}

async function ensureBarcodeAvailable(barcode, excludeId = null) {
  if (barcode === undefined || barcode === null || barcode === '') {
    return;
  }

  const existing = await productRepository.findByBarcode(
    barcode,
    excludeId
  );

  if (existing) {
    throw ApiError.conflict(
      `Barcode "${barcode}" already exists on another product`
    );
  }
}

async function ensureProductNameUniqueInCategory(
  name,
  categoryId,
  excludeId = null
) {
  const existing = await productRepository.findByNameInCategory(
    name,
    categoryId,
    excludeId
  );

  if (existing) {
    throw ApiError.conflict(
      `Product "${name}" already exists in this category`
    );
  }
}

async function list({
  search,
  status,
  categoryId,
  lowStockOnly,
  page = 1,
  limit = 20,
}) {
  const offset = (page - 1) * limit;

  const { rows, total } = await productRepository.list({
    search,
    status,
    categoryId,
    lowStockOnly,
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

async function getById(id) {
  const product = await productRepository.findById(id);

  if (!product) {
    throw ApiError.notFound(`Product ${id} not found`);
  }

  return product;
}

async function create({
  productCode,
  barcode,
  name,
  categoryId,
  unit,
  purchasePrice,
  sellingPrice,
  hsnCode,
  taxCodeId,
  mrp,
  priceIncludesTax,
  currentStock = 0,
  minimumStock = 0,
}) {
  await validateCategory(categoryId);

  validateUnit(unit);
  validatePrices(purchasePrice, sellingPrice, mrp);
  validateStock(currentStock, minimumStock);
  await validateTaxCode(taxCodeId);

  await ensureProductCodeAvailable(productCode);
  await ensureBarcodeAvailable(barcode);
  await ensureProductNameUniqueInCategory(name, categoryId);

  return productRepository.create({
    productCode,
    barcode,
    name,
    categoryId,
    unit,
    purchasePrice,
    sellingPrice,
    hsnCode,
    taxCodeId: taxCodeId || null,
    mrp,
    priceIncludesTax: Boolean(priceIncludesTax),
    currentStock,
    minimumStock,
  });
}

async function update(
  id,
  {
    name,
    categoryId,
    unit,
    purchasePrice,
    sellingPrice,
    hsnCode,
    taxCodeId,
    mrp,
    priceIncludesTax,
    currentStock,
    minimumStock,
  }
) {
  await getById(id);

  await validateCategory(categoryId);

  validateUnit(unit);
  validatePrices(purchasePrice, sellingPrice, mrp);
  validateStock(currentStock, minimumStock);
  await validateTaxCode(taxCodeId);

  await ensureProductNameUniqueInCategory(
    name,
    categoryId,
    id
  );

  await productRepository.update(id, {
    name,
    categoryId,
    unit,
    purchasePrice,
    sellingPrice,
    hsnCode,
    taxCodeId: taxCodeId || null,
    mrp,
    priceIncludesTax: Boolean(priceIncludesTax),
    currentStock,
    minimumStock,
  });

  return getById(id);
}

async function setStatus(id, status) {
  await getById(id);

  if (!['active', 'inactive'].includes(status)) {
    throw ApiError.badRequest(
      'status must be "active" or "inactive"'
    );
  }

  await productRepository.setStatus(id, status);

  return getById(id);
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
};