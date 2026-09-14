/**
 * Tax codes service - business rules for the tax master module.
 */

const taxCodeRepository = require('../repositories/tax-code.repository');
const ApiError = require('../utils/ApiError');

async function list({ status, search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await taxCodeRepository.findAll({
    status,
    search,
    limit,
    offset,
  });

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getById(id) {
  const taxCode = await taxCodeRepository.findById(id);

  if (!taxCode) {
    throw ApiError.notFound(`Tax code ${id} not found`);
  }

  return taxCode;
}

async function getActiveAll() {
  return taxCodeRepository.findActiveAll();
}

async function ensureCodeUnique(code, excludeId = null) {
  const existing = await taxCodeRepository.findByCode(code);
  if (existing && existing.id !== excludeId) {
    throw ApiError.conflict(`Tax code "${code}" already exists`);
  }
}

function validateRates(cgstRate, sgstRate, igstRate) {
  const rates = [cgstRate, sgstRate, igstRate];
  for (const rate of rates) {
    if (rate !== undefined && rate !== null) {
      const num = Number(rate);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        throw ApiError.badRequest('Tax rates must be between 0 and 100');
      }
    }
  }
}

async function create({ code, name, cgstRate = 0, sgstRate = 0, igstRate = 0 }) {
  await ensureCodeUnique(code);
  validateRates(cgstRate, sgstRate, igstRate);

  return taxCodeRepository.create({
    code,
    name,
    cgstRate: Number(cgstRate),
    sgstRate: Number(sgstRate),
    igstRate: Number(igstRate),
  });
}

async function update(id, { code, name, cgstRate, sgstRate, igstRate }) {
  await getById(id);

  if (code !== undefined) {
    await ensureCodeUnique(code, id);
  }

  if (cgstRate !== undefined || sgstRate !== undefined || igstRate !== undefined) {
    validateRates(cgstRate, sgstRate, igstRate);
  }

  return taxCodeRepository.update(id, {
    code,
    name,
    cgstRate: cgstRate !== undefined ? Number(cgstRate) : undefined,
    sgstRate: sgstRate !== undefined ? Number(sgstRate) : undefined,
    igstRate: igstRate !== undefined ? Number(igstRate) : undefined,
  });
}

async function setStatus(id, status) {
  await getById(id);

  if (!['active', 'inactive'].includes(status)) {
    throw ApiError.badRequest('status must be "active" or "inactive"');
  }

  return taxCodeRepository.setStatus(id, status === 'active');
}

module.exports = {
  list,
  getById,
  getActiveAll,
  create,
  update,
  setStatus,
};
