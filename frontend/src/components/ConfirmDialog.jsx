import { useState } from 'react';
import Modal from './Modal.jsx';
import { useLanguage } from '../i18n/index.jsx';

export default function ConfirmDialog({ title, message, confirmLabel, confirmBusyLabel, tone = 'primary', onConfirm, onClose }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function handleConfirm(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={handleConfirm} noValidate>
        <p className="confirm-message" role="alert">{message}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? (confirmBusyLabel ?? t('common.saving')) : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}