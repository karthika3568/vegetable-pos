/**
 * Expense service - business rules for the expense module.
 *
 * - Server-side search (description), category filter, from/to date
 *   range and allowlisted sort with pagination (client never computes
 *   totals; amounts are validated + rounded to 2 decimals here).
 * - expenseDate is optional and defaults to today when omitted.
 * - Updates are partial (PATCH); a no-change request is a no-op.
 * - No DELETE: the ledger is immutable history, so once a row exists
 *   it can only be corrected via update (each change is audited).
 * - Auditing reuses the existing audit_logs mechanism (insert-only),
 *   written atomically with the ledger row by the repository.
 */

const expenseRepository = require('../repositories/expense.repository');
const ApiError = require('../utils/ApiError');

const SORT_COLUMNS = {
  id: 'id',
  date: 'expense_date',
  amount: 'amount',
  category: 'category',
};

const DEFAULT_ORDER = 'expense_date DESC, id DESC';

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function normalizeDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveOrder(sortBy, sortOrder) {
  if (!sortBy) return DEFAULT_ORDER;
  const column = SORT_COLUMNS[sortBy];
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}, id ${direction}`;
}

function toDTO(row) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    expenseDate: row.expense_date,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function normalizeFields({ category, description, amount, expenseDate }) {
  const fields = {};

  if (category !== undefined) {
    fields.category = category.trim();
  }

  if (description !== undefined) {
    fields.description = description === '' ? null : description.trim();
  }

  if (amount !== undefined) {
    const money = toMoney(amount);
    if (money === null || !(money > 0)) {
      throw ApiError.badRequest('amount must be a number greater than 0');
    }
    fields.amount = money;
  }

  if (expenseDate !== undefined && expenseDate !== null) {
    const date = normalizeDate(expenseDate);
    if (!date) {
      throw ApiError.badRequest('expenseDate must be a valid date');
    }
    fields.expenseDate = date;
  }

  return fields;
}

async function list({ search, category, fromDate, toDate, sortBy, sortOrder, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await expenseRepository.findAll({
    search: search || undefined,
    category: category || undefined,
    fromDate: fromDate ? normalizeDate(fromDate) : undefined,
    toDate: toDate ? normalizeDate(toDate) : undefined,
    orderBy: resolveOrder(sortBy, sortOrder),
    limit,
    offset,
  });

  return {
    items: rows.map(toDTO),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  const row = await expenseRepository.findById(id);

  if (!row) {
    throw ApiError.notFound(`Expense ${id} not found`);
  }

  return toDTO(row);
}

async function create({ category, description, amount, expenseDate, createdBy, ipAddress }) {
  if (!category || !category.trim()) {
    throw ApiError.badRequest('category is required');
  }

  const fields = normalizeFields({
    category,
    description,
    amount,
    expenseDate: expenseDate === undefined ? todayDate() : expenseDate,
  });

  const row = await expenseRepository.create({
    category: fields.category,
    description: fields.description,
    amount: fields.amount,
    expenseDate: fields.expenseDate,
    createdBy,
    audit: {
      userId: createdBy,
      action: 'CREATE_EXPENSE',
      ipAddress: ipAddress || null,
    },
  });

  return toDTO(row);
}

async function update(id, body, { userId, ipAddress }) {
  const existing = await getById(id);
  const fields = normalizeFields(body);

  if (Object.keys(fields).length === 0) {
    return existing;
  }

  const oldValues = {
    category: existing.category,
    description: existing.description,
    amount: existing.amount,
    expenseDate: existing.expenseDate,
  };

  const newValues = { ...oldValues, ...fields };

  await expenseRepository.update({
    id,
    ...fields,
    audit: {
      userId,
      action: 'UPDATE_EXPENSE',
      oldValues,
      newValues,
      ipAddress: ipAddress || null,
    },
  });

  return getById(id);
}

module.exports = {
  list,
  getById,
  create,
  update,
};