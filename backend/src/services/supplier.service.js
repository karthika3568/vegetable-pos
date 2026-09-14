/**
 * Supplier service - business rules for the supplier module.
 *
 * Mirrors the category module: server-side search + status filter +
 * pagination, name-uniqueness enforcement (the schema has no UNIQUE
 * constraint on suppliers.name, so it is enforced here and returns a
 * 409), and soft-disable via status so future purchase records can
 * keep referencing the supplier (purchases.supplier_id is FK RESTRICT,
 * never delete).
 */

const supplierRepository = require('../repositories/supplier.repository');
const auditService = require('./audit.service');
const ApiError = require('../utils/ApiError');

async function list({ status, search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await supplierRepository.findAll({
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
  const supplier = await supplierRepository.findById(id);

  if (!supplier) {
    throw ApiError.notFound(`Supplier ${id} not found`);
  }

  return supplier;
}

async function create({ name, contactPerson, phone, email, address, actorId = null }) {
  const existing = await supplierRepository.findByName(name);
  if (existing) {
    throw ApiError.conflict(`Supplier "${name}" already exists`);
  }

  const created = await supplierRepository.create({ name, contactPerson, phone, email, address });

  await auditService.log({
    userId: actorId,
    action: 'CREATE_SUPPLIER',
    entityType: 'suppliers',
    entityId: created.id,
    newValues: created,
  });

  return created;
}

async function update(id, { name, contactPerson, phone, email, address, actorId = null }) {
  const existing = await getById(id);

  if (name !== undefined && name !== existing.name) {
    const duplicate = await supplierRepository.findByName(name);
    if (duplicate) {
      throw ApiError.conflict(`Supplier "${name}" already exists`);
    }
  }

  const updated = await supplierRepository.update(id, {
    name,
    contactPerson,
    phone,
    email,
    address,
  });

  await auditService.log({
    userId: actorId,
    action: 'UPDATE_SUPPLIER',
    entityType: 'suppliers',
    entityId: id,
    oldValues: existing,
    newValues: updated,
  });

  return updated;
}

async function setStatus(id, status, actorId = null) {
  const existing = await getById(id);

  const updated = await supplierRepository.setStatus(id, status);

  await auditService.log({
    userId: actorId,
    action: status === 'active' ? 'ACTIVATE_SUPPLIER' : 'DEACTIVATE_SUPPLIER',
    entityType: 'suppliers',
    entityId: id,
    oldValues: existing,
    newValues: updated,
  });

  return updated;
}

module.exports = {
  list,
  getById,
  create,
  update,
  setStatus,
};