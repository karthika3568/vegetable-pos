/**
 * Branch repository - raw SQL only.
 *
 * Uses the new database/schema.sql `branches` table (migration 021):
 *   id, name, is_main, address, phone, gstin, invoice_header,
 *   invoice_footer, status ('active'/'inactive'), created_at, updated_at.
 *
 * Branches are never hard-deleted - historical stock/sales/purchases/
 * purchase_orders reference branch_id with ON DELETE RESTRICT, so a
 * branch is disabled via `status`, never removed.
 */

const { pool } = require('../config/db');

const BASE_SELECT = `
  SELECT
    id,
    name,
    is_main,
    address,
    phone,
    gstin,
    invoice_header,
    invoice_footer,
    status,
    created_at,
    updated_at
  FROM branches
`;

async function findAll({ status, search } = {}) {
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }

  if (search) {
    where.push('name LIKE ?');
    params.push(`%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY is_main DESC, name ASC`,
    params
  );

  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function findByName(name, excludeId = null) {
  let sql = `SELECT id, name FROM branches WHERE LOWER(name) = LOWER(?)`;
  const params = [name];

  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] || null;
}

/**
 * The shop's primary location (is_main = 1). Every fresh install / the
 * migration seeds exactly one. Used as a sane default target for
 * legacy, branch-agnostic write paths (e.g. the admin Products page's
 * "initial stock" convenience field) so no stock data is invented -
 * it simply lands on the shop's main branch, exactly like the
 * migration backfill already does for pre-existing rows.
 */
async function findMainBranch() {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE is_main = 1
     LIMIT 1`
  );

  return rows[0] || null;
}

async function create({ name, address, phone, gstin, invoiceHeader, invoiceFooter }) {
  const [result] = await pool.query(
    `INSERT INTO branches
       (name, is_main, address, phone, gstin, invoice_header, invoice_footer, status)
     VALUES (?, 0, ?, ?, ?, ?, ?, 'active')`,
    [name, address || null, phone || null, gstin || null, invoiceHeader || null, invoiceFooter || null]
  );

  return findById(result.insertId);
}

async function update(id, { name, address, phone, gstin, invoiceHeader, invoiceFooter }) {
  await pool.query(
    `UPDATE branches
     SET name = ?,
         address = ?,
         phone = ?,
         gstin = ?,
         invoice_header = ?,
         invoice_footer = ?
     WHERE id = ?`,
    [name, address || null, phone || null, gstin || null, invoiceHeader || null, invoiceFooter || null, id]
  );

  return findById(id);
}

async function setStatus(id, status) {
  await pool.query(
    `UPDATE branches
     SET status = ?
     WHERE id = ?`,
    [status, id]
  );

  return findById(id);
}

/**
 * Every product with an `available` flag for one branch (branch_products
 * join, LEFT so products with no row show available = false - "not
 * available in ANY branch" per the branch_products design note in
 * schema.sql). Powers PUT /branches/:id/products (the checklist UI).
 */
async function listProductsForBranch(branchId) {
  const [rows] = await pool.query(
    `SELECT
       p.id AS product_id,
       p.sku AS product_code,
       p.name,
       p.unit,
       p.category_id,
       c.name AS category_name,
       CASE WHEN p.is_active = 1 THEN 'active' ELSE 'inactive' END AS status,
       CASE WHEN bp.is_active = 1 THEN 1 ELSE 0 END AS available
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN branch_products bp ON bp.product_id = p.id AND bp.branch_id = ?
     ORDER BY p.name ASC`,
    [branchId]
  );

  return rows.map((row) => ({ ...row, available: Number(row.available) === 1 }));
}

/**
 * Bulk-set which products are available in a branch. Upserts an
 * is_active = 1 row for every id in `productIds` and turns every other
 * existing row for this branch to is_active = 0 (never deletes - the
 * join row itself is harmless history, only the flag needs to reflect
 * current availability). Runs in one transaction so the branch's
 * product list is never seen half-updated.
 */
async function setBranchProducts(branchId, productIds) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE branch_products SET is_active = 0 WHERE branch_id = ?`,
      [branchId]
    );

    if (productIds.length > 0) {
      const values = productIds.map((productId) => [branchId, productId, 1]);
      await connection.query(
        `INSERT INTO branch_products (branch_id, product_id, is_active)
         VALUES ?
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [values]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return listProductsForBranch(branchId);
}

module.exports = {
  findAll,
  findById,
  findByName,
  findMainBranch,
  create,
  update,
  setStatus,
  listProductsForBranch,
  setBranchProducts,
};
