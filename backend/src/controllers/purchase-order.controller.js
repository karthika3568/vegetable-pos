const purchaseOrderService = require('../services/purchase-order.service');
const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const {
    search,
    supplierId,
    fromDate,
    toDate,
    status,
    page,
    limit,
  } = req.query;

  const result = await purchaseOrderService.list({
    search,
    supplierId: supplierId ? Number(supplierId) : undefined,
    fromDate,
    toDate,
    status,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  response.paginated(res, result.items, result.pagination);
});

const getById = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.getById(
    Number(req.params.id)
  );

  response.ok(res, purchaseOrder);
});

const create = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.create({
    supplierId: Number(req.body.supplierId),
    orderDate: req.body.orderDate,
    expectedDeliveryDate: req.body.expectedDeliveryDate || null,
    notes: req.body.notes,
    items: (req.body.items || []).map((item) => ({
      productId: Number(item.productId),
      orderedQuantity: Number(item.orderedQuantity),
    })),
    createdBy: req.user.id,
  });

  response.created(res, purchaseOrder, 'Purchase order created');
});

const update = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.update(
    Number(req.params.id),
    {
      supplierId: req.body.supplierId ? Number(req.body.supplierId) : undefined,
      orderDate: req.body.orderDate,
      expectedDeliveryDate:
        req.body.expectedDeliveryDate !== undefined && req.body.expectedDeliveryDate !== null
          ? req.body.expectedDeliveryDate || null
          : undefined,
      notes: req.body.notes,
      items: req.body.items
        ? req.body.items.map((item) => ({
            productId: Number(item.productId),
            orderedQuantity: Number(item.orderedQuantity),
          }))
        : undefined,
      createdBy: req.user.id,
    }
  );

  response.ok(res, purchaseOrder, 'Purchase order updated');
});

const send = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.send(
    Number(req.params.id),
    req.user.id
  );

  response.ok(res, purchaseOrder, 'Purchase order sent');
});

const receive = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.receive(
    Number(req.params.id),
    {
      receivedDate: req.body.receivedDate,
      items: (req.body.items || []).map((line) => ({
        purchaseOrderItemId: Number(line.purchaseOrderItemId),
        receivedQuantity: Number(line.receivedQuantity),
        damagedQuantity: Number(line.damagedQuantity || 0),
      })),
      createdBy: req.user.id,
    }
  );

  response.ok(res, purchaseOrder, 'Goods received and stock updated');
});

const cancel = asyncHandler(async (req, res) => {
  const purchaseOrder = await purchaseOrderService.cancel(
    Number(req.params.id),
    req.user.id
  );

  response.ok(res, purchaseOrder, 'Purchase order cancelled');
});

module.exports = {
  list,
  getById,
  create,
  update,
  send,
  receive,
  cancel,
};