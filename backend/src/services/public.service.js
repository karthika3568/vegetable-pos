/**
 * Public service - unauthenticated application configuration that the
 * login screen and POS must read without an account (or before the
 * user role is known). Never exposes business data.
 */

const settingRepository = require('../repositories/setting.repository');

const DEFAULT_LANGUAGE = 'en';
const ALLOWED_LANGUAGES = ['en', 'ta'];

async function appConfig() {
  const languageSetting = await settingRepository.findByKey('app_language');
  const shopNameSetting = await settingRepository.findByKey('shop_name');

  const language = languageSetting && ALLOWED_LANGUAGES.includes(languageSetting.setting_value)
    ? languageSetting.setting_value
    : DEFAULT_LANGUAGE;

  return {
    language,
    shopName: shopNameSetting ? shopNameSetting.setting_value : null,
  };
}

module.exports = {
  appConfig,
};