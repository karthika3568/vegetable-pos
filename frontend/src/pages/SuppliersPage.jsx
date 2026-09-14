import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { supplierService, SUPPLIER_STATUS_OPTIONS } from '../services/supplier.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StatusBadge({ status }) {
  const tone = status === 'active' ? 'active' : 'inactive';
  const label = status === 'active' ? 'Active' : 'Inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function contactLine(supplier) {
  const parts = [];
  if (supplier.contact_person) parts.push(supplier.contact_person);
  if (supplier.phone) parts.push(supplier.phone);
  if (supplier.email) parts.push(supplier.email);
  return parts.length ? parts.join(' · ') : 'No contact details';
}

function SupplierFormModal({ initial, onClose, onSubmit }) {
  const editing = Boolean(initial);

  const [name, setName] = useState(initial ? (initial.name ?? '') : '');
  const [contactPerson, setContactPerson] = useState(initial ? (initial.contact_person ?? '') : '');
  const [phone, setPhone] = useState(initial ? (initial.phone ?? '') : '');
  const [email, setEmail] = useState(initial ? (initial.email ?? '') : '');
  const [address, setAddress] = useState(initial ? (initial.address ?? '') : '');
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
    if (trimmedName.length > 150) {
      setError('Name must be at most 150 characters.');
      return;
    }

    const trimmedContact = contactPerson.trim();
    if (trimmedContact.length > 100) {
      setError('Contact person must be at most 100 characters.');
      return;
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 20) {
      setError('Phone must be at most 20 characters.');
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 100) {
      setError('Email must be at most 100 characters.');
      return;
    }
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    const trimmedAddress = address.trim();
    if (trimmedAddress.length > 255) {
      setError('Address must be at most 255 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        contactPerson: trimmedContact || null,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        address: trimmedAddress || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Supplier' : 'New Supplier'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="supplierName">Name</label>
          <input
            id="supplierName"
            name="name"
            type="text"
            maxLength={150}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Farm Fresh Suppliers"
            disabled={submitting}
          />
          <p className="field-hint">Required. Up to 150 characters. Names must be unique — the backend rejects a duplicate.</p>
        </div>

        <div className="form-field">
          <label htmlFor="supplierContactPerson">Contact Person</label>
          <input
            id="supplierContactPerson"
            name="contactPerson"
            type="text"
            maxLength={100}
            value={contactPerson}
            onChange={(event) => setContactPerson(event.target.value)}
            placeholder="e.g. Suresh"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="supplierPhone">Phone</label>
          <input
            id="supplierPhone"
            name="phone"
            type="text"
            maxLength={20}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. 9876543210"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="supplierEmail">Email</label>
          <input
            id="supplierEmail"
            name="email"
            type="email"
            maxLength={100}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="e.g. produce@farmfresh.example"
            disabled={submitting}
          />
          <p className="field-hint">Optional. Up to 100 characters, must be a valid email address.</p>
        </div>

        <div className="form-field">
          <label htmlFor="supplierAddress">Address</label>
          <textarea
            id="supplierAddress"
            name="address"
            rows="3"
            maxLength={255}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Optional street / area address"
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
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Supplier'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SupplierDetailModal({ supplier, onClose }) {
  return (
    <Modal title="Supplier Details" onClose={onClose}>
      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-item">
          <span className="summary-label">Name</span>
          <span className="summary-value">{supplier.name}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Contact Person</span>
          <span className="summary-value">{supplier.contact_person || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Phone</span>
          <span className="summary-value">{supplier.phone || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Email</span>
          <span className="summary-value">{supplier.email || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Status</span>
          <span className="summary-value">
            <StatusBadge status={supplier.status} />
          </span>
        </div>
        <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
          <span className="summary-label">Address</span>
          <span className="summary-value">{supplier.address || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Created</span>
          <span className="summary-value">{formatDateTime(supplier.created_at)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Last Updated</span>
          <span className="summary-value">{formatDateTime(supplier.updated_at)}</span>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export default function SuppliersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [formState, setFormState] = useState(null);
  const [detail, setDetail] = useState(null);

  const { showToast } = useToast();

  const list = useAsync(
    () =>
      supplierService.list({
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
  const closeDetail = useCallback(() => setDetail(null), []);

  async function handleCreateSubmit(payload) {
    await supplierService.create(payload);
    setFormState(null);
    showNotice('Supplier created successfully.');
    list.refetch();
  }

  async function handleUpdateSubmit(payload) {
    await supplierService.update(formState.record.id, payload);
    setFormState(null);
    showNotice('Supplier updated successfully.');
    list.refetch();
  }

  async function handleToggleStatus(record) {
    const next = record.status === 'active' ? 'inactive' : 'active';
    try {
      await supplierService.setStatus(record.id, next);
      showNotice(`Supplier "${record.name}" ${next === 'active' ? 'activated' : 'deactivated'}.`);
      list.refetch();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not change the supplier status.');
    }
  }

  async function handleView(record) {
    try {
      const supplier = await supplierService.get(record.id);
      setDetail(supplier);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not load the supplier details.');
    }
  }

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const hasFilters = Boolean(search || status);

  return (
    <div className="suppliers-page">
      <div className="page-heading">
        <h1 className="page-title">Suppliers</h1>
        <p className="page-intro">
          Supplier master data used by purchases. Names are unique; suppliers are deactivated rather than deleted so
          historical purchases keep resolving.
        </p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, contact, phone, email or address…"
            aria-label="Search suppliers"
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
              {SUPPLIER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-primary" onClick={() => setFormState({ mode: 'create' })}>
            New Supplier
          </button>
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading suppliers…" /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title="Suppliers unavailable"
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No suppliers match your filters' : 'No suppliers yet'}
          description={
            hasFilters
              ? 'Try changing the search text or the status filter.'
              : 'Create the first supplier using the "New Supplier" button.'
          }
        />
      ) : null}

      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} supplier{pagination?.total === 1 ? '' : 's'}
            </p>
            {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table suppliers-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Address</th>
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
                      <span className="cell-sub">{contactLine(record)}</span>
                    </td>
                    <td>{record.address || '—'}</td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td>{formatDateTime(record.created_at)}</td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => handleView(record)} />
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
        <SupplierFormModal
          initial={formState.mode === 'edit' ? formState.record : null}
          onClose={closeForm}
          onSubmit={formState.mode === 'edit' ? handleUpdateSubmit : handleCreateSubmit}
        />
      ) : null}

      {detail ? <SupplierDetailModal supplier={detail} onClose={closeDetail} /> : null}
    </div>
  );
}