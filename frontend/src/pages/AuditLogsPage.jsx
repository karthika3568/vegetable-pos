import { useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { auditService } from '../services/audit.service.js';
import { useLanguage } from '../i18n/index.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateTime } from '../utils/format.js';

const LIMIT = 20;

function JsonPatch({ label, value }) {
  const [open, setOpen] = useState(false);
  if (!value) {
    return (
      <span className="cell-sub">—</span>
    );
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className="audit-json">
      <button
        type="button"
        className={`btn btn-outline btn-sm${open ? ' is-active' : ''}`}
        onClick={() => setOpen((current) => !current)}
      >
        {label} {open ? '−' : '+'}
      </button>
      {open ? <pre className="audit-json-pre">{text}</pre> : null}
    </div>
  );
}

function AuditDetail({ entry }) {
  const { t } = useLanguage();
  return (
    <div className="audit-detail">
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">{t('audit.action')}</span>
          <span className="summary-value">{entry.action}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('audit.entity')}</span>
          <span className="summary-value">{entry.entityType}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('audit.entityId')}</span>
          <span className="summary-value">{entry.entityId ?? '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('audit.user')}</span>
          <span className="summary-value">{entry.userName || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('audit.ip')}</span>
          <span className="summary-value">{entry.ipAddress || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('audit.time')}</span>
          <span className="summary-value">{formatDateTime(entry.createdAt)}</span>
        </div>
      </div>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">{t('audit.oldValues')}</span>
          <JsonPatch label={t('audit.oldValues')} value={entry.oldValues} />
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('audit.newValues')}</span>
          <JsonPatch label={t('audit.newValues')} value={entry.newValues} />
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);

  const auditLog = useAsync(
    () =>
      auditService.list({
        search: search || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: LIMIT,
      }),
    [search, action, entityType, fromDate, toDate, page]
  );

  const items = auditLog.data?.items ?? [];
  const pagination = auditLog.data?.pagination ?? null;
  const hasFilters = Boolean(search || action || entityType || fromDate || toDate);

  return (
    <div className="audit-page">
      <div className="page-heading">
        <h1 className="page-title">{t('audit.title')}</h1>
        <p className="page-intro">{t('audit.intro')}</p>
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
            placeholder={t('audit.action')}
            aria-label={t('audit.action')}
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
              setAction('');
              setEntityType('');
              setFromDate('');
              setToDate('');
              setPage(1);
            }}
          >
            {t('common.close')}
          </button>
        </form>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">{t('audit.action')}</span>
            <select
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('audit.entity')}</option>
              <option value="products">products</option>
              <option value="categories">categories</option>
              <option value="customers">customers</option>
              <option value="suppliers">suppliers</option>
              <option value="tax_codes">tax_codes</option>
              <option value="sales">sales</option>
              <option value="settings">settings</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('audit.time')}</span>
            <input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} aria-label={t('audit.time')} />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('audit.time')}</span>
            <input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} aria-label={t('audit.time')} />
          </label>
        </div>
      </div>

      {auditLog.loading && !auditLog.data ? <PageLoader label={t('common.loading')} /> : null}

      {auditLog.error && !auditLog.data ? (
        <ErrorState
          title={t('audit.title')}
          message={auditLog.error.message}
          status={auditLog.error.status}
          onRetry={() => auditLog.refetch()}
        />
      ) : null}

      {auditLog.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('audit.noEntries') : t('audit.noEntries')}
          description={t('audit.intro')}
        />
      ) : null}

      {auditLog.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0}
            </p>
            {auditLog.loading ? <span className="table-refreshing">…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table audit-table">
              <thead>
                <tr>
                  <th>{t('audit.time')}</th>
                  <th>{t('audit.user')}</th>
                  <th>{t('audit.action')}</th>
                  <th>{t('audit.entity')}</th>
                  <th className="num">{t('audit.entityId')}</th>
                  <th>{t('audit.ip')}</th>
                  <th className="actions-col">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-main">{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.userName || '—'}</td>
                    <td>
                      <span className="cell-main">{entry.action}</span>
                    </td>
                    <td>{entry.entityType}</td>
                    <td className="num">{entry.entityId ?? '—'}</td>
                    <td>{entry.ipAddress || '—'}</td>
                    <td className="actions-col">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setDetail(entry)}>
                        {t('common.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={pagination?.page ?? 1} totalPages={pagination?.totalPages ?? 1} onChange={setPage} />
        </div>
      ) : null}

      {detail ? (
        <Modal title={`${t('audit.title')} #${detail.id}`} onClose={() => setDetail(null)} wide>
          <AuditDetail entry={detail} />
        </Modal>
      ) : null}
    </div>
  );
}