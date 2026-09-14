/**
 * Category service - business rules for the category module.
 * Handles pagination, search, status filtering, and CRUD operations.
 */

const categoryRepository = require('../repositories/category.repository');
const auditService = require('./audit.service');
const ApiError = require('../utils/ApiError');

async function list({ status, search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const { rows, total } = await categoryRepository.findAll({
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
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw ApiError.notFound(`Category ${id} not found`);
  }

  return category;
}

async function create({ name, description, actorId = null }) {
  const existing = await categoryRepository.findByName(name);
  if (existing) {
    throw ApiError.conflict(`Category "${name}" already exists`);
  }

  const created = await categoryRepository.create({ name, description });

  await auditService.log({
    userId: actorId,
    action: 'CREATE_CATEGORY',
    entityType: 'categories',
    entityId: created.id,
    newValues: created,
  });

  return created;
}

async function update(id, { name, description, actorId = null }) {
  const existing = await getById(id);

  if (name !== undefined && name !== existing.name) {
    const duplicate = await categoryRepository.findByName(name);
    if (duplicate) {
      throw ApiError.conflict(`Category "${name}" already exists`);
    }
  }

  const updated = await categoryRepository.update(id, {
    name,
    description,
  });

  await auditService.log({
    userId: actorId,
    action: 'UPDATE_CATEGORY',
    entityType: 'categories',
    entityId: id,
    oldValues: existing,
    newValues: updated,
  });

  return updated;
}

async function setStatus(id, status, actorId = null) {
  const existing = await getById(id);

  const updated = await categoryRepository.setStatus(id, status);

  await auditService.log({
    userId: actorId,
    action: status === 'active' ? 'ACTIVATE_CATEGORY' : 'DEACTIVATE_CATEGORY',
    entityType: 'categories',
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