const purchaseReturnService = require('../services/purchase-return.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const create = asyncHandler(async (req, res) => {
  const purchase = await purchaseReturnService.create({
    purchaseId: Number(req.params.purchaseId),
    items: req.body.items.map((item) => ({
      productId: Number(item.productId),
      variantId: item.variantId !== undefined && item.variantId !== null && item.variantId !== ''
        ? Number(item.variantId)
        : 0,
      quantity: Number(item.quantity),
    })),
    reason: req.body.reason,
    createdBy: req.user.id,
  });

  response.created(res, purchase, 'Purchase return recorded');
});

const list = asyncHandler(async (req, res) => {
  const returns = await purchaseReturnService.listByPurchase(Number(req.params.purchaseId));

  response.ok(res, returns);
});

module.exports = {
  create,
  list,
};
