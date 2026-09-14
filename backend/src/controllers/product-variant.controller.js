const productVariantService = require('../services/product-variant.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query;
  const productId = Number(req.params.productId);

  const result = await productVariantService.list({
    productId,
    search,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  const variantId = Number(req.params.variantId);

  const variant = await productVariantService.getById(productId, variantId);
  response.ok(res, variant);
});

const create = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);

  const variant = await productVariantService.create({
    productId,
    ...req.body,
  });

  response.created(res, variant, 'Variant created');
});

const update = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  const variantId = Number(req.params.variantId);

  const variant = await productVariantService.update(productId, variantId, req.body);
  response.ok(res, variant, 'Variant updated');
});

const setStatus = asyncHandler(async (req, res) => {
  const productId = Number(req.params.productId);
  const variantId = Number(req.params.variantId);

  const variant = await productVariantService.setStatus(
    productId,
    variantId,
    req.body.status
  );
  response.ok(res, variant, 'Variant status updated');
});

module.exports = { list, getById, create, update, setStatus };