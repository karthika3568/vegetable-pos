/**
 * Purchase Return repository - raw SQL lives here and nowhere else for
 * this module. Mirrors the sale-return logic in sale.repository.js
 * (returnGoods) as closely as the two domains allow:
 *
 *   purchase_returns / purchase_return_items - one header per return
 *     event, items frozen at the ORIGINAL purchase unit_cost (the same
 *     frozen-snapshot invariant as sale_return_items).
 *   stock + stock_transactions - a purchase return REDUCES stock
 *     (goods sent back to the supplier) via stockRepository.applyChange,
 *     transaction_type 'return_purchase', reference_table 'purchases' -
 *     the exact ledger type the schema reserved for this.
 *   suppliers payable - adjustment_amount (quantity * ORIGINAL
 *     unit_cost) is picked up by supplier.repository.js's
 *     current_payable_balance derivation (it subtracts
 *     SUM(purchase_returns.adjustment_amount) for the supplier's
 *     completed purchases). NO payments row is ever written here - the
 *     shop never "pays" for a return, it simply owes less.
 *
 * Over-return guard: requested + already-returned <= purchase_items
 * .quantity (the RECEIVED/billed quantity), enforced inside the locked
 * transaction so concurrent return requests cannot over-return, exactly
 * like the sales-return module's per-item guard.
 */

const { pool } = require('../config/db');
const stockRepository = require('./stock.repository');
const ApiError = require('../utils/ApiError');

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Already-returned quantities per purchase_item for one purchase. Must
 * run inside the caller's transaction so the numbers are stable for the
 * duration of the return.
 */
async function getReturnedByItem(conn, purchaseId) {
  const [rows] = await conn.query(
    `SELECT pri.purchase_item_id, COALESCE(SUM(pri.quantity), 0) AS returned_quantity
     FROM purchase_return_items pri
     JOIN purchase_returns pr ON pr.id = pri.return_id
     WHERE pr.purchase_id = ?
     GROUP BY pri.purchase_item_id`,
    [purchaseId]
  );
  return new Map(rows.map((row) => [Number(row.purchase_item_id), Number(row.returned_quantity)]));
}

/**
 * Partial or full return of goods against a completed purchase.
 *   - Only a 'completed' purchase accepts returns.
 *   - Every requested line must belong to the purchase and
 *     requested + alreadyReturned <= received quantity.
 *   - Reduces stock ('return_purchase'), freezes the adjustment at the
 *     ORIGINAL purchase unit_cost (purchase_return_items).
 *   - Never writes a payments row - the supplier payable derivation
 *     picks up adjustment_amount directly.
 */
async function create({ purchaseId, items, reason, createdBy }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [purchaseRows] = await connection.query(
      `SELECT id, branch_id, supplier_id, invoice_number, status
       FROM purchases
       WHERE id = ?
       FOR UPDATE`,
      [purchaseId]
    );
    const purchase = purchaseRows[0];

    if (!purchase) {
      throw ApiError.notFound(`Purchase ${purchaseId} not found`);
    }
    if (purchase.status !== 'completed') {
      throw ApiError.badRequest('Returns can only be recorded against a completed purchase');
    }

    const [itemRows] = await connection.query(
      `SELECT pi.id, pi.product_id, pi.variant_id, pi.quantity, pi.unit_cost, p.name AS product_name
       FROM purchase_items pi
       JOIN products p ON p.id = pi.product_id
       WHERE pi.purchase_id = ?
       ORDER BY pi.id ASC`,
      [purchaseId]
    );

    if (itemRows.length === 0) {
      throw ApiError.badRequest('This purchase has no items and cannot be returned');
    }

    const returnedByItem = await getReturnedByItem(connection, purchaseId);
    const itemByProduct = new Map(
      itemRows.map((item) => [`${Number(item.product_id)}:${Number(item.variant_id)}`, item])
    );

    let adjustmentAmount = 0;
    const normalized = [];

    for (const requested of items) {
      const key = `${requested.productId}:${requested.variantId ?? 0}`;
      const purchaseItem = itemByProduct.get(key);
      if (!purchaseItem) {
        throw ApiError.badRequest(
          `Product ${requested.productId} is not part of purchase ${purchaseId}`
        );
      }
      const alreadyReturned = returnedByItem.get(Number(purchaseItem.id)) ?? 0;
      const remaining = Number(purchaseItem.quantity) - alreadyReturned;
      if (requested.quantity > remaining) {
        throw ApiError.badRequest(
          `Cannot return ${requested.quantity} of "${purchaseItem.product_name}" - only ${remaining} more can be returned (${alreadyReturned} already returned of ${purchaseItem.quantity} received)`
        );
      }
      normalized.push({
        purchaseItemId: Number(purchaseItem.id),
        productId: requested.productId,
        variantId: requested.variantId ?? 0,
        quantity: requested.quantity,
        unitCost: toMoney(purchaseItem.unit_cost),
      });
      adjustmentAmount = toMoney(adjustmentAmount + toMoney(requested.quantity * purchaseItem.unit_cost));
    }

    const [returnResult] = await connection.query(
      `INSERT INTO purchase_returns (purchase_id, reason, adjustment_amount, created_by)
       VALUES (?, ?, ?, ?)`,
      [purchaseId, reason || null, adjustmentAmount, createdBy]
    );
    const returnId = returnResult.insertId;

    for (const item of normalized) {
      const lineTotal = toMoney(item.quantity * item.unitCost);
      await connection.query(
        `INSERT INTO purchase_return_items
           (return_id, purchase_item_id, product_id, variant_id, quantity, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [returnId, item.purchaseItemId, item.productId, item.variantId, item.quantity, item.unitCost, lineTotal]
      );

      await stockRepository.applyChange({
        conn: connection,
        branchId: Number(purchase.branch_id),
        productId: item.productId,
        variantId: item.variantId,
        change: -item.quantity,
        transactionType: 'return_purchase',
        note: 'Purchase return',
        referenceTable: 'purchases',
        referenceId: purchaseId,
        createdBy,
      });
    }

    await connection.commit();

    return {
      returnId: Number(returnId),
      purchaseId: Number(purchaseId),
      adjustmentAmount,
      items: normalized,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findByPurchase(purchaseId) {
  const [returns] = await pool.query(
    `SELECT
       pr.id,
       pr.purchase_id,
       pr.return_date,
       pr.reason,
       pr.adjustment_amount,
       pr.created_by,
       u.username AS created_by_name,
       pr.created_at
     FROM purchase_returns pr
     LEFT JOIN users u ON u.id = pr.created_by
     WHERE pr.purchase_id = ?
     ORDER BY pr.id ASC`,
    [purchaseId]
  );

  if (returns.length === 0) {
    return [];
  }

  const [items] = await pool.query(
    `SELECT
       pri.id,
       pri.return_id,
       pri.purchase_item_id,
       pri.product_id,
       p.sku AS product_code,
       p.name AS product_name,
       p.unit,
       pri.variant_id,
       pri.quantity,
       pri.unit_cost,
       pri.line_total
     FROM purchase_return_items pri
     JOIN products p ON p.id = pri.product_id
     JOIN purchase_returns pr ON pr.id = pri.return_id
     WHERE pr.purchase_id = ?
     ORDER BY pri.id ASC`,
    [purchaseId]
  );

  const itemsByReturn = new Map();
  for (const item of items) {
    const key = Number(item.return_id);
    if (!itemsByReturn.has(key)) itemsByReturn.set(key, []);
    itemsByReturn.get(key).push(item);
  }

  return returns.map((ret) => ({ ...ret, items: itemsByReturn.get(Number(ret.id)) || [] }));
}

module.exports = {
  create,
  findByPurchase,
};
