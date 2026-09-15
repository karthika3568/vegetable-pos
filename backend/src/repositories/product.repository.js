/**
 * Product repository - raw SQL only.
 *
 * Uses the existing Phase 2/3 database schema:
 *   products.sku            -> product code
 *   products.cost_price     -> purchase price
 *   products.reorder_level  -> minimum stock
 *   products.is_active      -> status
 *   stock.quantity          -> current stock
 */

const { pool } = require('../config/db');

const BASE_SELECT = `
  SELECT
    p.id,
    p.sku AS product_code,
    p.barcode,
    p.name,
    p.category_id,
    c.name AS category_name,
    p.unit,
    p.cost_price AS purchase_price,
    p.selling_price,
    p.image_path,
    p.hsn_code,
    p.tax_code_id,
    tc.code AS tax_code,
    tc.name AS tax_code_name,
    tc.cgst_rate,
    tc.sgst_rate,
    tc.igst_rate,
    p.mrp,
    p.price_includes_tax,
    COALESCE(s.quantity, 0) AS current_stock,
    p.reorder_level AS minimum_stock,
    CASE
      WHEN p.is_active = 1 THEN 'active'
      ELSE 'inactive'
    END AS status,
    p.created_at,
    p.updated_at
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN stock s ON s.product_id = p.id
  LEFT JOIN tax_codes tc ON tc.id = p.tax_code_id
`;

async function create({
  productCode,
  barcode,
  name,
  categoryId,
  unit,
  purchasePrice,
  sellingPrice,
  hsnCode,
  taxCodeId,
  mrp,
  priceIncludesTax,
  currentStock,
  minimumStock,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO products
        (category_id, sku, barcode, name, unit, cost_price, selling_price,
         hsn_code, tax_code_id, mrp, price_includes_tax, reorder_level, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        categoryId,
        productCode,
        barcode || null,
        name,
        unit,
        purchasePrice,
        sellingPrice,
        hsnCode || null,
        taxCodeId || null,
        mrp || null,
        priceIncludesTax ? 1 : 0,
        minimumStock,
      ]
    );

    const productId = result.insertId;

    // Record the initial pricing in the append-only price-history ledger.
    await connection.query(
      `INSERT INTO product_price_history (product_id, selling_price, cost_price, effective_from, created_by)
       VALUES (?, ?, ?, NOW(), NULL)`,
      [productId, sellingPrice, purchasePrice]
    );

    if (Number(currentStock) > 0) {
      await connection.query(
        `INSERT INTO stock (product_id, quantity)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
        [productId, currentStock]
      );
    }

    await connection.commit();

    return findById(productId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE p.id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function findByProductCode(productCode, excludeId = null) {
  let sql = `
    SELECT id, sku
    FROM products
    WHERE LOWER(sku) = LOWER(?)
  `;

  const params = [productCode];

  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] || null;
}

async function findByBarcode(barcode, excludeId = null) {
  let sql = `
    SELECT id, sku, barcode
    FROM products
    WHERE barcode = ?
  `;

  const params = [barcode];

  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] || null;
}

async function findByNameInCategory(name, categoryId, excludeId = null) {
  let sql = `
    SELECT id, name, category_id
    FROM products
    WHERE LOWER(name) = LOWER(?)
      AND category_id = ?
  `;

  const params = [name, categoryId];

  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const [rows] = await pool.query(sql, params);

  return rows[0] || null;
}

async function update(
  id,
  {
    name,
    categoryId,
    unit,
    purchasePrice,
    sellingPrice,
    hsnCode,
    taxCodeId,
    mrp,
    priceIncludesTax,
    currentStock,
    minimumStock,
  }
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[current]] = await connection.query(
      `SELECT cost_price, selling_price FROM products WHERE id = ?`,
      [id]
    );

    await connection.query(
      `UPDATE products
       SET name = ?,
           category_id = ?,
           unit = ?,
           cost_price = ?,
           selling_price = ?,
           hsn_code = ?,
           tax_code_id = ?,
           mrp = ?,
           price_includes_tax = ?,
           reorder_level = ?
       WHERE id = ?`,
      [
        name,
        categoryId,
        unit,
        purchasePrice,
        sellingPrice,
        hsnCode || null,
        taxCodeId || null,
        mrp || null,
        priceIncludesTax ? 1 : 0,
        minimumStock,
        id,
      ]
    );

    // Preserve pricing history: whenever selling or cost price actually
    // changes, append a new ledger row (never rewrite the past).
    if (current && (
      Number(current.selling_price) !== Number(sellingPrice) ||
      Number(current.cost_price) !== Number(purchasePrice)
    )) {
      await connection.query(
        `INSERT INTO product_price_history (product_id, selling_price, cost_price, effective_from, created_by)
         VALUES (?, ?, ?, NOW(), NULL)`,
        [id, sellingPrice, purchasePrice]
      );
    }

    await connection.query(
      `INSERT INTO stock (product_id, quantity)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
      [id, currentStock]
    );

    await connection.commit();

    return findById(id);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function setStatus(id, status) {
  const isActive = status === 'active' ? 1 : 0;

  await pool.query(
    `UPDATE products
     SET is_active = ?
     WHERE id = ?`,
    [isActive, id]
  );

  return findById(id);
}

async function updateImagePath(id, imagePath) {
  await pool.query(
    `UPDATE products
     SET image_path = ?
     WHERE id = ?`,
    [imagePath, id]
  );

  return findById(id);
}

async function clearImagePath(id) {
  await pool.query(
    `UPDATE products
     SET image_path = NULL
     WHERE id = ?`,
    [id]
  );

  return findById(id);
}

/**
 * Backend/database-driven search + filter + pagination.
 *
 * Search:
 *   - Product name
 *   - Product code / SKU
 *   - Category name
 *
 * Filters:
 *   - status
 *   - categoryId
 *   - lowStockOnly
 */
async function list({
  search,
  status,
  categoryId,
  lowStockOnly = false,
  limit,
  offset,
}) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`
      (
        p.name LIKE ?
        OR p.sku LIKE ?
        OR p.barcode LIKE ?
        OR c.name LIKE ?
      )
    `);

    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  if (status) {
    where.push(
      status === 'active'
        ? `p.is_active = 1`
        : `p.is_active = 0`
    );
  }

  if (categoryId) {
    where.push(`p.category_id = ?`);
    params.push(categoryId);
  }

  if (lowStockOnly) {
    where.push(`COALESCE(s.quantity, 0) <= p.reorder_level`);
  }

  const whereSql = where.length
    ? `WHERE ${where.join(' AND ')}`
    : '';

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY p.name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN stock s ON s.product_id = p.id
     ${whereSql}`,
    params
  );

  return {
    rows,
    total: Number(countRows[0].total),
  };
}

module.exports = {
  create,
  findById,
  findByProductCode,
  findByBarcode,
  findByNameInCategory,
  update,
  setStatus,
  updateImagePath,
  clearImagePath,
  list,
};