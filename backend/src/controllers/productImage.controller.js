const productImageService = require('../services/productImage.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

const upload = asyncHandler(async (req, res) => {
  const productId = Number(req.params.id);

  if (!req.file || !req.file.buffer) {
    throw ApiError.badRequest('Select an image file to upload.');
  }

  const product = await productImageService.attach(
    productId,
    req.file,
    req.user.id
  );

  response.ok(res, product, 'Product image updated');
});

const remove = asyncHandler(async (req, res) => {
  const product = await productImageService.remove(
    Number(req.params.id),
    req.user.id
  );

  response.ok(res, product, 'Product image removed');
});

module.exports = {
  upload,
  remove,
};