import { useCallback, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { creditService, CREDIT_PAYMENT_METHODS, CREDIT_PAYMENT_METHOD_LABELS } from '../services/credit.service.js';
import { salesService } from '../services/sales.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { formatMoney, formatDateTime } from '../utils/format.js';
import ActionButton from '../components/ActionButton.jsx';

const LIMIT = 20;
const TXN_LIMIT = 10;

const CUSTOMER_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
};

const TRANSACTION_TONE = {
  created: 'default',
  collected: 'completed',
  credit_reversal: 'warning',
};

function StatusBadge({ status }) {
  const label = CUSTOMER_STATUS_LABELS[status] || status || '—';
  return <span className={`badge badge-${status || 'default'}`}>{label}</span>;
}

function TransactionBadge({ type }) {
  const labels = {
    created: 'Credit Created',
    collected: 'Credit Collected',
    credit_reversal: 'Credit Reversal',
  };
  const tone = TRANSACTION_TONE[type] || 'default';
  return <span className={`badge badge-${tone}`}>{labels[type] || type || '—'}</span>;
}

function CollectCreditModal({ customer, onClose, onSubmit }) {
  const outstanding = Number(customer.outstanding);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (value > outstanding) {
      setError(`Amount cannot exceed the outstanding balance of ${formatMoney(outstanding)}.`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        amount: value,
        method,
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not collect payment.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Collect Credit" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="summary-grid" style={{ marginBottom: 14 }}>
          <div className="summary-item">
            <span className="summary-label">Customer</span>
            <span className="summary-value">{customer.name}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Outstanding</span>
            <span className="summary-value" style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
              {formatMoney(outstanding)}
            </span>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="collectAmount">Amount</label>
          <input
            id="collectAmount"
            name="amount"
            type="number"
            min="0.01"
            max={outstanding}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            disabled={submitting || outstanding <= 0}
          />
          <p className="field-hint">
            Must be greater than zero and at most {formatMoney(outstanding)} (backend enforces this too).
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="collectMethod">Payment Method</label>
          <select
            id="collectMethod"
            name="method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            disabled={submitting}
          >
            {CREDIT_PAYMENT_METHODS.map((item) => (
              <option key={item} value={item}>
                {CREDIT_PAYMENT_METHOD_LABELS[item] || item}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="collectNotes">Notes</label>
          <input
            id="collectNotes"
            name="notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
            maxLength={255}
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
          <button type="submit" className="btn btn-primary" disabled={submitting || outstanding <= 0}>
            {submitting ? 'Collecting…' : 'Collect Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateCreditModal({ eligibleSales, onClose, onSubmit }) {
  const eligibleItems = (eligibleSales.data?.items ?? []).filter(
    (sale) => Number(sale.balance_due) > 0 && Number(sale.customer_id) > 0
  );
  const salesLoading = eligibleSales.loading;
  const salesError = eligibleSales.error;

  const [selected, setSelected] = useState('');
  const [manualId, setManualId] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function switchToManual() {
    setManualId(selected);
    setSelected('');
    setUseManual(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const saleId = useManual || eligibleItems.length === 0 ? Number(manualId) : Number(selected);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      setError('Select a sale or enter a valid sale ID.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(saleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create credit.');
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create Credit" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Convert the outstanding balance of a completed sale into credit for its customer. The sale must have a
          customer, be completed and still have an outstanding balance.
        </p>

        {salesLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <Spinner label="Loading eligible sales…" />
          </div>
        ) : null}

        {salesError ? (
          <div className="form-alert" role="alert">
            Could not load the list of eligible sales ({salesError.message || 'request failed'}). Enter the sale ID
            manually below.
          </div>
        ) : null}

        {!salesLoading && !salesError && eligibleItems.length > 0 ? (
          <div className="form-field">
            <label htmlFor="createSaleId">Sale</label>
            <select
              id="createSaleId"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={submitting}
            >
              <option value="">Select a sale…</option>
              {eligibleItems.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.invoice_number} — {sale.customer_name || 'Walk-in'} — {formatMoney(sale.balance_due)}{' '}
                  outstanding
                </option>
              ))}
            </select>
            {selected ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={switchToManual}>
                Enter sale ID manually
              </button>
            ) : null}
          </div>
        ) : null}

        {!salesLoading && !salesError && eligibleItems.length === 0 && !useManual ? (
          <p className="field-hint" style={{ marginTop: 0 }}>
            No completed sales with an outstanding balance were found. You can enter the sale ID manually below.
          </p>
        ) : null}

        {useManual || eligibleItems.length === 0 || salesError ? (
          <div className="form-field">
            <label htmlFor="createSaleIdManual">Sale ID</label>
            <input
              id="createSaleIdManual"
              type="number"
              min="1"
              step="1"
              value={manualId}
              onChange={(event) => setManualId(event.target.value)}
              placeholder="e.g. 42"
              disabled={submitting}
            />
            <p className="field-hint">Numeric sale ID from the sales history. The backend validates eligibility.</p>
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
            {submitting ? 'Creating…' : 'Create Credit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CreditPage() {
  const { hasPermission } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [outstanding, setOutstanding] = useState('true');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);
  const [txnPage, setTxnPage] = useState(1);
  const [collectCustomer, setCollectCustomer] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { showToast } = useToast();

  const list = useAsync(
    () =>
      creditService.list({
        search: search || undefined,
        outstanding: outstanding || undefined,
        status: status || undefined,
        page,
        limit: LIMIT,
      }),
    [search, outstanding, status, page]
  );

  const detail = useAsync(
    () => (detailId ? creditService.getCustomerCredit(detailId) : Promise.resolve(null)),
    [detailId]
  );

  const txns = useAsync(
    () => (detailId ? creditService.getTransactions(detailId, { page: txnPage, limit: TXN_LIMIT }) : Promise.resolve(null)),
    [detailId, txnPage]
  );

  const eligibleSales = useAsync(
    () =>
      createOpen
        ? salesService.listSales({ status: 'completed', page: 1, limit: 100 })
        : Promise.resolve({ items: [], pagination: null }),
    [createOpen]
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
    setOutstanding('true');
    setStatus('');
    setPage(1);
  }

  function handleOutstandingFilter(event) {
    setOutstanding(event.target.value);
    setPage(1);
  }

  function handleStatusFilter(event) {
    setStatus(event.target.value);
    setPage(1);
  }

  const openDetail = useCallback(
    (id) => {
      setTxnPage(1);
      setDetailId(id);
    },
    []
  );

  const closeDetail = useCallback(() => setDetailId(null), []);
  const closeCollect = useCallback(() => setCollectCustomer(null), []);
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  const pagination = list.data?.pagination ?? null;
  const items = list.data?.items ?? [];
  const canCreate = hasPermission('credit.create');
  const canCollect = hasPermission('credit.collect');
  const hasFilters = Boolean(search || status || outstanding !== 'true');

  async function handleCreateSubmit(saleId) {
    const result = await creditService.createFromSale(saleId);
    setCreateOpen(false);
    showNotice(result?.alreadyRecorded ? 'Credit was already recorded for this sale.' : 'Credit recorded successfully.');
    list.refetch();
    return result;
  }

  async function handleCollectSubmit(body) {
    const result = await creditService.collect(collectCustomer.customerId, body);
    setCollectCustomer(null);
    showNotice('Payment collected successfully.');
    list.refetch();
    if (detailId) detail.refetch();
    return result;
  }

  return (
    <div className="credit-page">
      <div className="page-heading">
        <h1 className="page-title">Credit Management</h1>
        <p className="page-intro">Customer credit balances, collections and history.</p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search customer name or phone…"
            aria-label="Search credit customers"
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
            <span className="sr-only">Balance filter</span>
            <select value={outstanding} onChange={handleOutstandingFilter}>
              <option value="true">Outstanding balance only</option>
              <option value="false">All customers</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">Status filter</span>
            <select value={status} onChange={handleStatusFilter}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          {canCreate ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              Create Credit
            </button>
          ) : null}
        </div>
      </div>

      {list.loading && !list.data ? <PageLoader label="Loading credit balances…" /> : null}

      {list.error && !list.data ? (
        <ErrorState
          title="Credit balances unavailable"
          message={list.error.message}
          status={list.error.status}
          onRetry={() => list.refetch()}
        />
      ) : null}

      {list.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No credit balances match your filters' : 'No outstanding credit'}
          description={
            hasFilters
              ? 'Try changing the search or clearing the filters.'
              : 'Customers with credit from sales will appear here.'
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
            <table className="data-table credit-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Credit Limit</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Available</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((customer) => (
                  <tr key={customer.customerId}>
                    <td>
                      <span className="cell-main">{customer.name}</span>
                      {customer.phone ? <span className="cell-sub">{customer.phone}</span> : null}
                    </td>
                    <td className="num">{formatMoney(customer.creditLimit)}</td>
                    <td className="num">
                      <span className="money" style={{ color: 'var(--color-danger)' }}>
                        {formatMoney(customer.outstanding)}
                      </span>
                    </td>
                    <td className="num">{formatMoney(customer.availableCredit)}</td>
                    <td>
                      <StatusBadge status={customer.status} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => openDetail(customer.customerId)} />
                        {canCollect ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={Number(customer.outstanding) <= 0}
                            onClick={() => setCollectCustomer(customer)}
                          >
                            Collect
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
        <Modal title="Credit Details" onClose={closeDetail} wide>
          {detail.loading && !detail.data ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Spinner label="Loading credit details…" />
            </div>
          ) : null}

          {detail.error && !detail.data ? (
            <div className="form-alert" role="alert">
              {detail.error.message || 'Could not load credit details.'}
            </div>
          ) : null}

          {detail.data ? (
            <div className="credit-detail">
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div className="summary-item">
                  <span className="summary-label">Customer</span>
                  <span className="summary-value">{detail.data.name}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Phone</span>
                  <span className="summary-value">{detail.data.phone || '—'}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Credit Limit</span>
                  <span className="summary-value">{formatMoney(detail.data.creditLimit)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Outstanding</span>
                  <span className="summary-value" style={{ color: 'var(--color-danger)', fontWeight: 700 }}>
                    {formatMoney(detail.data.outstanding)}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Available Credit</span>
                  <span className="summary-value">{formatMoney(detail.data.availableCredit)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Status</span>
                  <span className="summary-value">
                    <StatusBadge status={detail.data.status} />
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Last Updated</span>
                  <span className="summary-value">{formatDateTime(detail.data.updatedAt)}</span>
                </div>
              </div>

              <div className="detail-card">
                <div className="card-heading">
                  <h3 className="card-title">Transaction History</h3>
                  {canCollect && Number(detail.data.outstanding) > 0 ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        closeDetail();
                        setCollectCustomer({
                          customerId: detail.data.customerId,
                          name: detail.data.name,
                          outstanding: detail.data.outstanding,
                        });
                      }}
                    >
                      Collect Payment
                    </button>
                  ) : null}
                </div>

                {txns.loading && !txns.data ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                    <Spinner label="Loading transactions…" />
                  </div>
                ) : null}

                {txns.error && !txns.data ? (
                  <div className="form-alert" role="alert">
                    {txns.error.message || 'Could not load transactions.'}
                  </div>
                ) : null}

                {txns.data && txns.data.items.length === 0 ? (
                  <p className="inline-empty">No credit transactions recorded for this customer.</p>
                ) : null}

                {txns.data && txns.data.items.length > 0 ? (
                  <>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th className="num">Amount</th>
                            <th>Reference</th>
                            <th className="num">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txns.data.items.map((tx) => (
                            <tr key={tx.id}>
                              <td>{formatDateTime(tx.createdAt)}</td>
                              <td>
                                <TransactionBadge type={tx.transactionType} />
                              </td>
                              <td className="num">
                                <span className="money" style={{ fontWeight: 600 }}>
                                  {formatMoney(tx.amount)}
                                </span>
                              </td>
                              <td>
                                {tx.invoiceNumber ? (
                                  <span className="cell-main">{tx.invoiceNumber}</span>
                                ) : tx.paymentMethod ? (
                                  CREDIT_PAYMENT_METHOD_LABELS[tx.paymentMethod] || tx.paymentMethod
                                ) : (
                                  '—'
                                )}
                                {tx.notes ? <span className="cell-sub">{tx.notes}</span> : null}
                              </td>
                              <td className="num">
                                {formatMoney(tx.balanceBefore)} → {formatMoney(tx.balanceAfter)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <Pagination
                      page={txns.data.pagination?.page ?? 1}
                      totalPages={txns.data.pagination?.totalPages ?? 1}
                      onChange={setTxnPage}
                    />
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {collectCustomer ? (
        <CollectCreditModal customer={collectCustomer} onClose={closeCollect} onSubmit={handleCollectSubmit} />
      ) : null}

      {createOpen ? (
        <CreateCreditModal eligibleSales={eligibleSales} onClose={closeCreate} onSubmit={handleCreateSubmit} />
      ) : null}
    </div>
  );
}