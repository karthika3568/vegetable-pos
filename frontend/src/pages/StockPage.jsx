import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { stockService, PRODUCT_STATUS_OPTIONS, TX_TYPE_LABELS } from '../services/stock.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { formatMoney, formatQuantity, formatDateOnly, formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;
const TX_LIMIT = 10;

function StatusBadge({ status }) {
  const tone = status === 'active' ? 'active' : 'inactive';
  const label = status === 'active' ? 'Active' : 'Inactive';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function LowStockBadge({ quantity, minimumStock }) {
  if (Number(minimumStock) > 0 && Number(quantity) <= Number(minimumStock)) {
    return <span className="badge badge-warning">Low stock</span>;
  }
  return null;
}

const TX_BADGE_TONES = {
  purchase: 'badge-completed',
  sale: 'badge-default',
  return_purchase: 'badge-returned',
  return_sale: 'badge-returned',
  adjustment: 'badge-warning',
  cancellation_reversal: 'badge-cancelled',
};

function TxTypeBadge({ type }) {
  const label = TX_TYPE_LABELS[type] || type || '—';
  return <span className={`badge ${TX_BADGE_TONES[type] || 'badge-default'}`}>{label}</span>;
}

function rounded3(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function StockAdjustModal({ record, onClose, onDone }) {
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const current = Number(record.quantity);
  const rawNumber = Number(delta);
  const deltaValid = delta.trim() !== '' && Number.isFinite(rawNumber) && rawNumber !== 0;
  const resulting = deltaValid ? rounded3(current + rawNumber) : null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!deltaValid) {
      setError('Delta must be a non-zero number (positive adds stock, negative reduces it).');
      return;
    }

    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError('Note is required (reason for the stock change).');
      return;
    }
    if (trimmedNote.length > 255) {
      setError('Note must be at most 255 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await stockService.adjust(record.product_id, { delta: rawNumber, note: trimmedNote });
      onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The stock adjustment could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Adjust Stock — ${record.product_name}`} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <div className="pick-box">
            <div className="pick-box-main">
              {record.product_name}
              {record.product_code ? <span className="cell-sub">{record.product_code}</span> : null}
            </div>
            <div className="pick-box-sub">
              Current stock: {formatQuantity(current)} {record.unit || ''} · Min: {formatQuantity(record.minimum_stock)}{' '}
              {record.unit || ''}
            </div>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="stockDelta">Quantity Delta</label>
          <input
            id="stockDelta"
            name="delta"
            type="number"
            step="0.001"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
            placeholder="e.g. 5 or -3.5"
            aria-describedby="deltaHint"
            disabled={submitting}
          />
          <p id="deltaHint" className="field-hint">
            A signed change applied by the backend against current stock. Positive adds, negative reduces. Zero is not
            allowed.
          </p>
        </div>

        {deltaValid ? (
          <div
            className={resulting < 0 ? 'form-alert' : 'refund-preview'}
            role={resulting < 0 ? 'alert' : 'status'}
            style={resulting < 0 ? undefined : { marginBottom: 16 }}
          >
            {resulting < 0
              ? `This adjustment would set stock to ${formatQuantity(resulting)} ${record.unit || ''}. Stock cannot go negative — the backend rejects it.`
              : `Resulting stock: ${formatQuantity(resulting)} ${record.unit || ''}`}
          </div>
        ) : null}

        <div className="form-field">
          <label htmlFor="stockNote">Note (reason)</label>
          <textarea
            id="stockNote"
            name="note"
            maxLength={255}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Damaged goods removed, opening stock count correction"
            disabled={submitting}
          />
          <p className="field-hint">Required. This reason is recorded on the immutable stock ledger.</p>
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
            {submitting ? 'Adjusting…' : 'Apply Adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StockDetailModal({ productId, refreshKey, canAdjust, onAdjust, onClose }) {
  const [txType, setTxType] = useState('');
  const [txPage, setTxPage] = useState(1);

  const stockInfo = useAsync(() => stockService.get(productId), [productId, refreshKey]);
  const movements = useAsync(
    () =>
      stockService.transactions(productId, {
        type: txType || undefined,
        page: txPage,
        limit: TX_LIMIT,
      }),
    [productId, txType, txPage, refreshKey]
  );

  const record = stockInfo.data;
  const txPagination = movements.data?.pagination ?? null;
  const txItems = movements.data?.items ?? [];

  function handleTypeFilter(event) {
    setTxType(event.target.value);
    setTxPage(1);
  }

  return (
    <Modal
      title={`Stock Details ${record ? `— ${record.product_name}` : ''}`}
      onClose={onClose}
      wide
    >
      {stockInfo.loading && !record ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner label="Loading stock details…" />
        </div>
      ) : null}

      {stockInfo.error && !record ? (
        <div className="form-alert" role="alert">
          {stockInfo.error.message || 'Could not load stock details.'}
        </div>
      ) : null}

      {record ? (
        <div className="stock-detail">
          <div className="summary-grid" style={{ marginBottom: 16 }}>
            <div className="summary-item">
              <span className="summary-label">Product</span>
              <span className="summary-value">
                {record.product_name}
                {record.product_code ? <span className="cell-sub">{record.product_code}</span> : null}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Unit</span>
              <span className="summary-value">{record.unit || '—'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Selling Price</span>
              <span className="summary-value">{formatMoney(record.selling_price)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Current Stock</span>
              <span className="summary-value">
                {formatQuantity(record.quantity)} {record.unit || ''}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Minimum Stock</span>
              <span className="summary-value">
                {formatQuantity(record.minimum_stock)} {record.unit || ''}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Status</span>
              <span className="summary-value">
                <StatusBadge status={record.status} />
                <LowStockBadge quantity={record.quantity} minimumStock={record.minimum_stock} />
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Last Updated</span>
              <span className="summary-value">{formatDateTime(record.stock_updated_at)}</span>
            </div>
          </div>

          {canAdjust ? (
            <div className="card-heading">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onAdjust(record)}
                disabled={record.status !== 'active'}
                title={record.status !== 'active' ? 'Only active products can be adjusted.' : undefined}
              >
                Adjust Stock
              </button>
            </div>
          ) : null}

          <div className="card-heading" style={{ marginTop: 18 }}>
            <h3 className="card-title">Stock Ledger</h3>
            <label className="toolbar-select">
              <span className="sr-only">Transaction type filter</span>
              <select value={txType} onChange={handleTypeFilter}>
                <option value="">All movements</option>
                {Object.entries(TX_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {movements.loading && !movements.data ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <Spinner label="Loading movements…" />
            </div>
          ) : null}

          {movements.error && !movements.data ? (
            <div className="form-alert" role="alert">
              {movements.error.message || 'Could not load stock movements.'}
            </div>
          ) : null}

          {movements.data && txItems.length === 0 ? (
            <p className="inline-empty">No stock movements recorded{txType ? ` for ${TX_TYPE_LABELS[txType]}` : ''}.</p>
          ) : null}

          {movements.data && txItems.length > 0 ? (
            <div className="table-scroll" style={{ marginTop: 8 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th className="num">Change</th>
                    <th className="num">Before → After</th>
                    <th>Note</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {txItems.map((tx) => {
                    const change = Number(tx.quantity_change);
                    return (
                      <tr key={tx.id}>
                        <td>{formatDateTime(tx.created_at)}</td>
                        <td>
                          <TxTypeBadge type={tx.transaction_type} />
                        </td>
                        <td className="num">
                          <span
                            className="money"
                            style={{
                              color: change > 0 ? 'var(--color-success)' : change < 0 ? 'var(--color-danger)' : 'var(--color-text)',
                              fontWeight: 600,
                            }}
                          >
                            {change > 0 ? '+' : ''}
                            {formatQuantity(change)}
                          </span>
                        </td>
                        <td className="num">
                          {formatQuantity(tx.quantity_before)} → {formatQuantity(tx.quantity_after)}
                        </td>
                        <td>
                          {tx.note ? (
                            <span className="cell-sub" style={{ color: 'var(--color-text)' }}>
                              {tx.note}
                            </span>
                          ) : (
                            <span className="cell-sub">—</span>
                          )}
                        </td>
                        <td>{tx.created_by_name || `#${tx.created_by ?? '—'}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <Pagination page={txPagination?.page ?? 1} totalPages={txPagination?.totalPages ?? 1} onChange={setTxPage} />
        </div>
      ) : null}
    </Modal>
  );
}

export default function StockPage() {
  const { hasPermission } = useAuth();
  const canAdjust = hasPermission('stock.adjust');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [productStatus, setProductStatus] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [adjusting, setAdjusting] = useState(null);

  const { showToast } = useToast();

  const list = useAsync(
    () =>
      stockService.list({
        search: search || undefined,
        productStatus: productStatus || undefined,
        page,
        limit: LIMIT,
      }),
    [search, productStatus, page]
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
    setProductStatus('');
    setPage(1);
  }

  function handleStatusFilter(event) {
    setProductStatus(event.target.value);
    setPage(1);
  }

  const openDetail = useCallback((id) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const closeAdjust = useCallback(() => setAdjusting(null), []);

  function handleAdjustDone(result) {
    setAdjusting(null);
    showNotice(
      `Stock adjusted for ${result?.product_name || 'product'}: ${formatQuantity(result?.movement?.before)} → ${formatQuantity(
        result?.movement?.after
      )} ${result?.unit || ''}.`
    );
    list.refetch();
    setDetailRefreshKey((key) => key + 1);
  }

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const hasFilters = Boolean(search || productStatus);

  return (
    <div className="stock-page">
      <div className="page-heading">
        <h1 className="page-title">Stock Levels</h1>
        <p className="page-intro">
          Current stock per product, sourced from the backend stock ledger. Adjust stock through an adjustment (a reason
          is mandatory and every change is recorded); never edit stock directly.
        </p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search product name or code…"
            aria-label="Search stock"
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
            <span className="sr-only">Product status filter</span>
            <select value={productStatus} onChange={handleStatusFilter}>
              {PRODUCT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading stock levels…" /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title="Stock levels unavailable"
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No products match your filters' : 'No products in the catalog'}
          description={
            hasFilters
              ? 'Try changing the search text or the status filter.'
              : 'Stock is tracked per product. Add products in the catalog to see their stock levels here.'
          }
        />
      ) : null}

      {list.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} product{pagination?.total === 1 ? '' : 's'}
            </p>
            {list.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table stock-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th className="num">Selling Price</th>
                  <th className="num">Current Stock</th>
                  <th className="num">Min Stock</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((record) => (
                  <tr key={record.product_id}>
                    <td>
                      <span className="cell-main">{record.product_name}</span>
                      {record.product_code ? <span className="cell-sub">{record.product_code}</span> : null}
                    </td>
                    <td>{record.unit || '—'}</td>
                    <td className="num">{formatMoney(record.selling_price)}</td>
                    <td className="num">
                      <span className="cell-main">
                        {formatQuantity(record.quantity)} {record.unit || ''}
                      </span>
                      <LowStockBadge quantity={record.quantity} minimumStock={record.minimum_stock} />
                    </td>
                    <td className="num">{formatQuantity(record.minimum_stock)}</td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td>{formatDateOnly(record.stock_updated_at)}</td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => openDetail(record.product_id)} />
                        {canAdjust ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setAdjusting(record)}
                            disabled={record.status !== 'active'}
                            title={record.status !== 'active' ? 'Only active products can be adjusted.' : undefined}
                          >
                            Adjust
                          </button>
                        ) : null}
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

      {detailId ? (
        <StockDetailModal
          productId={detailId}
          refreshKey={detailRefreshKey}
          canAdjust={canAdjust}
          onAdjust={setAdjusting}
          onClose={closeDetail}
        />
      ) : null}

      {adjusting ? (
        <StockAdjustModal record={adjusting} onClose={closeAdjust} onDone={handleAdjustDone} />
      ) : null}
    </div>
  );
}