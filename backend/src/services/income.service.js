/**
 * Income service - business rules for the income module.
 *
 * Income covers NON-SALES receipts only (scrap sales, rent received,
 * service charges, other operating income). Sales revenue, customer
 * credit and purchase payments are each recorded strictly in their own
 * ledgers - income money never flows into those tables, so it can never
 * be double-counted. The two ledgers share a design, filters, pagination
 * and auditing behaviour with the expense module.
 *
 * - Server-side search (description), category filter, from/to date
 *   range and allowlisted sort with pagination; amounts are validated
 *   + rounded to 2 decimals here.
 * - incomeDate is optional and defaults to today when omitted.
 * - Updates are partial (PATCH); a no-change request is a no-op.
 * - No DELETE: the ledger is immutable history.
 * - Auditing reuses the existing audit_logs mechanism, written atomically
 *   with the ledger row by the repository.
 */

const incomeRepository = require('../repositories/income.repository');
const ApiError = require('../utils/ApiError');

const SORT_COLUMNS = {
  id: 'id',
  date: 'income_date',
  amount: 'amount',
  category: 'category',
};

const DEFAULT_ORDER = 'income_date DESC, id DESC';

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
    incomeDate: row.income_date,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function normalizeFields({ category, description, amount, incomeDate }) {
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

  if (incomeDate !== undefined && incomeDate !== null) {
    const date = normalizeDate(incomeDate);
    if (!date) {
      throw ApiError.badRequest('incomeDate must be a valid date');
    }
    fields.incomeDate = date;
  }

  return fields;
}

async function list({ search, category, fromDate, toDate, sortBy, sortOrder, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await incomeRepository.findAll({
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
  const row = await incomeRepository.findById(id);

  if (!row) {
    throw ApiError.notFound(`Income ${id} not found`);
  }

  return toDTO(row);
}

async function create({ category, description, amount, incomeDate, createdBy, ipAddress }) {
  if (!category || !category.trim()) {
    throw ApiError.badRequest('category is required');
  }

  const fields = normalizeFields({
    category,
    description,
    amount,
    incomeDate: incomeDate === undefined ? todayDate() : incomeDate,
  });

  const row = await incomeRepository.create({
    category: fields.category,
    description: fields.description,
    amount: fields.amount,
    incomeDate: fields.incomeDate,
    createdBy,
    audit: {
      userId: createdBy,
      action: 'CREATE_INCOME',
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
    incomeDate: existing.incomeDate,
  };

  const newValues = { ...oldValues, ...fields };

  await incomeRepository.update({
    id,
    ...fields,
    audit: {
      userId,
      action: 'UPDATE_INCOME',
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