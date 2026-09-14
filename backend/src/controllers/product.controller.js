const productService = require('../services/product.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const {
    search,
    status,
    categoryId,
    lowStockOnly,
    page,
    limit,
  } = req.query;

  const result = await productService.list({
    search,
    status,
    categoryId: categoryId ? Number(categoryId) : undefined,
    lowStockOnly:
      lowStockOnly !== undefined
        ? lowStockOnly === 'true'
        : false,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(
    res,
    result.items,
    result.pagination
  );
});

const getById = asyncHandler(async (req, res) => {
  const product = await productService.getById(
    Number(req.params.id)
  );

  response.ok(res, product);
});

const create = asyncHandler(async (req, res) => {
  const product = await productService.create({
    productCode: req.body.productCode,
    barcode: req.body.barcode,
    name: req.body.name,
    categoryId: Number(req.body.categoryId),
    unit: req.body.unit,
    purchasePrice: Number(req.body.purchasePrice),
    sellingPrice: Number(req.body.sellingPrice),
    hsnCode: req.body.hsnCode,
    taxCodeId:
      req.body.taxCodeId !== undefined && req.body.taxCodeId !== null
        ? Number(req.body.taxCodeId)
        : null,
    mrp:
      req.body.mrp !== undefined && req.body.mrp !== null
        ? Number(req.body.mrp)
        : null,
    priceIncludesTax: Boolean(req.body.priceIncludesTax),
    currentStock:
      req.body.currentStock !== undefined
        ? Number(req.body.currentStock)
        : 0,
    minimumStock:
      req.body.minimumStock !== undefined
        ? Number(req.body.minimumStock)
        : 0,
  });

  response.created(
    res,
    product,
    'Product created'
  );
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.update(
    Number(req.params.id),
    {
      name: req.body.name,
      categoryId: Number(req.body.categoryId),
      unit: req.body.unit,
      purchasePrice: Number(req.body.purchasePrice),
      sellingPrice: Number(req.body.sellingPrice),
      hsnCode: req.body.hsnCode,
      taxCodeId:
        req.body.taxCodeId !== undefined && req.body.taxCodeId !== null
          ? Number(req.body.taxCodeId)
          : null,
      mrp:
        req.body.mrp !== undefined && req.body.mrp !== null
          ? Number(req.body.mrp)
          : null,
      priceIncludesTax: Boolean(req.body.priceIncludesTax),
      currentStock: Number(req.body.currentStock),
      minimumStock: Number(req.body.minimumStock),
    }
  );

  response.ok(
    res,
    product,
    'Product updated'
  );
});

const setStatus = asyncHandler(async (req, res) => {
  const product = await productService.setStatus(
    Number(req.params.id),
    req.body.status
  );

  response.ok(
    res,
    product,
    'Product status updated'
  );
});

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
};