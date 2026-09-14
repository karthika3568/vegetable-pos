/**
 * Setting service - business rules for the shop/application
 * configuration module.
 *
 * Settings live in the existing generic key/value table (setting_key
 * UNIQUE, setting_value TEXT). Business rules here are intentionally
 * thin and are driven by what the schema actually defines:
 *
 * - No create/delete: settings are provisioned configuration and are
 *   updated in place, never casually added or removed.
 * - A setting is addressed by its unique key; updating a missing key
 *   is a 404 (there is no upsert).
 * - Only value (and optionally description) are editable; the key and
 *   id are immutable identifiers. updated_by/updated_at are audited.
 * - updated_by records the authenticated user who made the change.
 * - No secrets/passwords are stored, logged or exposed; all settings in
 *   the seed are plain business configuration values.
 */

const settingRepository = require('../repositories/setting.repository');
const auditService = require('./audit.service');
const ApiError = require('../utils/ApiError');

const ALLOWED_LANGUAGES = ['en', 'ta'];

async function list() {
  return settingRepository.findAll();
}

async function getByKey(key) {
  const setting = await settingRepository.findByKey(key);

  if (!setting) {
    throw ApiError.notFound(`Setting "${key}" not found`);
  }

  return setting;
}

async function updateByKey(key, { value, description }, updatedBy) {
  await getByKey(key);

  if (key === 'app_language' && !ALLOWED_LANGUAGES.includes(value)) {
    throw ApiError.badRequest(
      `app_language must be one of: ${ALLOWED_LANGUAGES.join(', ')}`
    );
  }

  const existing = await settingRepository.findByKey(key);

  const updated = await settingRepository.updateByKey(key, {
    value,
    description,
    updatedBy,
  });

  await auditService.log({
    userId: updatedBy,
    action: 'UPDATE_SETTING',
    entityType: 'settings',
    entityId: updated.id,
    oldValues: existing,
    newValues: updated,
  });

  return updated;
}

module.exports = {
  list,
  getByKey,
  updateByKey,
};