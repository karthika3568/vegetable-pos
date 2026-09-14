import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { returnService, getReturnableByItem, RETURN_STATUS_LABELS } from '../services/return.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { formatMoney, formatQuantity, formatDateOnly, formatDateTime } from '../utils/format.js';

const LIMIT = 20;

const PAYMENT_TYPE_LABELS = {
  cash: 'Cash',
  credit: 'Credit',
  partial: 'Partial',
};

function StatusBadge({ status }) {
  const label = RETURN_STATUS_LABELS[status] || status || '—';
  return <span className={`badge badge-${status || 'default'}`}>{label}</span>;
}

function PaymentTypeBadge({ type }) {
  const label = PAYMENT_TYPE_LABELS[type] || type || '—';
  return <span className="badge badge-default">{label}</span>;
}

function SalePicker({ loading, error, data, selected, onSelect, disabled, emptyNote }) {
  const sales = data?.items ?? [];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
        <Spinner label="Loading sales…" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="form-alert" role="alert">
        Could not load sales ({error.message || 'request failed'}).
      </div>
    );
  }

  if (sales.length === 0) {
    return <p className="field-hint">{emptyNote || 'No sales available.'}</p>;
  }

  return (
    <div className="form-field">
      <label htmlFor="salePicker">Completed Sale</label>
      <select id="salePicker" value={selected} onChange={(event) => onSelect(event.target.value)} disabled={disabled}>
        <option value="">Select a sale…</option>
        {sales.map((sale) => (
          <option key={sale.id} value={sale.id}>
            {sale.invoice_number} — {sale.customer_name || 'Walk-in Customer'} — {formatMoney(sale.total_amount)}
          </option>
        ))}
      </select>
      <p className="field-hint">Only completed sales are eligible. {sales.length} completed sale(s) loaded.</p>
    </div>
  );
}

function ReturnSaleModal({ initialSaleId, onClose, onDone }) {
  const [selected, setSelected] = useState(initialSaleId ? String(initialSaleId) : '');
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const completedSales = useAsync(
    () => returnService.listSales({ status: 'completed', page: 1, limit: 100 }),
    []
  );

  const saleDetail = useAsync(
    () => (selected ? returnService.getSale(selected) : Promise.resolve(null)),
    [selected]
  );

  const detail = saleDetail.data;
  const detailMatches = detail && String(detail.id) === String(selected);
  const items = detailMatches ? detail.items : [];
  const returnable = detailMatches ? getReturnableByItem(detail) : new Map();

  useEffect(() => {
    setQuantities({});
    setError('');
  }, [selected]);

  function handleQtyChange(itemId, raw) {
    const max = Math.max(0, returnable.get(Number(itemId)) ?? 0);
    if (raw !== '' && !Number.isFinite(Number(raw))) return;
    if (raw !== '' && Number(raw) < 0) return;
    const value = raw === '' ? '' : String(Math.min(Number(raw), max));
    setQuantities((prev) => ({ ...prev, [String(itemId)]: value }));
  }

  const selectedLines = items
    .map((item) => {
      const qty = Number(quantities[String(item.id)] ?? 0);
      return {
        item,
        qty,
        lineRefund: qty * Number(item.unit_price),
      };
    })
    .filter((line) => line.qty > 0);

  const estimatedRefund =
    Math.round(selectedLines.reduce((sum, line) => sum + line.lineRefund, 0) * 100) / 100;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (selectedLines.length === 0) {
      setError('Select at least one item and enter a quantity greater than zero.');
      return;
    }

    const byProduct = new Map();
    for (const line of selectedLines) {
      const productId = Number(line.item.product_id);
      byProduct.set(productId, (byProduct.get(productId) ?? 0) + line.qty);
    }

    const body = {
      items: Array.from(byProduct, ([productId, quantity]) => ({ productId, quantity })),
      reason: reason.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const result = await returnService.returnGoods(Number(selected), body);
      onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the return.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Record a Return" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {!selected ? (
          <SalePicker
            loading={completedSales.loading}
            error={completedSales.error}
            data={completedSales.data}
            selected={selected}
            onSelect={setSelected}
            disabled={submitting}
            emptyNote="No completed sales to return."
          />
        ) : null}

        {selected ? (
          <div className="form-field">
            <div className="pick-box">
              <div className="pick-box-main">{detail?.invoice_number || 'Loading…'}</div>
              <div className="pick-box-sub">
                {detail?.customer_name || 'Walk-in Customer'} · {detail ? formatDateOnly(detail.sale_date) : ''}
              </div>
              <div className="pick-box-sub">
                Total {detail ? formatMoney(detail.total_amount) : ''} · Paid {detail ? formatMoney(detail.paid_amount) : ''}
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected('')} disabled={submitting}>
              Choose a different sale
            </button>
          </div>
        ) : null}

        {selected && saleDetail.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <Spinner label="Loading sale items…" />
          </div>
        ) : null}

        {selected && saleDetail.error && !detail ? (
          <div className="form-alert" role="alert">
            {saleDetail.error.message || 'Could not load the sale.'}
          </div>
        ) : null}

        {selected && !saleDetail.loading && detailMatches ? (
          <>
            {items.length > 0 ? (
              <div className="form-field">
                <label>Items to Return</label>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num">Sold</th>
                        <th className="num">Returned</th>
                        <th className="num">Returnable</th>
                        <th className="num">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const max = Math.max(0, returnable.get(Number(item.id)) ?? 0);
                        const already = Math.max(0, Number(item.quantity) - max);
                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="cell-main">{item.product_name}</span>
                              {item.product_code ? <span className="cell-sub">{item.product_code}</span> : null}
                            </td>
                            <td className="num">
                              {formatQuantity(item.quantity)} {item.unit}
                            </td>
                            <td className="num">{already > 0 ? formatQuantity(already) : '—'}</td>
                            <td className="num">{formatQuantity(max)}</td>
                            <td className="num">
                              {max > 0 ? (
                                <input
                                  type="number"
                                  className="qty-control"
                                  min="0"
                                  max={max}
                                  step="0.001"
                                  value={quantities[String(item.id)] ?? ''}
                                  onChange={(event) => handleQtyChange(item.id, event.target.value)}
                                  placeholder="0"
                                  disabled={submitting}
                                  aria-label={`Return quantity for ${item.product_name}`}
                                />
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="field-hint">Quantity cannot exceed the returnable amount. The backend enforces the final limit.</p>
              </div>
            ) : null}

            <div className="form-field">
              <label htmlFor="returnReason">Reason (optional)</label>
              <textarea
                id="returnReason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={255}
                rows={2}
                placeholder="Optional note attached to the return"
                disabled={submitting}
              />
            </div>

            {selectedLines.length > 0 ? (
              <div className="refund-preview">
                <span>Estimated refund</span>
                <strong>{formatMoney(estimatedRefund)}</strong>
              </div>
            ) : null}
          </>
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
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !selected || !detailMatches || selectedLines.length === 0}
          >
            {submitting ? 'Recording…' : 'Record Return'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelSaleModal({ initialSaleId, onClose, onDone }) {
  const [selected, setSelected] = useState(initialSaleId ? String(initialSaleId) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const completedSales = useAsync(
    () => returnService.listSales({ status: 'completed', page: 1, limit: 100 }),
    []
  );

  const saleDetail = useAsync(
    () => (selected ? returnService.getSale(selected) : Promise.resolve(null)),
    [selected]
  );

  const detail = saleDetail.data;
  const detailMatches = detail && String(detail.id) === String(selected);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await returnService.cancelSale(Number(selected));
      onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the sale.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Cancel a Sale" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Cancelling voids the sale entirely: the remaining stock is restored, any created credit is reversed, and
          the sale is marked cancelled (it stays in history).
        </p>

        {!selected ? (
          <SalePicker
            loading={completedSales.loading}
            error={completedSales.error}
            data={completedSales.data}
            selected={selected}
            onSelect={setSelected}
            disabled={submitting}
            emptyNote="No completed sales to cancel."
          />
        ) : null}

        {selected ? (
          <div className="form-field">
            <div className="pick-box">
              <div className="pick-box-main">{detail?.invoice_number || 'Loading…'}</div>
              <div className="pick-box-sub">{detail?.customer_name || 'Walk-in Customer'}</div>
              <div className="pick-box-sub">
                {detail ? `${formatDateOnly(detail.sale_date)} · Total ${formatMoney(detail.total_amount)}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected('')} disabled={submitting}>
              Choose a different sale
            </button>
          </div>
        ) : null}

        {selected && saleDetail.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <Spinner label="Loading sale…" />
          </div>
        ) : null}

        {selected && saleDetail.error && !detail ? (
          <div className="form-alert" role="alert">
            {saleDetail.error.message || 'Could not load the sale.'}
          </div>
        ) : null}

        {selected && !saleDetail.loading && detailMatches ? (
          <div className="form-alert" role="alert" style={{ borderColor: 'var(--color-danger)' }}>
            This will permanently cancel invoice {detail.invoice_number}. This action cannot be undone.
          </div>
        ) : null}

        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Keep Sale
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={submitting || !selected || !detailMatches}
          >
            {submitting ? 'Cancelling…' : 'Confirm Cancellation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ReturnsPage() {
  const { hasPermission } = useAuth();
  const canAct = hasPermission('sales.cancel');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('returned');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);
  const [action, setAction] = useState(null);

  const { showToast } = useToast();

  const returnsList = useAsync(
    () =>
      returnService.listSales({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: status || undefined,
        page,
        limit: LIMIT,
      }),
    [search, status, fromDate, toDate, page]
  );

  const returnDetail = useAsync(
    () => (detailId ? returnService.getSale(detailId) : Promise.resolve(null)),
    [detailId]
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
    setStatus('returned');
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
  const closeDetail = useCallback(() => setDetailId(null), []);

  function handleReturnDone(result) {
    setAction(null);
    showNotice(`Return recorded with refund ${formatMoney(result?.refundAmount)}.`);
    returnsList.refetch();
  }

  function handleCancelDone() {
    setAction(null);
    showNotice('Sale cancelled successfully.');
    returnsList.refetch();
  }

  const pagination = returnsList.data?.pagination ?? null;
  const items = returnsList.data?.items ?? [];
  const detail = returnDetail.data;
  const hasFilters = Boolean(search || status !== 'returned' || fromDate || toDate);

  return (
    <div className="returns-page">
      <div className="page-heading">
        <h1 className="page-title">Sales Returns</h1>
        <p className="page-intro">Return goods from completed sales and cancel sales that must be voided.</p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search invoice, customer or phone…"
            aria-label="Search returns"
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
              <option value="returned">Returned sales</option>
              <option value="">All sales</option>
              <option value="completed">Completed only</option>
              <option value="cancelled">Cancelled only</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">From date</span>
            <input type="date" value={fromDate} onChange={handleFromDateFilter} aria-label="From date" />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">To date</span>
            <input type="date" value={toDate} onChange={handleToDateFilter} aria-label="To date" />
          </label>

          {canAct ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setAction({ type: 'return' })}>
                New Return
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setAction({ type: 'cancel' })}>
                Cancel Sale
              </button>
            </>
          ) : null}
        </div>
      </div>

      {returnsList.loading && !returnsList.data ? <PageLoader label="Loading returns…" /> : null}

      {returnsList.error && !returnsList.data ? (
        <ErrorState
          title="Returns unavailable"
          message={returnsList.error.message}
          status={returnsList.error.status}
          onRetry={() => returnsList.refetch()}
        />
      ) : null}

      {returnsList.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No sales match your filters' : 'No returns yet'}
          description={
            hasFilters
              ? 'Try changing the search, dates or clearing the filters.'
              : 'Sales that have been fully returned will appear here. Use "New Return" to return goods from a completed sale.'
          }
        />
      ) : null}

      {returnsList.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} sale{pagination?.total === 1 ? '' : 's'}
            </p>
            {returnsList.loading ? <span className="table-refreshing">Refreshing…</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table returns-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Balance</th>
                  <th>Payment</th>
                  <th>Return Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((sale) => (
                  <tr key={sale.id}>
                    <td className="cell-main cell-code">{sale.invoice_number}</td>
                    <td>{formatDateOnly(sale.sale_date)}</td>
                    <td>
                      {sale.customer_name ? (
                        <span>
                          {sale.customer_name}
                          {sale.customer_phone ? <span className="cell-sub">{sale.customer_phone}</span> : null}
                        </span>
                      ) : (
                        <span className="cell-sub">Walk-in Customer</span>
                      )}
                    </td>
                    <td className="num">{formatMoney(sale.total_amount)}</td>
                    <td className="num">{formatMoney(sale.paid_amount)}</td>
                    <td className="num">
                      {Number(sale.balance_due) > 0 ? (
                        <span className="money" style={{ color: 'var(--color-danger)' }}>
                          {formatMoney(sale.balance_due)}
                        </span>
                      ) : (
                        formatMoney(0)
                      )}
                    </td>
                    <td>
                      <PaymentTypeBadge type={sale.payment_type} />
                    </td>
                    <td>
                      <StatusBadge status={sale.status} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openDetail(sale.id)}
                        >
                          View
                        </button>
                        {canAct && sale.status === 'completed' ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setAction({ type: 'return', saleId: sale.id })}
                            >
                              Return
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setAction({ type: 'cancel', saleId: sale.id })}
                            >
                              Cancel
                            </button>
                          </>
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
        <Modal title={`Return Details ${detail ? `— ${detail.invoice_number}` : ''}`} onClose={closeDetail} wide>
          {returnDetail.loading && !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Spinner label="Loading return details…" />
            </div>
          ) : null}

          {returnDetail.error && !detail ? (
            <div className="form-alert" role="alert">
              {returnDetail.error.message || 'Could not load details.'}
            </div>
          ) : null}

          {detail ? (
            <div className="return-detail">
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div className="summary-item">
                  <span className="summary-label">Invoice</span>
                  <span className="summary-value">{detail.invoice_number}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Sale Date</span>
                  <span className="summary-value">{formatDateTime(detail.sale_date)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Customer</span>
                  <span className="summary-value">{detail.customer_name || 'Walk-in Customer'}</span>
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
                    <PaymentTypeBadge type={detail.payment_type} />
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Total</span>
                  <span className="summary-value">{formatMoney(detail.total_amount)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Paid</span>
                  <span className="summary-value">{formatMoney(detail.paid_amount)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Balance Due</span>
                  <span
                    className="summary-value"
                    style={{ color: Number(detail.balance_due) > 0 ? 'var(--color-danger)' : undefined, fontWeight: 700 }}
                  >
                    {formatMoney(detail.balance_due)}
                  </span>
                </div>
              </div>

              {detail.returns && detail.returns.length > 0 ? (
                detail.returns.map((ret) => (
                  <div className="detail-card" key={ret.id} style={{ marginBottom: 14 }}>
                    <div className="card-heading">
                      <h3 className="card-title">Return #{ret.id}</h3>
                      <span className="card-caption">
                        {formatDateTime(ret.return_date)} · Refund {formatMoney(ret.refund_amount)}
                      </span>
                    </div>
                    {ret.reason ? <p className="cell-sub" style={{ marginTop: 0 }}>Reason: {ret.reason}</p> : null}
                    {ret.created_by_name ? (
                      <p className="cell-sub" style={{ marginTop: 0 }}>Processed by {ret.created_by_name}</p>
                    ) : null}
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th className="num">Qty</th>
                            <th className="num">Unit Price</th>
                            <th className="num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ret.items.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <span className="cell-main">{item.product_name}</span>
                                {item.product_code ? <span className="cell-sub">{item.product_code}</span> : null}
                              </td>
                              <td className="num">
                                {formatQuantity(item.quantity)} {item.unit}
                              </td>
                              <td className="num">{formatMoney(item.unit_price)}</td>
                              <td className="num">{formatMoney(item.line_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <p className="inline-empty">No returns recorded for this sale.</p>
              )}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {action?.type === 'return' ? (
        <ReturnSaleModal
          initialSaleId={action.saleId}
          onClose={() => setAction(null)}
          onDone={handleReturnDone}
        />
      ) : null}

      {action?.type === 'cancel' ? (
        <CancelSaleModal
          initialSaleId={action.saleId}
          onClose={() => setAction(null)}
          onDone={handleCancelDone}
        />
      ) : null}
    </div>
  );
}