import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { taxCodeService } from '../services/tax-code.service.js';
import { useLanguage } from '../i18n/index.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;

function toRounded(value, dp) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const factor = 10 ** dp;
  return Math.round(n * factor) / factor;
}

function StatusBadge({ status }) {
  const { t } = useLanguage();
  const label = status === 'active' ? t('common.active') : status === 'inactive' ? t('common.inactive') : String(status || '—');
  const tone = status === 'active' ? 'active' : 'inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function TaxCodeFormModal({ taxCode, onSubmit, onClose }) {
  const { t } = useLanguage();
  const isEdit = Boolean(taxCode);

  const [values, setValues] = useState(() => ({
    code: taxCode?.code ?? '',
    name: taxCode?.name ?? '',
    cgstRate: taxCode?.cgstRate ?? '',
    sgstRate: taxCode?.sgstRate ?? '',
    igstRate: taxCode?.igstRate ?? '',
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  function validate() {
    const errors = {};
    if (!String(values.code || '').trim()) errors.code = 'required';
    if (String(values.code || '').trim().length > 20) errors.code = 'max20';
    if (!String(values.name || '').trim()) errors.name = 'required';
    if (String(values.name || '').trim().length > 100) errors.name = 'max100';
    for (const key of ['cgstRate', 'sgstRate', 'igstRate']) {
      const raw = values[key];
      if (raw === '' || raw == null) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) errors[key] = 'range';
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      code: String(values.code || '').trim(),
      name: String(values.name || '').trim(),
      ...(values.cgstRate !== '' ? { cgstRate: toRounded(values.cgstRate, 2) } : { cgstRate: 0 }),
      ...(values.sgstRate !== '' ? { sgstRate: toRounded(values.sgstRate, 2) } : { sgstRate: 0 }),
      ...(values.igstRate !== '' ? { igstRate: toRounded(values.igstRate, 2) } : { igstRate: 0 }),
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? t('taxCodes.title') : t('taxCodes.title')} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className={`form-field ${fieldErrors.code ? 'invalid' : ''}`}>
            <label htmlFor="taxCodeCode">{t('taxCodes.code')}</label>
            <input
              id="taxCodeCode"
              name="code"
              type="text"
              value={values.code}
              onChange={handleChange}
              placeholder="e.g. GST-05"
              disabled={submitting}
              maxLength={20}
            />
            {fieldErrors.code ? <p className="field-error">{fieldErrors.code}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.name ? 'invalid' : ''}`}>
            <label htmlFor="taxCodeName">{t('taxCodes.name')}</label>
            <input
              id="taxCodeName"
              name="name"
              type="text"
              value={values.name}
              onChange={handleChange}
              placeholder="e.g. Vegetables 5%"
              disabled={submitting}
              maxLength={100}
            />
            {fieldErrors.name ? <p className="field-error">{fieldErrors.name}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.cgstRate ? 'invalid' : ''}`}>
            <label htmlFor="taxCodeCgst">{t('taxCodes.cgst')}</label>
            <input
              id="taxCodeCgst"
              name="cgstRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={values.cgstRate}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.cgstRate ? <p className="field-error">{fieldErrors.cgstRate}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.sgstRate ? 'invalid' : ''}`}>
            <label htmlFor="taxCodeSgst">{t('taxCodes.sgst')}</label>
            <input
              id="taxCodeSgst"
              name="sgstRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={values.sgstRate}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.sgstRate ? <p className="field-error">{fieldErrors.sgstRate}</p> : null}
          </div>

          <div className={`form-field ${fieldErrors.igstRate ? 'invalid' : ''}`}>
            <label htmlFor="taxCodeIgst">{t('taxCodes.igst')}</label>
            <input
              id="taxCodeIgst"
              name="igstRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={values.igstRate}
              onChange={handleChange}
              placeholder="0.00"
              disabled={submitting}
            />
            {fieldErrors.igstRate ? <p className="field-error">{fieldErrors.igstRate}</p> : null}
          </div>
        </div>

        {formError ? (
          <div className="form-alert" role="alert">
            {formError}
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

export default function TaxCodesPage() {
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const { showToast } = useToast();

  const taxCodes = useAsync(
    () =>
      taxCodeService.list({
        search: search || undefined,
        status: status || undefined,
        page,
        limit: LIMIT,
      }),
    [search, status, page]
  );

  function showNotice(message) {
    showToast(message, 'success');
  }

  const closeEdit = useCallback(() => {
    setEditing(null);
    setModalOpen(false);
  }, []);

  async function handleFormSubmit(values) {
    if (editing) {
      await taxCodeService.update(editing.id, values);
      showNotice(`${t('taxCodes.title')}: ${values.code} updated.`);
    } else {
      await taxCodeService.create(values);
      showNotice(`${t('taxCodes.title')}: ${values.code} created.`);
    }
    closeEdit();
    if (page === 1) await taxCodes.refetch();
    else setPage(1);
  }

  async function handleToggleStatus() {
    const record = confirmAction.record;
    const nextStatus = record.status === 'active' ? 'inactive' : 'active';
    const actionWord = nextStatus === 'active' ? t('common.active') : t('common.inactive');

    try {
      await taxCodeService.setStatus(record.id, nextStatus);
      setConfirmAction(null);
      await taxCodes.refetch();
      showNotice(`${record.code} ${actionWord}.`);
    } catch (err) {
      setConfirmAction(null);
      showNotice(err instanceof Error ? err.message : 'Could not update tax code status.');
    }
  }

  const items = taxCodes.data?.items ?? [];
  const pagination = taxCodes.data?.pagination ?? null;
  const hasFilters = Boolean(search || status);

  return (
    <div className="tax-codes-page">
      <div className="page-heading">
        <h1 className="page-title">{t('taxCodes.title')}</h1>
        <p className="page-intro">{t('taxCodes.intro')}</p>
      </div>

      <div className="toolbar">
        <form
          className="toolbar-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
          role="search"
        >
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('common.searching')}
            aria-label={t('common.searching')}
          />
          <button type="submit" className="btn btn-primary">
            {t('pos.search')}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setStatus('');
              setPage(1);
            }}
          >
            {t('common.close')}
          </button>
        </form>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">Status filter</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </select>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            {t('products.newProduct')}
          </button>
        </div>
      </div>

      {taxCodes.loading && !taxCodes.data ? <PageLoader label={t('common.loading')} /> : null}

      {taxCodes.error && !taxCodes.data ? (
        <ErrorState
          title={t('taxCodes.title')}
          message={taxCodes.error.message}
          status={taxCodes.error.status}
          onRetry={() => taxCodes.refetch()}
        />
      ) : null}

      {taxCodes.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('taxCodes.title') : t('taxCodes.title')}
          description={t('taxCodes.intro')}
        />
      ) : null}

      {taxCodes.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} {t('taxCodes.code')}
            </p>
            {taxCodes.loading ? <span className="table-refreshing">…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table tax-codes-table">
              <thead>
                <tr>
                  <th>{t('taxCodes.code')}</th>
                  <th>{t('taxCodes.name')}</th>
                  <th className="num">{t('taxCodes.cgst')}</th>
                  <th className="num">{t('taxCodes.sgst')}</th>
                  <th className="num">{t('taxCodes.igst')}</th>
                  <th>{t('products.status')}</th>
                  <th className="actions-col">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((taxCode) => (
                  <tr key={taxCode.id}>
                    <td className="cell-main cell-code">{taxCode.code}</td>
                    <td>{taxCode.name}</td>
                    <td className="num">{taxCode.cgstRate}%</td>
                    <td className="num">{taxCode.sgstRate}%</td>
                    <td className="num">{taxCode.igstRate}%</td>
                    <td>
                      <StatusBadge status={taxCode.status} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="edit" onClick={() => { setEditing(taxCode); setModalOpen(true); }}>{t('common.edit')}</ActionButton>
                        <ActionButton action={taxCode.status === 'active' ? 'deactivate' : 'activate'} onClick={() => setConfirmAction({ record: taxCode })}>
                          {taxCode.status === 'active' ? t('common.inactive') : t('common.active')}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={pagination?.page ?? 1} totalPages={pagination?.totalPages ?? 1} onChange={setPage} />
        </div>
      ) : null}

      {modalOpen ? (
        <TaxCodeFormModal
          taxCode={editing}
          onSubmit={handleFormSubmit}
          onClose={closeEdit}
        />
      ) : null}

      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.record.status === 'active' ? t('common.inactive') : t('common.active')}
          message={`${confirmAction.record.status === 'active' ? t('common.inactive') : t('common.active')} ${confirmAction.record.code}?`}
          confirmLabel={t('common.confirm')}
          onConfirm={handleToggleStatus}
          onClose={() => setConfirmAction(null)}
        />
      ) : null}
    </div>
  );
}