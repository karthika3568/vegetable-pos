import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ledgerService, SORT_OPTIONS, dateFieldFor } from '../services/ledger.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { formatMoney, formatDateOnly, formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;

export const TYPE_CONFIG = {
  expense: {
    nouns: 'Expenses',
    noun: 'Expense',
    intro: 'Shop costs and operating expenses recorded in the expense ledger. Rows are immutable history — they can be corrected but never deleted.',
    amountTone: 'danger',
  },
  income: {
    nouns: 'Income',
    noun: 'Income',
    intro: 'Non-sales receipts such as scrap sales, rent received or service charges. Sales and credit money stays in its own ledgers and never appears here.',
    amountTone: 'success',
  },
};

function TypeBadge({ type }) {
  const tone = type === 'expense' ? 'warning' : 'completed';
  return <span className={`badge badge-${tone}`}>{TYPE_CONFIG[type]?.noun || type}</span>;
}

function LedgerAmount({ type, amount }) {
  const tone = TYPE_CONFIG[type]?.amountTone === 'danger' ? 'var(--color-danger)' : 'var(--color-success)';
  const sign = type === 'expense' ? '−' : '';
  return (
    <span className="money" style={{ color: tone, fontWeight: 600 }}>
      {sign}
      {formatMoney(amount)}
    </span>
  );
}

function dateOnly(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function LedgerFormModal({ type, initial, onClose, onSubmit }) {
  const noun = TYPE_CONFIG[type]?.noun || type;
  const dateField = dateFieldFor(type);
  const editing = Boolean(initial);

  const [category, setCategory] = useState(initial ? (initial.category ?? '') : '');
  const [description, setDescription] = useState(initial ? (initial.description ?? '') : '');
  const [amount, setAmount] = useState(initial ? String(initial.amount ?? '') : '');
  const [date, setDate] = useState(initial ? dateOnly(initial[dateField]) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      setError('Category is required.');
      return;
    }
    if (trimmedCategory.length > 50) {
      setError('Category must be at most 50 characters.');
      return;
    }
    if (description.trim().length > 255) {
      setError('Description must be at most 255 characters.');
      return;
    }

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Amount must be a number greater than zero.');
      return;
    }

    const normalizedDate = date ? dateOnly(date) : '';
    if (date && !normalizedDate) {
      setError(`${dateField === 'expenseDate' ? 'Expense' : 'Income'} date must be a valid date.`);
      return;
    }

    const payload = {
      category: trimmedCategory,
      description: description.trim() || undefined,
      amount: value,
    };
    if (normalizedDate) payload[dateField] = normalizedDate;

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${noun}` : `Record ${noun}`} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="ledgerCategory">Category</label>
          <input
            id="ledgerCategory"
            name="category"
            type="text"
            maxLength={50}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={type === 'expense' ? 'e.g. Rent, Wages, Electricity' : 'e.g. Scrap sales, Rent received'}
            disabled={submitting}
          />
          <p className="field-hint">Required. Up to 50 characters.</p>
        </div>

        <div className="form-field">
          <label htmlFor="ledgerDescription">Description / Notes</label>
          <textarea
            id="ledgerDescription"
            name="description"
            maxLength={255}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="ledgerAmount">Amount</label>
          <input
            id="ledgerAmount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            disabled={submitting}
          />
          <p className="field-hint">Must be greater than zero. The backend stores amounts rounded to 2 decimals.</p>
        </div>

        <div className="form-field">
          <label htmlFor="ledgerDate">{dateField === 'expenseDate' ? 'Expense Date' : 'Income Date'}</label>
          <input
            id="ledgerDate"
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={submitting}
          />
          <p className="field-hint">Optional. Defaults to today when left blank.</p>
        </div>

        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Save Changes' : `Record ${noun}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ExpensesIncomePage({ type }) {
  const { hasPermission } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);
  const [formState, setFormState] = useState(null);

  const { showToast } = useToast();

  const list = useAsync(
    () =>
      ledgerService.list(type, {
        search: search || undefined,
        category: category || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        page,
        limit: LIMIT,
      }),
    [type, search, category, fromDate, toDate, sortBy, sortOrder, page]
  );

  const detail = useAsync(
    () => (detailId ? ledgerService.get(type, detailId) : Promise.resolve(null)),
    [type, detailId]
  );

  function showNotice(message) {
    showToast(message, 'success');
  }

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const detailRecord = detail.data;
  const canManage = hasPermission('expenses.manage');
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.expense;
  const hasFilters = Boolean(search || category || fromDate || toDate || sortBy !== 'date' || sortOrder !== 'desc');

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleReset() {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setFromDate('');
    setToDate('');
    setSortBy('date');
    setSortOrder('desc');
    setPage(1);
  }

  function handleCategoryFilter(event) {
    setCategory(event.target.value);
    setPage(1);
  }

  function handleFromDateFilter(event) {
    setFromDate(event.target.value);
    setPage(1);
  }

  function handleToDateFilter(event) {
    setToDate(event.target.value);
    setPage(1);
  }

  function handleSortByFilter(event) {
    setSortBy(event.target.value);
    setPage(1);
  }

  function handleSortOrderFilter(event) {
    setSortOrder(event.target.value);
    setPage(1);
  }

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const closeForm = useCallback(() => setFormState(null), []);

  async function handleCreateSubmit(payload) {
    await ledgerService.create(type, payload);
    setFormState(null);
    showNotice(`${cfg.noun} recorded successfully.`);
    list.refetch();
  }

  async function handleEditSubmit(payload) {
    const id = formState.record.id;
    await ledgerService.update(type, id, payload);
    setFormState(null);
    showNotice(`${cfg.noun} updated successfully.`);
    list.refetch();
    if (detailId === id) detail.refetch();
  }

  return (
    <div className="ledger-page">
      <div className="page-heading">
        <h1 className="page-title">{cfg.nouns}</h1>
        <p className="page-intro">{cfg.intro}</p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search description…"
            aria-label={`Search ${cfg.nouns.toLowerCase()}`}
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Reset
          </button>
        </form>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">Category filter</span>
            <input
              type="text"
              value={category}
              onChange={handleCategoryFilter}
              placeholder="Category (exact)"
              aria-label="Category filter"
            />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">From date</span>
            <input type="date" value={fromDate} onChange={handleFromDateFilter} aria-label="From date" />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">To date</span>
            <input type="date" value={toDate} onChange={handleToDateFilter} aria-label="To date" />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">Sort by</span>
            <select value={sortBy} onChange={handleSortByFilter}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">Sort order</span>
            <select value={sortOrder} onChange={handleSortOrderFilter}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>

          {canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFormState({ mode: 'create' })}
            >
              Record {cfg.noun}
            </button>
          ) : null}
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label={`Loading ${cfg.nouns.toLowerCase()}…`} /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title={`${cfg.nouns} unavailable`}
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? `No ${cfg.nouns.toLowerCase()} match your filters` : `No ${cfg.nouns.toLowerCase()} recorded`}
          description={
            hasFilters
              ? 'Try changing the search, category or date range.'
              : `Record your first ${cfg.noun.toLowerCase()} using the “Record ${cfg.noun}” button.`
          }
        />
      ) : null}

      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} {cfg.nouns.toLowerCase()}
              {pagination?.total === 1 ? '' : 's'}
            </p>
            {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table ledger-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>Recorded By</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((record) => {
                  const recordDate = record[dateFieldFor(type)];
                  return (
                    <tr key={record.id}>
                      <td>
                        <TypeBadge type={type} />
                      </td>
                      <td>{formatDateOnly(recordDate)}</td>
                      <td>
                        <span className="cell-main">{record.category}</span>
                      </td>
                      <td>
                        {record.description ? (
                          <span className="cell-sub" style={{ color: 'var(--color-text)' }}>
                            {record.description}
                          </span>
                        ) : (
                          <span className="cell-sub">—</span>
                        )}
                      </td>
                      <td className="num">
                        <LedgerAmount type={type} amount={record.amount} />
                      </td>
                      <td>{record.createdByName || `#${record.createdBy ?? '—'}`}</td>
                      <td className="actions-col">
                        <div className="table-actions">
                          <ActionButton action="view" onClick={() => openDetail(record.id)} />
                          {canManage ? (
                            <ActionButton action="edit" onClick={() => setFormState({ mode: 'edit', record })} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={pagination?.page ?? 1} totalPages={pagination?.totalPages ?? 1} onChange={setPage} />
        </div>
      ) : null}

      {detailId ? (
        <Modal title={`${cfg.noun} Details`} onClose={closeDetail} wide>
          {detail.loading && !detailRecord ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Spinner label="Loading details…" />
            </div>
          ) : null}

          {detail.error && !detailRecord ? (
            <div className="form-alert" role="alert">
              {detail.error.message || 'Could not load details.'}
            </div>
          ) : null}

          {detailRecord ? (
            <div className="ledger-detail">
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div className="summary-item">
                  <span className="summary-label">Type</span>
                  <span className="summary-value">
                    <TypeBadge type={type} />
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">ID</span>
                  <span className="summary-value">#{detailRecord.id}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Category</span>
                  <span className="summary-value">{detailRecord.category}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">{dateFieldFor(type) === 'expenseDate' ? 'Expense Date' : 'Income Date'}</span>
                  <span className="summary-value">{formatDateOnly(detailRecord[dateFieldFor(type)])}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Amount</span>
                  <span className="summary-value">
                    <LedgerAmount type={type} amount={detailRecord.amount} />
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Recorded By</span>
                  <span className="summary-value">{detailRecord.createdByName || `#${detailRecord.createdBy ?? '—'}`}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Recorded At</span>
                  <span className="summary-value">{formatDateTime(detailRecord.createdAt)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Description / Notes</span>
                  <span className="summary-value">{detailRecord.description || '—'}</span>
                </div>
              </div>

              {canManage ? (
                <div className="card-heading">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setFormState({ mode: 'edit', record: detailRecord })}
                  >
                    Edit {cfg.noun}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {formState ? (
        <LedgerFormModal
          type={type}
          initial={formState.mode === 'edit' ? formState.record : null}
          onClose={closeForm}
          onSubmit={formState.mode === 'edit' ? handleEditSubmit : handleCreateSubmit}
        />
      ) : null}
    </div>
  );
}