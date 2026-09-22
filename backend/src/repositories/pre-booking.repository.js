/**
 * Pre-Booking repository - raw SQL lives here and nowhere else for this
 * module.
 *
 * Uses the new database/schema.sql `pre_bookings` + `pre_booking_items`
 * tables (migration 021). A pre-booking is a promise, not a sale:
 * creating/editing/cancelling it touches ONLY these two tables - no
 * stock, sales, or payments row is ever written here. Only conversion
 * (owned by pre-booking.service.js, which calls the EXISTING
 * sale-creation service) produces a real sale, at which point normal
 * stock/revenue/payment rules apply exactly like any other POS sale.
 */

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

const BASE_SELECT = `
  SELECT
    pb.id,
    pb.branch_id,
    pb.booking_number,
    pb.customer_id,
    c.name AS customer_registered_name,
    pb.customer_name,
    pb.customer_phone,
    pb.booking_date,
    pb.needed_by_date,
    pb.notes,
    pb.status,
    pb.converted_sale_id,
    pb.converted_at,
    pb.created_by,
    u.username AS created_by_name,
    pb.created_at,
    pb.updated_at
  FROM pre_bookings pb
  LEFT JOIN customers c ON c.id = pb.customer_id
  LEFT JOIN users u ON u.id = pb.created_by
`;

async function findAll({ branchId, status, customerId, search, limit, offset }) {
  const where = [];
  const params = [];

  if (branchId) {
    where.push('pb.branch_id = ?');
    params.push(branchId);
  }

  if (status) {
    where.push('pb.status = ?');
    params.push(status);
  }

  if (customerId) {
    where.push('pb.customer_id = ?');
    params.push(customerId);
  }

  if (search) {
    where.push(`(
      pb.booking_number LIKE ?
      OR pb.customer_name LIKE ?
      OR pb.customer_phone LIKE ?
      OR c.name LIKE ?
    )`);
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM pre_bookings pb
     LEFT JOIN customers c ON c.id = pb.customer_id
     ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `${BASE_SELECT}
     ${whereSql}
     ORDER BY pb.booking_date DESC, pb.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total: Number(total) };
}

async function findById(id) {
  const [rows] = await pool.query(
    `${BASE_SELECT}
     WHERE pb.id = ?`,
    [id]
  );

  if (!rows[0]) {
    return null;
  }

  const [items] = await pool.query(
    `SELECT
       pbi.id,
       pbi.product_id,
       p.sku AS product_code,
       p.name AS product_name,
       p.unit,
       pbi.variant_id,
       pv.variant_name,
       pbi.quantity,
       pbi.unit_price
     FROM pre_booking_items pbi
     JOIN products p ON p.id = pbi.product_id
     LEFT JOIN product_variants pv ON pv.id = pbi.variant_id
     WHERE pbi.pre_booking_id = ?
     ORDER BY pbi.id ASC`,
    [id]
  );

  return { ...rows[0], items };
}

/**
 * Create a pre-booking. NO stock/sales/payments effect - a plain header
 * + item insert. booking_number is `PREBOOK-` + zero-padded auto
 * increment id, its own sequence entirely separate from the gap-free
 * sales invoice counter (a booking is never an invoice).
 */
async function create({
  branchId,
  customerId,
  customerName,
  customerPhone,
  neededByDate,
  notes,
  items,
  createdBy,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO pre_bookings
         (branch_id, booking_number, customer_id, customer_name, customer_phone,
          needed_by_date, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        branchId,
        `TMP-${Date.now()}`,
        customerId || null,
        customerName || null,
        customerPhone || null,
        neededByDate || null,
        notes || null,
        createdBy,
      ]
    );

    const bookingId = result.insertId;
    const bookingNumber = `PREBOOK-${String(bookingId).padStart(6, '0')}`;

    await connection.query(
      `UPDATE pre_bookings SET booking_number = ? WHERE id = ?`,
      [bookingNumber, bookingId]
    );

    for (const item of items) {
      await connection.query(
        `INSERT INTO pre_booking_items (pre_booking_id, product_id, variant_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [bookingId, item.productId, item.variantId ?? 0, item.quantity, item.unitPrice ?? 0]
      );
    }

    await connection.commit();

    return findById(bookingId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cancel(id) {
  const [result] = await pool.query(
    `UPDATE pre_bookings
     SET status = 'cancelled'
     WHERE id = ? AND status = 'pending'`,
    [id]
  );

  if (result.affectedRows === 0) {
    const existing = await findById(id);
    if (!existing) {
      throw ApiError.notFound(`Pre-booking ${id} not found`);
    }
    throw ApiError.badRequest(`Pre-booking is "${existing.status}" and cannot be cancelled`);
  }

  return findById(id);
}

/**
 * Flip a pending booking to 'converted', linking the real sale created
 * by the sale module. Only a pending booking may convert (guards
 * against double-conversion, which would otherwise create two sales
 * for one booking).
 */
async function markConverted(id, saleId) {
  const [result] = await pool.query(
    `UPDATE pre_bookings
     SET status = 'converted', converted_sale_id = ?, converted_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [saleId, id]
  );

  if (result.affectedRows === 0) {
    throw ApiError.badRequest('Pre-booking is no longer pending and cannot be converted');
  }

  return findById(id);
}

module.exports = {
  findAll,
  findById,
  create,
  cancel,
  markConverted,
};
