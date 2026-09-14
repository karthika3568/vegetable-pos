import { useState, useCallback } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { purchaseService } from '../services/purchase.service.js';
import PurchaseFormModal from '../components/PurchaseFormModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import ActionButton from '../components/ActionButton.jsx';
import { formatMoney, formatQuantity, formatDateOnly } from '../utils/format.js';
import { imageUrl } from '../utils/imageUrl.js';

const LIMIT = 20;

const STATUS_LABELS = {
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PAYMENT_STATUS_LABELS = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
};

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status || '—';
  const cls = `badge badge-${status || 'default'}`;
  return <span className={cls}>{label}</span>;
}

function PaymentStatusBadge({ status }) {
  const label = PAYMENT_STATUS_LABELS[status] || status || '—';
  const tone =
    status === 'paid'
      ? 'completed'
      : status === 'partial'
        ? 'warning'
        : 'default';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function balanceDue(purchase) {
  return Math.max(Number(purchase.total_amount) - Number(purchase.paid_amount), 0);
}

export default function PurchasesPage() {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);

  const purchasesList = useAsync(
    () =>
      purchaseService.listPurchases({
        search: search || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: LIMIT,
      }),
    [search, status, fromDate, toDate, page]
  );

  const purchaseDetail = useAsync(
    () => (detailId ? purchaseService.getPurchase(detailId) : Promise.resolve(null)),
    [detailId]
  );

  const pagination = purchasesList.data?.pagination ?? null;
  const items = purchasesList.data?.items ?? [];

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleReset() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  function handleStatusFilter(event) {
    setStatus(event.target.value);
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

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(
    () => {
      setDetailId(null);
      purchaseDetail.refetch();
    },
    [purchaseDetail]
  );

  const hasFilters = Boolean(search || status || fromDate || toDate);
  const detail = purchaseDetail.data;

  return (
    <div className="purchases-page">
      <div className="page-heading">
        <h1 className="page-title">Purchases</h1>
        <p className="page-intro">View and search supplier purchases.</p>
        {hasPermission('purchases.create') ? (
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            Add New Purchase
          </button>
        ) : null}
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search supplier or invoice number…"
            aria-label="Search purchases"
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
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={handleFromDateFilter}
              aria-label="From date"
            />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">To date</span>
            <input
              type="date"
              value={toDate}
              onChange={handleToDateFilter}
              aria-label="To date"
            />
          </label>
        </div>
      </div>

      {purchasesList.loading && !purchasesList.data ? (
        <PageLoader label="Loading purchases…" />
      ) : null}

      {purchasesList.error && !purchasesList.data ? (
        <ErrorState
          title="Purchases unavailable"
          message={purchasesList.error.message}
          status={purchasesList.error.status}
          onRetry={() => purchasesList.refetch()}
        />
      ) : null}

      {purchasesList.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No purchases match your filters' : 'No purchases found'}
          description={
            hasFilters
              ? 'Try changing the search or clearing the filters.'
              : 'Purchases recorded against suppliers will appear here.'
          }
        />
      ) : null}

      {purchasesList.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} purchase{pagination?.total === 1 ? '' : 's'}
            </p>
            {purchasesList.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table purchases-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Balance</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="cell-main cell-code">{purchase.invoice_number}</td>
                    <td>{formatDateOnly(purchase.purchase_date)}</td>
                    <td>{purchase.supplier_name || '—'}</td>
                    <td className="num">{formatMoney(purchase.total_amount)}</td>
                    <td className="num">{formatMoney(purchase.paid_amount)}</td>
                    <td className="num">
                      {balanceDue(purchase) > 0 ? (
                        <span className="money" style={{ color: 'var(--color-danger)' }}>
                          {formatMoney(balanceDue(purchase))}
                        </span>
                      ) : (
                        formatMoney(0)
                      )}
                    </td>
                    <td>
                      <PaymentStatusBadge status={purchase.payment_status} />
                    </td>
                    <td>
                      <StatusBadge status={purchase.status} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => openDetail(purchase.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination?.page ?? 1}
            totalPages={pagination?.totalPages ?? 1}
            onChange={setPage}
          />
        </div>
      ) : null}

      {detailId ? (
        <Modal title="Purchase Details" onClose={closeDetail}>
          {purchaseDetail.loading && !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Spinner label="Loading purchase details…" />
            </div>
          ) : null}

          {purchaseDetail.error && !detail ? (
            <div className="form-alert" role="alert">
              {purchaseDetail.error.message || 'Could not load purchase details.'}
            </div>
          ) : null}

          {detail ? (
            <div className="purchase-detail">
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div className="summary-item">
                  <span className="summary-label">Invoice</span>
                  <span className="summary-value">{detail.invoice_number}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Date</span>
                  <span className="summary-value">{formatDateOnly(detail.purchase_date)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Supplier</span>
                  <span className="summary-value">{detail.supplier_name || '—'}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Status</span>
                  <span className="summary-value">
                    <StatusBadge status={detail.status} />
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Payment</span>
                  <span className="summary-value">
                    <PaymentStatusBadge status={detail.payment_status} />
                  </span>
                </div>
                {detail.created_by_name ? (
                  <div className="summary-item">
                    <span className="summary-label">Recorded by</span>
                    <span className="summary-value">{detail.created_by_name}</span>
                  </div>
                ) : null}
              </div>

              {detail.items && detail.items.length > 0 ? (
                <div className="detail-card">
                  <div className="card-heading">
                    <h3 className="card-title">Items</h3>
                    <span className="card-caption">
                      {detail.items.length} item{detail.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="num">Qty</th>
                          <th className="num">Price</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className="cell-main">{item.product_name}</span>
                              {item.product_code ? (
                                <span className="cell-sub">{item.product_code}</span>
                              ) : null}
                            </td>
                            <td className="num">{formatQuantity(item.quantity)}</td>
                            <td className="num">{formatMoney(item.purchase_price)}</td>
                            <td className="num">{formatMoney(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="detail-card">
                <h3 className="card-title">Totals</h3>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Total</span>
                    <span className="summary-value" style={{ fontWeight: 700 }}>
                      {formatMoney(detail.total_amount)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Paid</span>
                    <span className="summary-value" style={{ color: 'var(--color-success)' }}>
                      {formatMoney(detail.paid_amount)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Balance Due</span>
                    <span
                      className="summary-value"
                      style={{
                        color: balanceDue(detail) > 0 ? 'var(--color-danger)' : undefined,
                        fontWeight: 700,
                      }}
                    >
                      {formatMoney(balanceDue(detail))}
                    </span>
                  </div>
                </div>
              </div>

              {detail.notes ? (
                <div className="detail-card">
                  <h3 className="card-title">Notes</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                    {detail.notes}
                  </p>
                </div>
              ) : null}

              <div className="detail-card supplier-invoice-detail-card">
                <h3 className="card-title">Supplier Invoice</h3>
                {detail.invoice_image_path ? (
                  <div className="invoice-detail-content">
                    <div
                      className="invoice-detail-thumbnail-wrap"
                      onClick={() => setViewingInvoice(imageUrl(detail.invoice_image_path))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setViewingInvoice(imageUrl(detail.invoice_image_path));
                        }
                      }}
                      aria-label="View full supplier invoice"
                    >
                      <img
                        src={imageUrl(detail.invoice_image_path)}
                        alt={`Invoice ${detail.invoice_number}`}
                        className="invoice-detail-thumbnail"
                      />
                    </div>
                    <div className="invoice-detail-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setViewingInvoice(imageUrl(detail.invoice_image_path))}
                      >
                        View Invoice
                      </button>
                      <a
                        href={imageUrl(detail.invoice_image_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline btn-sm"
                        download
                      >
                        Open / Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="invoice-none-text">No invoice image uploaded.</p>
                )}
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {viewingInvoice ? (
        <Modal title="Supplier Invoice" onClose={() => setViewingInvoice(null)} wide>
          <div className="invoice-viewer-modal-content">
            <div className="invoice-viewer-image-wrap">
              <img src={viewingInvoice} alt="Supplier Invoice" className="invoice-viewer-full-img" />
            </div>
            <div className="invoice-viewer-footer">
              <a
                href={viewingInvoice}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                download
              >
                Open in New Tab / Download
              </a>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setViewingInvoice(null)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {createOpen ? (
        <PurchaseFormModal
          onClose={() => setCreateOpen(false)}
          onCreated={(purchase) => {
            setCreateOpen(false);
            purchasesList.refetch();
            showToast(`Purchase ${purchase?.invoice_number || ''} created successfully.`, 'success');
          }}
        />
      ) : null}
    </div>
  );
}