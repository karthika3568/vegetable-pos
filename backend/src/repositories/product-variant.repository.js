/**
 * Product variant repository - raw SQL only.
 *
 * Uses the product_variants table (database/schema.sql + migration 003):
 *   product_id     -> parent product (FK -> products, RESTRICT)
 *   variant_name   -> unique WITHIN a product (partitioned uniqueness)
 *   purchase_price -> this variant's purchase price
 *   selling_price  -> this variant's selling/POS price
 *   is_active      -> status
 *
 * Variants are soft-disabled (is_active), never deleted, so any future
 * per-variant stock / sales / purchase history stays resolvable.
 */

const { pool } = require('../config/db');

const BASE_SELECT = `
  SELECT
    id,
    product_id,
    variant_name,
    purchase_price,
    selling_price,
    attributes,
    CASE
      WHEN is_active = 1 THEN 'active'
      ELSE 'inactive'
    END AS status,
    created_at,
    updated_at
  FROM product_variants
`;

function parseAttributes(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapRow(row) {
  if (!row) return null;
  return { ...row, attributes: parseAttributes(row.attributes) };
}

async function findByProductAndId(productId, variantId) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE product_id = ? AND id = ?`,
    [productId, variantId]
  );

  return mapRow(rows[0]);
}

async function findByProductAndName(productId, name, excludeId = null) {
  let sql = `
    SELECT id, product_id, variant_name
    FROM product_variants
    WHERE product_id = ? AND LOWER(variant_name) = LOWER(?)
  `;

  const params = [productId, name];

  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] || null;
}

async function create({ productId, name, purchasePrice, sellingPrice, attributes = null }) {
  const [result] = await pool.query(
    `INSERT INTO product_variants
      (product_id, variant_name, purchase_price, selling_price, attributes, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [productId, name, purchasePrice, sellingPrice, attributes ? JSON.stringify(attributes) : null]
  );

  return findByProductAndId(productId, result.insertId);
}

async function update(
  productId,
  variantId,
  { name, purchasePrice, sellingPrice, attributes = null }
) {
  await pool.query(
    `UPDATE product_variants
     SET variant_name = ?,
         purchase_price = ?,
         selling_price = ?,
         attributes = ?
     WHERE id = ? AND product_id = ?`,
    [name, purchasePrice, sellingPrice, attributes ? JSON.stringify(attributes) : null, variantId, productId]
  );

  return findByProductAndId(productId, variantId);
}

async function setStatus(productId, variantId, status) {
  const isActive = status === 'active' ? 1 : 0;

  await pool.query(
    `UPDATE product_variants
     SET is_active = ?
     WHERE id = ? AND product_id = ?`,
    [isActive, variantId, productId]
  );

  return findByProductAndId(productId, variantId);
}

/**
 * Backend-driven search + status filter + pagination, scoped to one
 * parent product.
 *
 * Search matches the variant name; status filters active/inactive.
 */
async function list({ productId, search, status, limit, offset }) {
  const where = ['product_id = ?'];
  const params = [productId];

  if (search) {
    where.push(`variant_name LIKE ?`);
    params.push(`%${search}%`);
  }

  if (status) {
    where.push(status === 'active' ? `is_active = 1` : `is_active = 0`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY variant_name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM product_variants
     ${whereSql}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0].total),
  };
}

async function findActiveByProductIds(productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return [];
  }

  const placeholders = productIds.map(() => '?').join(',');
  // Branch-agnostic total (stock now has one row PER BRANCH per
  // product/variant) - a plain LEFT JOIN would multiply rows across
  // branches, so this sums across every branch via a subquery instead,
  // same fix as product.repository.js's BASE_SELECT.
  const [rows] = await pool.query(
    `SELECT
       pv.id,
       pv.product_id,
       pv.variant_name,
       pv.selling_price,
       CASE WHEN pv.is_active = 1 THEN 'active' ELSE 'inactive' END AS status,
       COALESCE((SELECT SUM(s.quantity) FROM stock s WHERE s.product_id = pv.product_id AND s.variant_id = pv.id), 0) AS current_stock
     FROM product_variants pv
     WHERE pv.product_id IN (${placeholders})
       AND pv.is_active = 1
     ORDER BY pv.product_id, pv.variant_name ASC`,
    productIds
  );

  return rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.product_id),
    variantName: row.variant_name,
    sellingPrice: Number(row.selling_price),
    currentStock: Number(row.current_stock),
    status: row.status,
  }));
}

module.exports = {
  findByProductAndId,
  findByProductAndName,
  create,
  update,
  setStatus,
  list,
  findActiveByProductIds,
};