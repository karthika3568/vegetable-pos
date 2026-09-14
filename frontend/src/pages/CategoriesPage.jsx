import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { categoryService } from '../services/category.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateOnly } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

function StatusBadge({ status }) {
  const tone = status === 'active' ? 'active' : 'inactive';
  const label = status === 'active' ? 'Active' : 'Inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function CategoryFormModal({ initial, onClose, onSubmit }) {
  const editing = Boolean(initial);

  const [name, setName] = useState(initial ? (initial.name ?? '') : '');
  const [description, setDescription] = useState(initial ? (initial.description ?? '') : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Name must be at most 100 characters.');
      return;
    }
    if (description.trim().length > 255) {
      setError('Description must be at most 255 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim() || null,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The request could not be completed. Check that the name is not already in use.'
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Category' : 'New Category'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="categoryName">Name</label>
          <input
            id="categoryName"
            name="name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Vegetables"
            disabled={submitting}
          />
          <p className="field-hint">Required. Up to 100 characters. Names must be unique.</p>
        </div>

        <div className="form-field">
          <label htmlFor="categoryDescription">Description</label>
          <textarea
            id="categoryDescription"
            name="description"
            maxLength={255}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional"
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
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [formState, setFormState] = useState(null);

  const { showToast } = useToast();

  const list = useAsync(
    () =>
      categoryService.list({
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

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleReset() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPage(1);
  }

  function handleStatusFilter(event) {
    setStatus(event.target.value);
    setPage(1);
  }

  const closeForm = useCallback(() => setFormState(null), []);

  async function handleCreateSubmit(payload) {
    await categoryService.create(payload);
    setFormState(null);
    showNotice('Category created successfully.');
    list.refetch();
  }

  async function handleUpdateSubmit(payload) {
    await categoryService.update(formState.record.id, payload);
    setFormState(null);
    showNotice('Category updated successfully.');
    list.refetch();
  }

  async function handleToggleStatus(record) {
    const next = record.status === 'active' ? 'inactive' : 'active';
    try {
      await categoryService.setStatus(record.id, next);
      showNotice(`Category "${record.name}" ${next === 'active' ? 'activated' : 'deactivated'}.`);
      list.refetch();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not change the category status.');
    }
  }

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const hasFilters = Boolean(search || status);

  return (
    <div className="categories-page">
      <div className="page-heading">
        <h1 className="page-title">Categories</h1>
        <p className="page-intro">
          Organize products by category. Categories are master data — products reference them by category ID. The
          backend enforces unique names.
        </p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name or description…"
            aria-label="Search categories"
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
            <span className="sr-only">Status filter</span>
            <select value={status} onChange={handleStatusFilter}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-primary" onClick={() => setFormState({ mode: 'create' })}>
            New Category
          </button>
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading categories…" /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title="Categories unavailable"
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No categories match your filters' : 'No categories yet'}
          description={
            hasFilters
              ? 'Try changing the search text or the status filter.'
              : 'Create your first category using the "New Category" button.'
          }
        />
      ) : null}

      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} categor{pagination?.total === 1 ? 'y' : 'ies'}
            </p>
            {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table categories-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="cell-main">{record.name}</span>
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
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td>{formatDateOnly(record.created_at)}</td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="edit" onClick={() => setFormState({ mode: 'edit', record })} />
                        <ActionButton action={record.status === 'active' ? 'deactivate' : 'activate'} onClick={() => handleToggleStatus(record)}>
                          {record.status === 'active' ? 'Deactivate' : 'Activate'}
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

      {formState ? (
        <CategoryFormModal
          initial={formState.mode === 'edit' ? formState.record : null}
          onClose={closeForm}
          onSubmit={formState.mode === 'edit' ? handleUpdateSubmit : handleCreateSubmit}
        />
      ) : null}
    </div>
  );
}