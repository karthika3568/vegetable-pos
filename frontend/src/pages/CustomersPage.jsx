import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { customerService, CUSTOMER_STATUS_OPTIONS } from '../services/customer.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import { formatMoney, formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StatusBadge({ status }) {
  const tone = status === 'active' ? 'active' : 'inactive';
  const label = status === 'active' ? 'Active' : 'Inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function MoneyCell({ value, tone }) {
  return <span className={`money${tone ? ` tone-${tone}` : ''}`}>{formatMoney(value)}</span>;
}

function contactLine(customer) {
  if (customer.phone && customer.email) return `${customer.phone} · ${customer.email}`;
  if (customer.phone) return customer.phone;
  if (customer.email) return customer.email;
  return 'No phone or email';
}

function CustomerFormModal({ initial, onClose, onSubmit }) {
  const editing = Boolean(initial);

  const [name, setName] = useState(initial ? (initial.name ?? '') : '');
  const [phone, setPhone] = useState(initial ? (initial.phone ?? '') : '');
  const [email, setEmail] = useState(initial ? (initial.email ?? '') : '');
  const [address, setAddress] = useState(initial ? (initial.address ?? '') : '');
  const [creditLimit, setCreditLimit] = useState(
    initial ? (initial.credit_limit != null ? String(initial.credit_limit) : '') : ''
  );
  const [openingBalance, setOpeningBalance] = useState(
    initial ? (initial.opening_balance != null ? String(initial.opening_balance) : '') : ''
  );
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

    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 10) {
      setError('Phone must be at most 10 characters.');
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

    const creditLimitValue =
      creditLimit.trim() === '' ? undefined : Number(creditLimit);
    if (creditLimitValue !== undefined && (!Number.isFinite(creditLimitValue) || creditLimitValue < 0)) {
      setError('Credit limit must be a non-negative number.');
      return;
    }

    const openingBalanceValue =
      openingBalance.trim() === '' ? undefined : Number(openingBalance);
    if (openingBalanceValue !== undefined && (!Number.isFinite(openingBalanceValue) || openingBalanceValue < 0)) {
      setError('Opening balance must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        address: trimmedAddress || null,
        creditLimit: creditLimitValue,
        openingBalance: openingBalanceValue,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Customer' : 'New Customer'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="customerName">Name</label>
          <input
            id="customerName"
            name="name"
            type="text"
            maxLength={150}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Ramesh Kumar"
            disabled={submitting}
          />
          <p className="field-hint">Required. Up to 150 characters. Duplicate names are allowed.</p>
        </div>

        <div className="form-field">
          <label htmlFor="customerPhone">Phone</label>
          <input
            id="customerPhone"
            name="phone"
            type="text"
            maxLength={10}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. 9876543210"
            disabled={submitting}
          />
          <p className="field-hint">Optional. Up to 10 characters. Must be unique — the backend rejects a phone already in use.</p>
        </div>

        <div className="form-field">
          <label htmlFor="customerEmail">Email</label>
          <input
            id="customerEmail"
            name="email"
            type="email"
            maxLength={100}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="e.g. ramesh@example.com"
            disabled={submitting}
          />
          <p className="field-hint">Optional. Up to 100 characters, must be a valid email address.</p>
        </div>

        <div className="form-field">
          <label htmlFor="customerAddress">Address</label>
          <textarea
            id="customerAddress"
            name="address"
            rows="3"
            maxLength={255}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Optional street / area address"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="customerCreditLimit">Credit Limit</label>
          <input
            id="customerCreditLimit"
            name="creditLimit"
            type="number"
            min="0"
            step="0.01"
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            placeholder="0.00"
            disabled={submitting}
          />
          <p className="field-hint">
            Optional, non-negative. Limits how much credit the Credit module may extend to this customer.
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="customerOpeningBalance">Opening Balance</label>
          <input
            id="customerOpeningBalance"
            name="openingBalance"
            type="number"
            min="0"
            step="0.01"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            placeholder="0.00"
            disabled={submitting}
          />
          <p className="field-hint">
            Optional. Amount already owed to the shop before using the POS. This sits in the existing customer credit balance.
          </p>
        </div>

        {editing && initial ? (
          <div className="pick-box">
            <div className="pick-box-main">Current Balance</div>
            <div className="pick-box-sub">
              {formatMoney(initial.current_balance)} — read-only. Managed by the Credit module, not by customer
              details.
            </div>
          </div>
        ) : null}

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
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerDetailModal({ customer, onClose }) {
  return (
    <Modal title="Customer Details" onClose={onClose}>
      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-item">
          <span className="summary-label">Name</span>
          <span className="summary-value">{customer.name}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Phone</span>
          <span className="summary-value">{customer.phone || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Email</span>
          <span className="summary-value">{customer.email || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Status</span>
          <span className="summary-value">
            <StatusBadge status={customer.status} />
          </span>
        </div>
        <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
          <span className="summary-label">Address</span>
          <span className="summary-value">{customer.address || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Opening Balance</span>
          <span className="summary-value">
            <MoneyCell value={customer.opening_balance ?? 0} />
          </span>
          <p className="field-hint">Receivable / Customer Credit before POS</p>
        </div>
        <div className="summary-item">
          <span className="summary-label">Credit Limit</span>
          <span className="summary-value">
            <MoneyCell value={customer.credit_limit ?? 0} />
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Current Balance</span>
          <span className="summary-value">
            <MoneyCell value={customer.current_balance ?? 0} tone={Number(customer.current_balance) > 0 ? 'danger' : undefined} />
          </span>
          <p className="field-hint">Read-only. Owned by the Credit module.</p>
        </div>
        <div className="summary-item">
          <span className="summary-label">Created</span>
          <span className="summary-value">{formatDateTime(customer.created_at)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Last Updated</span>
          <span className="summary-value">{formatDateTime(customer.updated_at)}</span>
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

export default function CustomersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [formState, setFormState] = useState(null);
  const [detail, setDetail] = useState(null);

  const { showToast } = useToast();

  const list = useAsync(
    () =>
      customerService.list({
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
    await customerService.create(payload);
    setFormState(null);
    showNotice('Customer created successfully.');
    list.refetch();
  }

  async function handleUpdateSubmit(payload) {
    await customerService.update(formState.record.id, payload);
    setFormState(null);
    if (detail) setDetail(null);
    showNotice('Customer updated successfully.');
    list.refetch();
  }

  async function handleToggleStatus(record) {
    const next = record.status === 'active' ? 'inactive' : 'active';
    try {
      await customerService.setStatus(record.id, next);
      showNotice(`Customer "${record.name}" ${next === 'active' ? 'activated' : 'deactivated'}.`);
      list.refetch();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not change the customer status.');
    }
  }

  async function handleView(record) {
    try {
      const customer = await customerService.get(record.id);
      setDetail(customer);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not load the customer details.');
    }
  }

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const hasFilters = Boolean(search || status);

  return (
    <div className="customers-page">
      <div className="page-heading">
        <h1 className="page-title">Customers</h1>
        <p className="page-intro">
          Customer master data for credit sales, collections and invoices. Phone numbers are unique; the balance shown
          is owned by the Credit module and cannot be edited here.
        </p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, phone, email or address…"
            aria-label="Search customers"
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
              {CUSTOMER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-primary" onClick={() => setFormState({ mode: 'create' })}>
            New Customer
          </button>
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading customers…" /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title="Customers unavailable"
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No customers match your filters' : 'No customers yet'}
          description={
            hasFilters
              ? 'Try changing the search text or the status filter.'
              : 'Create the first customer using the "New Customer" button.'
          }
        />
      ) : null}

      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} customer{pagination?.total === 1 ? '' : 's'}
            </p>
            {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table customers-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Address</th>
                  <th className="num">Opening Balance</th>
                  <th className="num">Credit Limit</th>
                  <th className="num">Current Balance</th>
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
                    <td className="num">{formatMoney(record.opening_balance ?? 0)}</td>
                    <td className="num">{formatMoney(record.credit_limit ?? 0)}</td>
                    <td className="num">
                      <MoneyCell value={record.current_balance ?? 0} tone={Number(record.current_balance) > 0 ? 'danger' : undefined} />
                    </td>
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
        <CustomerFormModal
          initial={formState.mode === 'edit' ? formState.record : null}
          onClose={closeForm}
          onSubmit={formState.mode === 'edit' ? handleUpdateSubmit : handleCreateSubmit}
        />
      ) : null}

      {detail ? <CustomerDetailModal customer={detail} onClose={closeDetail} /> : null}
    </div>
  );
}