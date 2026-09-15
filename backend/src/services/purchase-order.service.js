/**
 * Purchase Order service - business rules for two-stage procurement.
 *
 * A Purchase Order is intent, not goods: creating/sending/editing a PO
 * never touches stock or the purchases table. Only goods receiving
 * creates a purchase (stock goes up by the RECEIVED quantity; damaged
 * quantities are recorded but never stocked).
 *
 * Stock/Purchase history stay owned by the existing layout:
 *   - each receive writes one `purchases` row + `purchase_items`
 *     (payment_type 'credit', so payment stays with the payments module)
 *   - stock increases via stockRepository.syncPurchaseStock (ledger rows
 *     in the same transaction - the idempotency guard)
 *   - receipts therefore appear in the existing Purchase History and
 *     profit/reports automatically.
 *
 * Status rules (requirement E):
 *   - draft: created, not yet sent
 *   - sent: sent to the supplier, nothing received yet
 *   - partially_received: some (but not all) ordered quantity delivered
 *   - received: every line fully delivered (received + damaged == ordered)
 *   - cancelled: closed before completion; no stock effect.
 */

const purchaseOrderRepository = require('../repositories/purchase-order.repository');
const supplierRepository = require('../repositories/supplier.repository');
const productRepository = require('../repositories/product.repository');
const ApiError = require('../utils/ApiError');

function toDateString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest('invalid date format');
  }
  return date.toISOString().slice(0, 10);
}

function to3(value) {
  const n = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
}

async function list({
  search,
  supplierId,
  fromDate,
  toDate,
  status,
  page = 1,
  limit = 20,
}) {
  const offset = (page - 1) * limit;

  const { rows, total } = await purchaseOrderRepository.findAll({
    search,
    supplierId,
    fromDate: fromDate ? toDateString(fromDate) : undefined,
    toDate: toDate ? toDateString(toDate) : undefined,
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

async function getById(id) {
  const purchaseOrder = await purchaseOrderRepository.findById(id);

  if (!purchaseOrder) {
    throw ApiError.notFound(`Purchase order ${id} not found`);
  }

  return purchaseOrder;
}

async function ensureSupplierActive(supplierId) {
  const supplier = await supplierRepository.findById(supplierId);

  if (!supplier) {
    throw ApiError.notFound(`Supplier ${supplierId} not found`);
  }

  if (supplier.status !== 'active') {
    throw ApiError.badRequest(
      'Purchase orders can only be raised against an active supplier'
    );
  }

  return supplier;
}

async function ensureProductActive(productId) {
  const product = await productRepository.findById(productId);

  if (!product) {
    throw ApiError.notFound(`Product ${productId} not found`);
  }

  if (product.status !== 'active') {
    throw ApiError.badRequest(
      'Purchase orders can only contain active products'
    );
  }

  return product;
}

async function validateItems(items) {
  if (!items || items.length === 0) {
    throw ApiError.badRequest('at least one item is required');
  }

  const seenProducts = new Set();
  const normalized = [];

  for (const item of items) {
    const orderedQuantity = to3(Number(item.orderedQuantity));
    const expectedPrice = Number(item.expectedPrice);

    if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
      throw ApiError.badRequest('each item orderedQuantity must be a positive number');
    }

    if (!Number.isFinite(expectedPrice) || expectedPrice < 0) {
      throw ApiError.badRequest('each item expectedPrice must be a non-negative number');
    }

    const productId = Number(item.productId);
    if (!Number.isInteger(productId) || productId < 1) {
      throw ApiError.badRequest('each item productId must be a positive integer');
    }

    if (seenProducts.has(productId)) {
      throw ApiError.badRequest(`duplicate product ${productId} in purchase order items`);
    }
    seenProducts.add(productId);

    await ensureProductActive(productId);

    normalized.push({
      productId,
      orderedQuantity,
      expectedPrice: Math.round((expectedPrice + Number.EPSILON) * 100) / 100,
    });
  }

  return normalized;
}

async function create({
  supplierId,
  orderDate,
  expectedDeliveryDate,
  notes,
  items,
  createdBy,
}) {
  await ensureSupplierActive(supplierId);
  const normalizedItems = await validateItems(items);

  return purchaseOrderRepository.create({
    supplierId,
    orderDate: toDateString(orderDate),
    expectedDeliveryDate: expectedDeliveryDate ? toDateString(expectedDeliveryDate) : null,
    notes: notes || null,
    items: normalizedItems,
    createdBy,
  });
}

async function update(id, { supplierId, orderDate, expectedDeliveryDate, notes, items, createdBy }) {
  const existing = await getById(id);

  if (existing.status !== 'draft') {
    throw ApiError.badRequest('Only draft purchase orders can be edited');
  }

  if (supplierId !== undefined) {
    await ensureSupplierActive(supplierId);
  }

  let normalizedItems;
  if (items !== undefined) {
    normalizedItems = await validateItems(items);
  }

  return purchaseOrderRepository.update(id, {
    supplierId,
    orderDate: orderDate ? toDateString(orderDate) : undefined,
    expectedDeliveryDate:
      expectedDeliveryDate !== undefined
        ? expectedDeliveryDate
          ? toDateString(expectedDeliveryDate)
          : null
        : undefined,
    notes,
    items: normalizedItems,
    createdBy,
  });
}

async function send(id, createdBy) {
  const purchaseOrder = await getById(id);

  if (purchaseOrder.status === 'cancelled' || purchaseOrder.status === 'received' || purchaseOrder.status === 'partially_received') {
    throw ApiError.badRequest(
      `Purchase order ${purchaseOrder.po_number} cannot be sent (status: ${purchaseOrder.status})`
    );
  }

  return purchaseOrderRepository.setStatus(id, 'sent', {
    allowedFrom: ['draft'],
    createdBy,
  });
}

async function receive(id, { receivedDate, items: lines, createdBy }) {
  const purchaseOrder = await getById(id);

  if (purchaseOrder.status === 'draft') {
    throw ApiError.badRequest('Send the purchase order before receiving goods');
  }

  if (purchaseOrder.status === 'cancelled') {
    throw ApiError.badRequest(`Purchase order ${purchaseOrder.po_number} is cancelled and cannot be received`);
  }

  if (purchaseOrder.status === 'received') {
    throw ApiError.badRequest(`Purchase order ${purchaseOrder.po_number} is already fully received`);
  }

  const itemsById = new Map(purchaseOrder.items.map((item) => [Number(item.id), item]));

  let anyReceived = false;
  const normalizedLines = [];

  for (const line of lines) {
    const itemId = Number(line.purchaseOrderItemId);
    const item = itemsById.get(itemId);

    if (!item) {
      throw ApiError.badRequest(`Purchase order item ${itemId} does not belong to this PO`);
    }

    const receivedQuantity = to3(Number(line.receivedQuantity));
    const damagedQuantity = to3(Number(line.damagedQuantity || 0));
    const purchasePrice = line.purchasePrice != null && line.purchasePrice !== ''
      ? Number(line.purchasePrice)
      : null;

    if (!Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
      throw ApiError.badRequest('each item receivedQuantity must be a non-negative number');
    }

    if (!Number.isFinite(damagedQuantity) || damagedQuantity < 0) {
      throw ApiError.badRequest('each item damagedQuantity must be a non-negative number');
    }

    if (purchasePrice != null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) {
      throw ApiError.badRequest('each item purchasePrice must be a non-negative number');
    }

    const remaining = to3(Number(item.remaining_quantity));
    if (receivedQuantity + damagedQuantity > remaining) {
      throw ApiError.badRequest(
        `Receiving ${receivedQuantity} (+${damagedQuantity} damaged) exceeds outstanding ${remaining} for ${item.product_name}`
      );
    }

    if (receivedQuantity > 0) {
      anyReceived = true;
    }

    normalizedLines.push({
      itemId,
      receivedQuantity,
      damagedQuantity,
      purchasePrice,
    });
  }

  if (normalizedLines.length === 0 || !anyReceived) {
    throw ApiError.badRequest('Provide at least one item with a received quantity greater than zero');
  }

  return purchaseOrderRepository.receive(id, {
    receiptDate: receivedDate ? toDateString(receivedDate) : new Date().toISOString().slice(0, 10),
    lines: normalizedLines,
    createdBy,
  });
}

async function cancel(id, createdBy) {
  const purchaseOrder = await getById(id);

  if (purchaseOrder.status === 'received' || purchaseOrder.status === 'cancelled') {
    throw ApiError.badRequest(
      `Purchase order ${purchaseOrder.po_number} cannot be cancelled (status: ${purchaseOrder.status})`
    );
  }

  return purchaseOrderRepository.setStatus(id, 'cancelled', {
    allowedFrom: ['draft', 'sent', 'partially_received'],
    createdBy,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  send,
  receive,
  cancel,
};