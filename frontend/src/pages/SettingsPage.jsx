import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { settingService } from '../services/settings.service.js';
import { useLanguage } from '../i18n/index.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

function SettingFormModal({ setting, onClose, onSubmit }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(setting.setting_value ?? '');
  const [description, setDescription] = useState(setting.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 255) {
      setError('max255');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        value,
        description: trimmedDescription || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('settings.editSetting', { key: setting.setting_key })} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="pick-box">
          <div className="pick-box-main">{setting.setting_key}</div>
          <div className="pick-box-sub">{setting.description || t('common.notAvailable')}</div>
        </div>

        <div className="form-field">
          <label htmlFor="settingValue">{t('settings.value')}</label>
          <input
            id="settingValue"
            name="value"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('settings.value')}
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="settingDescription">{t('settings.description')}</label>
          <textarea
            id="settingDescription"
            name="description"
            rows="3"
            maxLength={255}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('settings.description')}
            disabled={submitting}
          />
        </div>

        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function SettingsPage() {
  const { t, lang, setLanguage } = useLanguage();
  const [editing, setEditing] = useState(null);
  const { showToast } = useToast();
  const [languageBusy, setLanguageBusy] = useState(false);

  const settings = useAsync(() => settingService.list(), []);

  function showNotice(message) {
    showToast(message, 'success');
  }

  const closeEdit = useCallback(() => setEditing(null), []);

  async function handleUpdateSubmit(payload) {
    await settingService.updateByKey(editing.setting_key, payload);
    setEditing(null);
    showNotice(`${editing.setting_key} updated.`);
    settings.refetch();
  }

  async function handleSetLanguage(nextLang) {
    if (nextLang === lang || languageBusy) return;
    setLanguageBusy(true);
    const prev = lang;
    // Optimistically switch UI language for immediate feedback
    setLanguage(nextLang);

    // If the backend has a provisioned key `app_language`, update it
    const langSetting = items.find((s) => s.setting_key === 'app_language');
    if (!langSetting) {
      // No backend setting provisioned — persist locally only and advise
      showNotice(`${t('settings.language')}: ${nextLang}`);
      setLanguageBusy(false);
      return;
    }

    try {
      await settingService.updateByKey('app_language', { value: nextLang, description: 'UI language (en|ta)' });
      showNotice(`${t('settings.language')}: ${nextLang}`);
      settings.refetch();
    } catch (err) {
      // revert on failure
      setLanguage(prev);
      showNotice(err instanceof Error ? err.message : 'error');
    } finally {
      setLanguageBusy(false);
    }
  }

  const items = settings.data ?? [];
  const shopState = items.find((setting) => setting.setting_key === 'shop_state')?.setting_value ?? '—';
  const soundSetting = items.find((setting) => setting.setting_key === 'sound_enabled');

  // Ensure shop state is Tamil Nadu if backend still reports Maharashtra.
  // Run once after settings load and avoid re-running.
  useEffect(() => {
    let active = true;
    async function ensureState() {
      if (!active) return;
      const current = items.find((s) => s.setting_key === 'shop_state')?.setting_value;
      if (current && String(current).trim() === 'Maharashtra') {
        try {
          await settingService.updateByKey('shop_state', { value: 'Tamil Nadu', description: 'updated via frontend settings' });
          showNotice('Shop state updated to Tamil Nadu');
          settings.refetch();
        } catch (err) {
          // don't block UI; surface toast
          showNotice(err instanceof Error ? err.message : 'Could not update shop state');
        }
      }
    }

    if (items.length > 0) ensureState();
    return () => { active = false; };
  }, [items, settings]);

  async function handleSoundToggle() {
    if (!soundSetting) return;
    try {
      await settingService.updateByKey('sound_enabled', {
        value: soundSetting.setting_value === 'off' ? 'on' : 'off',
        description: soundSetting.description,
      });
      showNotice(`Sound notifications ${soundSetting.setting_value === 'off' ? 'enabled' : 'disabled'}.`);
      settings.refetch();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not update sound notifications.');
    }
  }

  return (
    <div className="settings-page">
      <div className="page-heading">
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="page-intro">{t('settings.intro')}</p>
      </div>

      <div className="table-card settings-quick-card">
        <div className="table-tools">
          <p className="table-count">{t('settings.language')}</p>
        </div>
        <div className="settings-quick-grid">
          <div className="settings-quick-item">
            <span className="summary-label">{t('settings.language')}</span>
            <div className="settings-language-toggle" role="group" aria-label={t('settings.language')}>
              <button
                type="button"
                className={lang === 'en' ? 'is-active' : ''}
                onClick={() => handleSetLanguage('en')}
                disabled={languageBusy}
              >
                {t('settings.english')}
              </button>
              <button
                type="button"
                className={lang === 'ta' ? 'is-active' : ''}
                onClick={() => handleSetLanguage('ta')}
                disabled={languageBusy}
              >
                {t('settings.tamil')}
              </button>
            </div>
            <p className="field-hint">{t('settings.languageHint')}</p>
          </div>

          <div className="settings-quick-item">
            <span className="summary-label">{t('settings.shopState')}</span>
            <span className="summary-value">{shopState}</span>
            <p className="field-hint">{t('settings.shopStateHint')}</p>
          </div>

          {soundSetting ? (
            <div className="settings-quick-item">
              <span className="summary-label">Sound Notifications</span>
              <button type="button" className="settings-sound-toggle" onClick={handleSoundToggle}>
                {soundSetting.setting_value === 'off' ? 'Off' : 'On'}
              </button>
              <p className="field-hint">Controls product, payment, invoice, and error sounds.</p>
            </div>
          ) : null}
        </div>
      </div>

      {settings.loading && !settings.data ? <PageLoader label={t('common.loading')} /> : null}

      {settings.error && !settings.data ? (
        <ErrorState
          title={t('settings.title')}
          message={settings.error.message}
          status={settings.error.status}
          onRetry={() => settings.refetch()}
        />
      ) : null}

      {settings.data && items.length === 0 ? (
        <EmptyState title={t('settings.title')} description={t('settings.intro')} />
      ) : null}

      {settings.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">{items.length}</p>
            {settings.loading ? <span className="table-refreshing">…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table settings-table">
              <thead>
                <tr>
                  <th>{t('settings.title')}</th>
                  <th>{t('settings.value')}</th>
                  <th>{t('audit.user')}</th>
                  <th className="actions-col">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((setting) => (
                  <tr key={setting.setting_key}>
                    <td>
                      <span className="cell-main">{setting.setting_key}</span>
                      <span className="cell-sub">{setting.description || t('common.notAvailable')}</span>
                    </td>
                    <td>
                      <span className="cell-main">{setting.setting_value ?? '—'}</span>
                    </td>
                    <td>
                      {setting.updated_at ? (
                        <>
                          <span className="cell-main">{formatDateTime(setting.updated_at)}</span>
                          <span className="cell-sub">
                            {setting.updated_by != null ? `#${setting.updated_by}` : t('common.notAvailable')}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="edit" onClick={() => setEditing(setting)}>{t('common.edit')}</ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {editing ? (
        <SettingFormModal setting={editing} onClose={closeEdit} onSubmit={handleUpdateSubmit} />
      ) : null}
    </div>
  );
}