/**
 * Income repository - raw SQL for the income module.
 *
 * Reads/writes the income table added by migration 006. The table
 * deliberately mirrors expenses (category/description/amount/date/
 * created_by/created_at): NO payment_method and NO status, so every
 * row is a plain immutable ledger entry - income is financially
 * isolated from sales revenue, customer credit and purchase payments,
 * which each live strictly in their own tables (no double counting).
 *
 * create() and update() wrap the write plus its audit_logs row into one
 * transaction; rows are never deleted.
 */

const { pool } = require('../config/db');
const auditRepository = require('./audit.repository');

const BASE_COLUMNS = `
  i.id, i.category, i.description, i.amount, i.income_date,
  i.created_by, u.username AS created_by_name, i.created_at
`;

const BASE_JOIN = `
  FROM income i
  INNER JOIN users u ON u.id = i.created_by
`;

async function findAll({ category, fromDate, toDate, search, orderBy, limit, offset }) {
  const where = [];
  const params = [];

  if (category) {
    where.push('i.category = ?');
    params.push(category);
  }

  if (fromDate) {
    where.push('i.income_date >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('i.income_date <= ?');
    params.push(toDate);
  }

  if (search) {
    where.push('i.description LIKE ?');
    params.push(`%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     ${BASE_JOIN}
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     ${BASE_JOIN}
     ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${BASE_COLUMNS}
     ${BASE_JOIN}
     WHERE i.id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function create({ category, description, amount, incomeDate, createdBy, audit }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO income (category, description, amount, income_date, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [category, description, amount, incomeDate, createdBy]
    );

    await auditRepository.record({
      conn,
      userId: audit.userId,
      action: audit.action,
      entityType: 'income',
      entityId: result.insertId,
      newValues: { category, description, amount, incomeDate },
      ipAddress: audit.ipAddress,
    });

    await conn.commit();
    return findById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function update({ id, category, description, amount, incomeDate, audit }) {
  const conn = await pool.getConnection();

  try {
    const fields = [];
    const params = [];

    if (category !== undefined) {
      fields.push('category = ?');
      params.push(category);
    }

    if (description !== undefined) {
      fields.push('description = ?');
      params.push(description);
    }

    if (amount !== undefined) {
      fields.push('amount = ?');
      params.push(amount);
    }

    if (incomeDate !== undefined) {
      fields.push('income_date = ?');
      params.push(incomeDate);
    }

    await conn.beginTransaction();

    params.push(id);

    await conn.query(
      `UPDATE income SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    await auditRepository.record({
      conn,
      userId: audit.userId,
      action: audit.action,
      entityType: 'income',
      entityId: id,
      oldValues: audit.oldValues,
      newValues: audit.newValues,
      ipAddress: audit.ipAddress,
    });

    await conn.commit();
    return findById(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  findAll,
  findById,
  create,
  update,
};