/**
 * Expense repository - raw SQL for the expense module.
 *
 * Uses the existing database/schema.sql expenses table as-is: no new
 * columns were invented for Phase 8A (keeps migration surface minimal
 * and the ledger design identical to income).
 *
 * create() and update() wrap the write plus its audit_logs row into one
 * transaction: the financial record and its traceability entry commit
 * or roll back together. Rows are never deleted - the ledger is
 * immutable history.
 */

const { pool } = require('../config/db');
const auditRepository = require('./audit.repository');

const BASE_COLUMNS = `
  e.id, e.category, e.description, e.amount, e.expense_date,
  e.created_by, u.username AS created_by_name, e.created_at
`;

const BASE_JOIN = `
  FROM expenses e
  INNER JOIN users u ON u.id = e.created_by
`;

async function findAll({ category, fromDate, toDate, search, orderBy, limit, offset }) {
  const where = [];
  const params = [];

  if (category) {
    where.push('e.category = ?');
    params.push(category);
  }

  if (fromDate) {
    where.push('e.expense_date >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('e.expense_date <= ?');
    params.push(toDate);
  }

  if (search) {
    where.push('e.description LIKE ?');
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
     WHERE e.id = ?`,
    [id]
  );

  return rows[0] || null;
}

async function create({ category, description, amount, expenseDate, createdBy, audit }) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO expenses (category, description, amount, expense_date, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [category, description, amount, expenseDate, createdBy]
    );

    await auditRepository.record({
      conn,
      userId: audit.userId,
      action: audit.action,
      entityType: 'expenses',
      entityId: result.insertId,
      newValues: { category, description, amount, expenseDate },
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

async function update({ id, category, description, amount, expenseDate, audit }) {
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

    if (expenseDate !== undefined) {
      fields.push('expense_date = ?');
      params.push(expenseDate);
    }

    await conn.beginTransaction();

    params.push(id);

    await conn.query(
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    await auditRepository.record({
      conn,
      userId: audit.userId,
      action: audit.action,
      entityType: 'expenses',
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