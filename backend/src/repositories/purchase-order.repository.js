/**
 * Purchase Order repository - raw SQL lives here and nowhere else for
 * this module. Services depend on this interface, never on `pool`
 * directly.
 *
 * Uses the new database/schema.sql purchase_orders + purchase_order_items
 * tables for the intent side of two-stage procurement, plus the EXISTING
 * `purchases` / `purchase_items` tables for every goods receipt:
 *
 *   - Creating / editing a PO touches ONLY purchase_orders and
 *     purchase_order_items. No purchase row, no stock movement - a draft
 *     / sent PO is intent, not goods.
 *   - Receiving is ONE transaction that:
 *       1. locks the PO + its items FOR UPDATE (concurrent receives
 *          serialize),
 *       2. writes a `completed` purchases header (auto receipt number,
 *          paid 0, total 0, purchase_order_id set). The ACTUAL supplier
 *          amount is recorded afterwards via
 *          purchaseRepository.setActualAmount once the supplier bill is
 *          known (a PO/receipt never carries an "expected" price),
 *       3. writes purchase_items for the RECEIVED (good) quantities only,
 *       4. reconciles stock via stockRepository.syncPurchaseStock
 *          (writes the stock_transactions ledger 'purchase' rows in
 *          this same transaction - the ledger is the idempotency guard),
 *       5. updates item received/damaged quantities and derives the PO
 *          status.
 *   - Damaged quantities are recorded on the PO item but NEVER become a
 *     purchase_items / stock row (damaged goods are not stocked).
 */

const crypto = require('crypto');
const { pool } = require('../config/db');
const stockRepository = require('./stock.repository');
const ApiError = require('../utils/ApiError');

function to3(value) {
  const n = Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  return Object.is(n, -0) ? 0 : n;
}

function buildPoNumber(id) {
  return `PO-${String(id).padStart(5, '0')}`;
}

const BASE_SELECT = `
  SELECT
    po.id,
    po.po_number,
    po.supplier_id,
    s.name AS supplier_name,
    po.order_date,
    po.expected_delivery_date,
    po.status,
    po.notes,
    po.created_by,
    u.username AS created_by_name,
    po.created_at,
    po.updated_at,
    items.item_count,
    items.ordered_total,
    items.received_total,
    items.damaged_total,
    items.outstanding_total
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN users u ON u.id = po.created_by
  LEFT JOIN (
    SELECT
      poi.purchase_order_id,
      COUNT(*) AS item_count,
      COALESCE(SUM(poi.ordered_quantity), 0) AS ordered_total,
      COALESCE(SUM(poi.received_quantity), 0) AS received_total,
      COALESCE(SUM(poi.damaged_quantity), 0) AS damaged_total,
      COALESCE(SUM(poi.ordered_quantity - poi.received_quantity - poi.damaged_quantity), 0) AS outstanding_total
    FROM purchase_order_items poi
    GROUP BY poi.purchase_order_id
  ) items ON items.purchase_order_id = po.id
`;

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE po.id = ?`,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const [items] = await pool.query(
    `SELECT
       poi.id,
       poi.product_id,
       p.name AS product_name,
       p.sku AS product_code,
       p.unit,
       poi.ordered_quantity,
       poi.received_quantity,
       poi.damaged_quantity,
       (poi.ordered_quantity - poi.received_quantity - poi.damaged_quantity) AS remaining_quantity
     FROM purchase_order_items poi
     JOIN products p ON p.id = poi.product_id
     WHERE poi.purchase_order_id = ?
     ORDER BY poi.id ASC`,
    [id]
  );

  const [receipts] = await pool.query(
    `SELECT
       pu.id,
       pu.invoice_number AS receipt_number,
       pu.purchase_date AS receipt_date,
       pu.total_amount,
       pu.paid_amount,
       pu.payment_status,
       pu.status,
       pu.notes,
       pu.created_by,
       u.username AS created_by_name,
       pu.created_at
FROM purchases pu
       LEFT JOIN users u ON u.id = pu.created_by
       WHERE pu.purchase_order_id = ?
       ORDER BY pu.id ASC`,
    [id]
  );

  let receiptItemsByReceipt = {};
  if (receipts.length > 0) {
    const placeholders = receipts.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT
         pi.purchase_id,
         pi.product_id,
         p.name AS product_name,
         p.sku AS product_code,
         p.unit,
         pi.quantity,
         pi.unit_cost AS purchase_price,
         pi.line_total
       FROM purchase_items pi
       JOIN products p ON p.id = pi.product_id
       WHERE pi.purchase_id IN (${placeholders})
       ORDER BY pi.purchase_id ASC, pi.id ASC`,
      receipts.map((r) => r.id)
    );
    receiptItemsByReceipt = rows.reduce((acc, row) => {
      const key = Number(row.purchase_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
  }

  const receiptsWithItems = receipts.map((receipt) => ({
    ...receipt,
    items: receiptItemsByReceipt[Number(receipt.id)] || [],
  }));

  return { ...rows[0], items, receipts: receiptsWithItems };
}

async function findAll({
  search,
  supplierId,
  fromDate,
  toDate,
  status,
  limit,
  offset,
}) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      s.name LIKE ?
      OR po.po_number LIKE ?
    )`);
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  if (supplierId) {
    where.push('po.supplier_id = ?');
    params.push(supplierId);
  }

  if (fromDate) {
    where.push('po.order_date >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('po.order_date <= ?');
    params.push(toDate);
  }

  if (status) {
    where.push('po.status = ?');
    params.push(status);
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY po.order_date DESC, po.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

async function create({
  supplierId,
  orderDate,
  expectedDeliveryDate,
  notes,
  items,
  createdBy,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const tempPoNumber = `TMP-${crypto.randomBytes(4).toString('hex')}`;

    const [result] = await connection.query(
      `INSERT INTO purchase_orders
        (po_number, supplier_id, order_date, expected_delivery_date, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
      [tempPoNumber, supplierId, orderDate, expectedDeliveryDate || null, notes || null, createdBy]
    );

    const poId = result.insertId;

    await connection.query(
      `UPDATE purchase_orders SET po_number = ? WHERE id = ?`,
      [buildPoNumber(poId), poId]
    );

    for (const item of items) {
      await connection.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, ordered_quantity)
         VALUES (?, ?, ?)`,
        [poId, item.productId, item.orderedQuantity]
      );
    }

    await connection.commit();
    connection.release();

    return findById(poId);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

/**
 * Draft-only edit: replaces the header fields it is given and, when
 * `items` is supplied, swaps the whole item set. Only a draft PO can be
 * edited (no receive may have happened). The PO row is locked FOR
 * UPDATE so a concurrent receive can never be interleaved.
 */
async function update(id, { supplierId, orderDate, expectedDeliveryDate, notes, items, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT id, status FROM purchase_orders WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (!row) {
      await connection.rollback();
      connection.release();
      return null;
    }

    if (row.status !== 'draft') {
      await connection.rollback();
      connection.release();
      throw ApiError.badRequest('Only draft purchase orders can be edited');
    }

    const sets = [];
    const params = [];

    if (supplierId !== undefined) {
      sets.push('supplier_id = ?');
      params.push(supplierId);
    }
    if (orderDate !== undefined) {
      sets.push('order_date = ?');
      params.push(orderDate);
    }
    if (expectedDeliveryDate !== undefined) {
      sets.push('expected_delivery_date = ?');
      params.push(expectedDeliveryDate || null);
    }
    if (notes !== undefined) {
      sets.push('notes = ?');
      params.push(notes || null);
    }

    if (sets.length > 0) {
      params.push(id);
      await connection.query(
        `UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
    }

    if (items !== undefined) {
      await connection.query(
        `DELETE FROM purchase_order_items WHERE purchase_order_id = ?`,
        [id]
      );
      for (const item of items) {
        await connection.query(
          `INSERT INTO purchase_order_items (purchase_order_id, product_id, ordered_quantity)
           VALUES (?, ?, ?)`,
          [id, item.productId, item.orderedQuantity]
        );
      }
    }

    await connection.commit();
    connection.release();

    return findById(id);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

async function setStatus(id, targetStatus, { allowedFrom, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[row]] = await connection.query(
      `SELECT id, status FROM purchase_orders WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (!row) {
      await connection.rollback();
      connection.release();
      return null;
    }

    if (allowedFrom.includes(row.status)) {
      await connection.query(
        `UPDATE purchase_orders SET status = ? WHERE id = ?`,
        [targetStatus, id]
      );
    }

    await connection.commit();
    connection.release();

    return findById(id);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

/**
 * Goods receiving - transactional core of the PO workflow.
 *
 * Writing order inside the transaction:
 *   1. lock PO + items FOR UPDATE
 *   2. validate the incoming lines against remaining quantities
 *   3. UPDATE purchase_order_items (received/damaged)
 *   4. INSERT purchases (receipt, auto receipt number, 'credit') +
 *      purchase_items for received quantities only
 *   5. stockRepository.syncPurchaseStock('completed') - stock amounts +
 *      ledger rows for the received quantities only, atomically
 *   6. derive PO status from item totals
 *
 * Any failure rolls everything back: no partial stock, no orphan
 * receipt, no partial item update.
 */
async function receive(poId, { receiptDate, lines, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[po]] = await connection.query(
      `SELECT id, po_number, supplier_id, status FROM purchase_orders WHERE id = ? FOR UPDATE`,
      [poId]
    );

    if (!po) {
      await connection.rollback();
      connection.release();
      return null;
    }

    if (po.status === 'cancelled' || po.status === 'received') {
      await connection.rollback();
      connection.release();
      throw ApiError.badRequest(`Purchase order ${po.po_number} cannot be received (status: ${po.status})`);
    }

    const [itemRows] = await connection.query(
      `SELECT id, product_id, ordered_quantity, received_quantity, damaged_quantity
       FROM purchase_order_items
       WHERE purchase_order_id = ?
       FOR UPDATE`,
      [poId]
    );

    const itemMap = new Map(itemRows.map((r) => [Number(r.id), r]));

    const updates = [];
    const purchaseItems = [];
    let anyReceived = false;

    for (const line of lines) {
      const row = itemMap.get(Number(line.itemId));

      if (!row) {
        await connection.rollback();
        connection.release();
        throw ApiError.badRequest(`Purchase order item ${line.itemId} does not belong to this PO`);
      }

      const ordered = to3(row.ordered_quantity);
      const alreadyReceived = to3(row.received_quantity);
      const alreadyDamaged = to3(row.damaged_quantity);
      const remaining = to3(ordered - alreadyReceived - alreadyDamaged);

      const received = to3(line.receivedQuantity);
      const damaged = to3(line.damagedQuantity || 0);

      if (received < 0 || damaged < 0) {
        await connection.rollback();
        connection.release();
        throw ApiError.badRequest('received and damaged quantities cannot be negative');
      }

      if (received + damaged > remaining) {
        await connection.rollback();
        connection.release();
        throw ApiError.badRequest(
          `Receiving ${received} (+${damaged} damaged) exceeds outstanding ${remaining} for PO item ${row.product_id}`
        );
      }

      if (received === 0 && damaged === 0) {
        continue;
      }

      updates.push({ itemId: Number(row.id), received, damaged });

      if (received > 0) {
        anyReceived = true;
        // Quantity is recorded now; the ACTUAL supplier price/total is
        // entered after receiving (see purchaseRepository.setActualAmount).
        purchaseItems.push({
          productId: row.product_id,
          quantity: received,
          purchasePrice: 0,
        });
      }
    }

    if (updates.length === 0) {
      await connection.rollback();
      connection.release();
      throw ApiError.badRequest('No quantities provided to receive');
    }

    if (!anyReceived) {
      await connection.rollback();
      connection.release();
      throw ApiError.badRequest('At least one item must have a received quantity greater than zero');
    }

    for (const update of updates) {
      await connection.query(
        `UPDATE purchase_order_items
         SET received_quantity = received_quantity + ?,
             damaged_quantity = damaged_quantity + ?
         WHERE id = ?`,
        [update.received, update.damaged, update.itemId]
      );
    }

    const [[{ receiptCount }]] = await connection.query(
      `SELECT COUNT(*) AS receiptCount FROM purchases WHERE purchase_order_id = ?`,
      [poId]
    );
    const receiptNumber = `RCP-${po.po_number}-${Number(receiptCount) + 1}`;

    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases
        (supplier_id, purchase_order_id, invoice_number, purchase_date, total_amount, paid_amount, payment_status, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'unpaid', 'completed', ?, ?)`,
      [
        po.supplier_id,
        poId,
        receiptNumber,
        receiptDate,
        0,
        0,
        `Receipt for ${po.po_number}`.slice(0, 255),
        createdBy,
      ]
    );

    const purchaseId = purchaseResult.insertId;

    for (const item of purchaseItems) {
      await connection.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost)
         VALUES (?, ?, ?, ?)`,
        [purchaseId, item.productId, item.quantity, item.purchasePrice]
      );
    }

    await stockRepository.syncPurchaseStock({
      conn: connection,
      purchaseId,
      items: purchaseItems,
      targetStatus: 'completed',
      createdBy,
    });

    await connection.query(
      `UPDATE purchase_orders SET status = ? WHERE id = ?`,
      [deriveStatus(itemRows, updates), poId]
    );

    await connection.commit();
    connection.release();

    return findById(poId);
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }
}

/**
 * Derive PO status after a receive:
 *   - every line fully delivered (received + damaged == ordered) -> received
 *   - something received but not everything delivered          -> partially_received
 *   - nothing received yet (only damaged recorded)             -> sent
 */
function deriveStatus(itemRows, updates) {
  const updated = new Map(updates.map((u) => [u.itemId, u]));

  let anyReceivedSoFar = false;
  let allDelivered = true;

  for (const row of itemRows) {
    const patch = updated.get(Number(row.id));
    const received = to3(row.received_quantity) + (patch ? patch.received : 0);
    const damaged = to3(row.damaged_quantity) + (patch ? patch.damaged : 0);

    if (received > 0) {
      anyReceivedSoFar = true;
    }
    if (to3(received + damaged) < to3(row.ordered_quantity)) {
      allDelivered = false;
    }
  }

  if (allDelivered) {
    return 'received';
  }
  if (anyReceivedSoFar) {
    return 'partially_received';
  }
  return 'sent';
}

module.exports = {
  findById,
  findAll,
  create,
  update,
  setStatus,
  receive,
};