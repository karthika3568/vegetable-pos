/**
 * Customer service - business rules for the customer master-data
 * module.
 *
 * Customers are NOT software users - no login/credentials exist here
 * and this module only manages master data (name, phone, email,
 * address, credit_limit, status) for future credit sales, collections
 * and invoices.
 *
 * - Phone uniqueness mirrors the DB UNIQUE uq_customers_phone (service
 *   returns 409; the constraint stays as a second enforcement).
 * - Name is deliberately NOT unique (the schema has no such constraint
 *   and same-name customers are legitimate business data).
 * - current_balance is owned by the future Credit module and is never
 *   written here.
 * - Disabled via status, never deleted, so sales.history stays intact.
 */

const customerRepository = require('../repositories/customer.repository');
const ApiError = require('../utils/ApiError');

async function list({ status, search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await customerRepository.findAll({
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
  const customer = await customerRepository.findById(id);

  if (!customer) {
    throw ApiError.notFound(`Customer ${id} not found`);
  }

  return customer;
}

async function ensurePhoneAvailable(phone, excludeId = null) {
  if (!phone) return;

  const existing = await customerRepository.findByPhone(phone, excludeId);
  if (existing) {
    throw ApiError.conflict(
      `A customer with phone "${phone}" already exists`
    );
  }
}

async function create({ name, phone, email, address, state, creditLimit }) {
  await ensurePhoneAvailable(phone);

  return customerRepository.create({ name, phone, email, address, state, creditLimit });
}

async function update(id, { name, phone, email, address, state, creditLimit }) {
  const existing = await getById(id);

  if (phone !== undefined && phone !== null && phone !== '') {
    if (existing.phone !== phone) {
      await ensurePhoneAvailable(phone, id);
    }
  }

  return customerRepository.update(id, {
    name,
    phone,
    email,
    address,
    state,
    creditLimit,
  });
}

async function setStatus(id, status) {
  await getById(id);

  return customerRepository.setStatus(id, status);
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
};