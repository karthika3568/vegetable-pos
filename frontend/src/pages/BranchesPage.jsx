import { useCallback, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { branchService, BRANCH_STATUS_OPTIONS } from '../services/branch.service.js';
import { productService } from '../services/product.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const PRODUCT_LIMIT = 500;

function StatusBadge({ status }) {
  const tone = status === 'active' ? 'active' : 'inactive';
  const label = status === 'active' ? 'Active' : 'Inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function BranchFormModal({ initial, onClose, onSubmit }) {
  const editing = Boolean(initial);

  const [name, setName] = useState(initial ? (initial.name ?? '') : '');
  const [address, setAddress] = useState(initial ? (initial.address ?? '') : '');
  const [phone, setPhone] = useState(initial ? (initial.phone ?? '') : '');
  const [gstin, setGstin] = useState(initial ? (initial.gstin ?? '') : '');
  const [invoiceHeader, setInvoiceHeader] = useState(initial ? (initial.invoiceHeader ?? '') : '');
  const [invoiceFooter, setInvoiceFooter] = useState(initial ? (initial.invoiceFooter ?? '') : '');
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

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        address: address.trim() || null,
        phone: phone.trim() || null,
        gstin: gstin.trim() || null,
        invoiceHeader: invoiceHeader.trim() || null,
        invoiceFooter: invoiceFooter.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Branch' : 'New Branch'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="branchName">Name</label>
          <input
            id="branchName"
            name="name"
            type="text"
            maxLength={150}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Market Yard Branch"
            disabled={submitting}
          />
          <p className="field-hint">Required. Shown in the branch switcher and on invoices.</p>
        </div>

        <div className="form-field">
          <label htmlFor="branchAddress">Address</label>
          <input
            id="branchAddress"
            name="address"
            type="text"
            maxLength={255}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="e.g. 12 Market Road"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="branchPhone">Phone</label>
          <input
            id="branchPhone"
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
          <label htmlFor="branchGstin">GSTIN</label>
          <input
            id="branchGstin"
            name="gstin"
            type="text"
            maxLength={20}
            value={gstin}
            onChange={(event) => setGstin(event.target.value)}
            placeholder="e.g. 27ABCDE1234F1Z5"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="branchInvoiceHeader">Invoice Header</label>
          <input
            id="branchInvoiceHeader"
            name="invoiceHeader"
            type="text"
            maxLength={255}
            value={invoiceHeader}
            onChange={(event) => setInvoiceHeader(event.target.value)}
            placeholder="Text printed above the invoice items"
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="branchInvoiceFooter">Invoice Footer</label>
          <input
            id="branchInvoiceFooter"
            name="invoiceFooter"
            type="text"
            maxLength={255}
            value={invoiceFooter}
            onChange={(event) => setInvoiceFooter(event.target.value)}
            placeholder="Text printed at the bottom of the invoice"
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
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Branch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BranchProductsModal({ branch, onClose }) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const products = useAsync(() => productService.list({ limit: PRODUCT_LIMIT }), []);
  const availability = useAsync(() => branchService.getProducts(branch.id), [branch.id]);

  const loading = products.loading || availability.loading;
  const items = products.data?.items ?? [];

  // Availability payload can come back either as a plain id array or as
  // objects carrying an `available`/`is_available` flag - normalize once.
  const availableIds = useMemo(() => {
    if (selectedIds) return selectedIds;
    const raw = availability.data;
    if (!Array.isArray(raw)) return new Set();
    if (raw.length === 0) return new Set();
    if (typeof raw[0] === 'object' && raw[0] !== null) {
      return new Set(
        raw
          .filter((row) => row.available ?? row.is_available ?? true)
          .map((row) => Number(row.productId ?? row.product_id ?? row.id))
      );
    }
    return new Set(raw.map(Number));
  }, [availability.data, selectedIds]);

  function toggle(productId) {
    const next = new Set(availableIds);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    setSelectedIds(next);
  }

  const filteredItems = search.trim()
    ? items.filter((product) => product.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  async function handleSave() {
    setError('');
    setSubmitting(true);
    try {
      await branchService.setProducts(branch.id, Array.from(availableIds));
      showToast(`Product availability updated for "${branch.name}".`, 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product availability.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Manage Products - ${branch.name}`} onClose={onClose} wide>
      {loading ? <PageLoader label="Loading products…" /> : null}

      {!loading && products.error ? (
        <ErrorState title="Products unavailable" message={products.error.message} onRetry={() => products.refetch()} />
      ) : null}

      {!loading && availability.error ? (
        <ErrorState
          title="Branch availability unavailable"
          message={availability.error.message}
          onRetry={() => availability.refetch()}
        />
      ) : null}

      {!loading && !products.error && !availability.error ? (
        <>
          <div className="form-field">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
            />
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState title="No products match your search" />
          ) : (
            <div className="checkbox-list">
              {filteredItems.map((product) => (
                <label key={product.id} className="checkbox-list-item">
                  <input
                    type="checkbox"
                    checked={availableIds.has(product.id)}
                    onChange={() => toggle(product.id)}
                    disabled={submitting}
                  />
                  <span>{product.name}</span>
                </label>
              ))}
            </div>
          )}

          {error ? (
            <div className="form-alert" role="alert">
              {error}
            </div>
          ) : null}

          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Availability'}
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function BranchDetailModal({ branch, onClose }) {
  return (
    <Modal title="Branch Details" onClose={onClose}>
      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-item">
          <span className="summary-label">Name</span>
          <span className="summary-value">{branch.name}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Phone</span>
          <span className="summary-value">{branch.phone || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">GSTIN</span>
          <span className="summary-value">{branch.gstin || '—'}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Status</span>
          <span className="summary-value">
            <StatusBadge status={branch.status} />
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Created</span>
          <span className="summary-value">{formatDateTime(branch.createdAt)}</span>
        </div>
        <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
          <span className="summary-label">Address</span>
          <span className="summary-value">{branch.address || '—'}</span>
        </div>
        <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
          <span className="summary-label">Invoice Header</span>
          <span className="summary-value">{branch.invoiceHeader || '—'}</span>
        </div>
        <div className="summary-item" style={{ gridColumn: '1 / -1' }}>
          <span className="summary-label">Invoice Footer</span>
          <span className="summary-value">{branch.invoiceFooter || '—'}</span>
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

export default function BranchesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [formState, setFormState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [managingProducts, setManagingProducts] = useState(null);

  const { showToast } = useToast();

  const list = useAsync(() => branchService.list(), []);

  function showNotice(message) {
    showToast(message, 'success');
  }

  const closeForm = useCallback(() => setFormState(null), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const closeProductsModal = useCallback(() => {
    setManagingProducts(null);
    list.refetch();
  }, [list]);

  async function handleCreateSubmit(payload) {
    await branchService.create(payload);
    setFormState(null);
    showNotice('Branch created successfully.');
    list.refetch();
  }

  async function handleUpdateSubmit(payload) {
    await branchService.update(formState.record.id, payload);
    setFormState(null);
    showNotice('Branch updated successfully.');
    list.refetch();
  }

  async function handleToggleStatus(record) {
    const next = record.status === 'active' ? 'inactive' : 'active';
    try {
      await branchService.setStatus(record.id, next);
      showNotice(`Branch "${record.name}" ${next === 'active' ? 'activated' : 'deactivated'}.`);
      list.refetch();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not change the branch status.');
    }
  }

  const allItems = list.data ?? [];
  const items = allItems.filter((branch) => {
    if (status && branch.status !== status) return false;
    if (search) {
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return (
        branch.name.toLowerCase().includes(needle) ||
        (branch.address || '').toLowerCase().includes(needle) ||
        (branch.phone || '').toLowerCase().includes(needle)
      );
    }
    return true;
  });
  const hasFilters = Boolean(search || status);

  return (
    <div className="branches-page">
      <div className="page-heading">
        <h1 className="page-title">Branches</h1>
        <p className="page-intro">
          Manage the shop's branches, their invoice details, and which products are available at each one.
        </p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={(event) => event.preventDefault()} role="search">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, address or phone…"
            aria-label="Search branches"
          />
        </form>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">Status filter</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {BRANCH_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-primary" onClick={() => setFormState({ mode: 'create' })}>
            New Branch
          </button>
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading branches…" /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title="Branches unavailable"
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No branches match your filters' : 'No branches yet'}
          description={
            hasFilters
              ? 'Try changing the search text or the status filter.'
              : 'Create the first branch using the "New Branch" button.'
          }
        />
      ) : null}

      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {items.length} branch{items.length === 1 ? '' : 'es'}
            </p>
            {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table branches-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Address</th>
                  <th>Phone</th>
                  <th>GSTIN</th>
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
                    <td>{record.address || '—'}</td>
                    <td>{record.phone || '—'}</td>
                    <td>{record.gstin || '—'}</td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td>{formatDateTime(record.createdAt)}</td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => setDetail(record)} />
                        <ActionButton action="edit" onClick={() => setFormState({ mode: 'edit', record })} />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setManagingProducts(record)}
                          title="Manage Products"
                        >
                          Manage Products
                        </button>
                        <ActionButton
                          action={record.status === 'active' ? 'deactivate' : 'activate'}
                          onClick={() => handleToggleStatus(record)}
                        >
                          {record.status === 'active' ? 'Deactivate' : 'Activate'}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {formState ? (
        <BranchFormModal
          initial={formState.mode === 'edit' ? formState.record : null}
          onClose={closeForm}
          onSubmit={formState.mode === 'edit' ? handleUpdateSubmit : handleCreateSubmit}
        />
      ) : null}

      {detail ? <BranchDetailModal branch={detail} onClose={closeDetail} /> : null}

      {managingProducts ? <BranchProductsModal branch={managingProducts} onClose={closeProductsModal} /> : null}
    </div>
  );
}
