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

module.exports = {
  findByProductAndId,
  findByProductAndName,
  create,
  update,
  setStatus,
  list,
};