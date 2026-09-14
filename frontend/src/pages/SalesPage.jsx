import ActionButton from '../components/ActionButton.jsx';
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { salesService } from '../services/sales.service.js';
import { useLanguage } from '../i18n/index.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { formatMoney, formatQuantity, formatDateOnly, formatDateTime } from '../utils/format.js';

const LIMIT = 20;

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

function StatusBadge({ status, t }) {
  const label = t(`status.${status}`) || status || '—';
  const cls = `badge badge-${status || 'default'}`;
  return <span className={cls}>{label}</span>;
}

function PaymentTypeBadge({ type, t }) {
  const label = t(`pos.${type}`) || type || '—';
  return <span className="badge badge-default">{label}</span>;
}

function SaleTypeBadge({ type, t }) {
  const label = type === 'wholesale' ? t('pos.wholesale') : t('pos.retail');
  return <span className="badge badge-default">{label}</span>;
}

export default function SalesPage() {
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState(null);

  const salesList = useAsync(
    () =>
      salesService.listSales({
        search: search || undefined,
        status: status || undefined,
        paymentType: paymentType || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: LIMIT,
      }),
    [search, status, paymentType, fromDate, toDate, page]
  );

  const saleDetail = useAsync(
    () => (detailId ? salesService.getSale(detailId) : Promise.resolve(null)),
    [detailId]
  );

  const pagination = salesList.data?.pagination ?? null;
  const items = salesList.data?.items ?? [];

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleReset() {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setPaymentType('');
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  function handleStatusFilter(event) {
    setStatus(event.target.value);
    setPage(1);
  }

  function handlePaymentTypeFilter(event) {
    setPaymentType(event.target.value);
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

  const hasFilters = Boolean(search || status || paymentType || fromDate || toDate);
  const detail = saleDetail.data;

  return (
    <div className="sales-page">
      <div className="page-heading">
        <h1 className="page-title">{t('nav.salesHistory')}</h1>
        <p className="page-intro">{t('nav.salesHistory')}</p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('nav.salesHistory')}
            aria-label={t('nav.salesHistory')}
          />
          <button type="submit" className="btn btn-primary">
            {t('pos.search')}
          </button>
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            {t('common.close')}
          </button>
        </form>

        <div className="toolbar-actions">
          <label className="toolbar-select">
            <span className="sr-only">{t('pos.status')}</span>
            <select value={status} onChange={handleStatusFilter}>
              <option value="">{t('common.all')}</option>
              <option value="completed">{t('status.completed')}</option>
              <option value="cancelled">{t('status.cancelled')}</option>
              <option value="returned">{t('status.returned')}</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('pos.paymentType')}</span>
            <select value={paymentType} onChange={handlePaymentTypeFilter}>
              <option value="">{t('common.all')}</option>
              <option value="cash">{t('pos.cash')}</option>
              <option value="credit">{t('pos.credit')}</option>
              <option value="partial">{t('pos.partial')}</option>
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('pos.fromDate')}</span>
            <input
              type="date"
              value={fromDate}
              onChange={handleFromDateFilter}
              aria-label={t('pos.fromDate')}
            />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('pos.toDate')}</span>
            <input
              type="date"
              value={toDate}
              onChange={handleToDateFilter}
              aria-label={t('pos.toDate')}
            />
          </label>

          <Link to="/pos" className="btn btn-primary">
            {t('pos.newSale')}
          </Link>
        </div>
      </div>

      {salesList.loading && !salesList.data ? (
        <PageLoader label={t('common.loading')} />
      ) : null}

      {salesList.error && !salesList.data ? (
        <ErrorState
          title={t('nav.salesHistory')}
          message={salesList.error.message}
          status={salesList.error.status}
          onRetry={() => salesList.refetch()}
        />
      ) : null}

      {salesList.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('common.noResults') : t('common.noResults')}
          description={hasFilters ? t('common.tryDifferent') : t('common.noData')}
          actions={
            <Link to="/pos" className="btn btn-primary">
              {t('pos.newSale')}
            </Link>
          }
        />
      ) : null}

      {salesList.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} {t('nav.salesHistory')}
            </p>
            {salesList.loading ? <span className="table-refreshing">{t('common.refreshing')}</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table sales-table">
              <thead>
                <tr>
                  <th>{t('invoice.title')}</th>
                  <th>{t('audit.time')}</th>
                  <th>{t('pos.customer')}</th>
                  <th>{t('pos.saleTypeLabel')}</th>
                  <th className="num">{t('pos.total')}</th>
                  <th className="num">{t('pos.paid')}</th>
                  <th className="num">{t('pos.balanceDue')}</th>
                  <th>{t('pos.paymentType')}</th>
                  <th>{t('pos.status')}</th>
                  <th className="actions-col">{t('common.actions')}</th>
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
                          {sale.customer_phone ? (
                            <span className="cell-sub">{sale.customer_phone}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="cell-sub">{t('common.walkIn')}</span>
                      )}
                    </td>
                    <td>
                      <SaleTypeBadge type={sale.sale_type} t={t} />
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
                      <PaymentTypeBadge type={sale.payment_type} t={t} />
                    </td>
                    <td>
                      <StatusBadge status={sale.status} t={t} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => openDetail(sale.id)}>{t('common.view')}</ActionButton>
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
        <Modal title={t('nav.salesHistory')} onClose={closeDetail}>
          {saleDetail.loading && !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Spinner label={t('common.loading')} />
            </div>
          ) : null}

          {saleDetail.error && !detail ? (
            <div className="form-alert" role="alert">
              {saleDetail.error.message || t('common.loading')}
            </div>
          ) : null}

          {detail ? (
            <div className="sale-detail">
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div className="summary-item">
                  <span className="summary-label">{t('invoice.title')}</span>
                  <span className="summary-value">{detail.invoice_number}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">{t('audit.time')}</span>
                  <span className="summary-value">{formatDateTime(detail.sale_date)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">{t('pos.customer')}</span>
                  <span className="summary-value">
                    {detail.customer_name || t('common.walkIn')}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">{t('pos.saleTypeLabel')}</span>
                  <span className="summary-value">
                    <SaleTypeBadge type={detail.sale_type} t={t} />
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">{t('pos.status')}</span>
                  <span className="summary-value">
                    <StatusBadge status={detail.status} t={t} />
                  </span>
                </div>
              </div>

              {detail.items && detail.items.length > 0 ? (
                <div className="detail-card">
                  <div className="card-heading">
                    <h3 className="card-title">{t('pos.items')}</h3>
                    <span className="card-caption">{detail.items.length}</span>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t('pos.product')}</th>
                          <th className="num">{t('pos.qty')}</th>
                          <th className="num">{t('pos.unitPrice')}</th>
                          <th className="num">{t('pos.discount')}</th>
                          <th className="num">{t('pos.amount')}</th>
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
                            <td className="num">{formatQuantity(item.quantity)} {item.unit}</td>
                            <td className="num">{formatMoney(item.unit_price)}</td>
                            <td className="num">
                              {Number(item.discount_amount) > 0 ? formatMoney(item.discount_amount) : '—'}
                            </td>
                            <td className="num">{formatMoney(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="detail-card">
                <h3 className="card-title">{t('nav.salesHistory')}</h3>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.subtotal')}</span>
                    <span className="summary-value">{formatMoney(detail.subtotal)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.discount')}</span>
                    <span className="summary-value">
                      {Number(detail.discount_amount) > 0 ? formatMoney(detail.discount_amount) : '—'}
                    </span>
                  </div>
                  {Number(detail.cgst_amount) > 0 ? (
                    <div className="summary-item">
                      <span className="summary-label">{t('invoice.cgst')}</span>
                      <span className="summary-value">{formatMoney(detail.cgst_amount)}</span>
                    </div>
                  ) : null}
                  {Number(detail.sgst_amount) > 0 ? (
                    <div className="summary-item">
                      <span className="summary-label">{t('invoice.sgst')}</span>
                      <span className="summary-value">{formatMoney(detail.sgst_amount)}</span>
                    </div>
                  ) : null}
                  {Number(detail.igst_amount) > 0 ? (
                    <div className="summary-item">
                      <span className="summary-label">{t('invoice.igst')}</span>
                      <span className="summary-value">{formatMoney(detail.igst_amount)}</span>
                    </div>
                  ) : null}
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.taxPreview')}</span>
                    <span className="summary-value">
                      {Number(detail.tax_amount) > 0 ? formatMoney(detail.tax_amount) : '—'}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.total')}</span>
                    <span className="summary-value" style={{ fontWeight: 700 }}>
                      {formatMoney(detail.total_amount)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.paid')}</span>
                    <span className="summary-value" style={{ color: 'var(--color-success)' }}>
                      {formatMoney(detail.paid_amount)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">{t('pos.balanceDue')}</span>
                    <span
                      className="summary-value"
                      style={{ color: Number(detail.balance_due) > 0 ? 'var(--color-danger)' : undefined, fontWeight: 700 }}
                    >
                      {formatMoney(detail.balance_due)}
                    </span>
                  </div>
                </div>
                <div className="sale-detail-link">
                  <Link to={`/invoices?sale=${detail.id}`} className="btn btn-outline btn-sm">
                    {t('invoice.title')} →
                  </Link>
                </div>
              </div>

              {detail.payments && detail.payments.length > 0 ? (
                <div className="detail-card">
                  <div className="card-heading">
                    <h3 className="card-title">{t('pos.payment')}</h3>
                    <span className="card-caption">{detail.payments.length}</span>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t('pos.method')}</th>
                          <th className="num">{t('pos.amount')}</th>
                          <th>{t('audit.time')}</th>
                          <th>{t('pos.notes')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((pmt) => (
                          <tr key={pmt.id}>
                            <td>{PAYMENT_METHOD_LABELS[pmt.payment_method] || pmt.payment_method}</td>
                            <td className="num">{formatMoney(pmt.amount)}</td>
                            <td>{formatDateTime(pmt.payment_date)}</td>
                            <td>{pmt.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}