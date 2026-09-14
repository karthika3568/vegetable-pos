import ActionButton from '../components/ActionButton.jsx';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { useLanguage } from '../i18n/index.jsx';
import { invoiceService, INVOICE_STATUS_LABELS, PAYMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../services/invoice.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { formatMoney, formatQuantity, formatDateOnly, formatDateTime } from '../utils/format.js';

const LIMIT = 20;

// Currency-aware money display for the receipt. The currency code always
// comes from the backend invoice payload (settings), never hard-coded.
const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AED: 'د.إ',
  LKR: 'Rs ',
};

function receiptMoney(value, currency) {
  const n = Number(value);
  const amount = Number.isFinite(n)
    ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
  const symbol = currency ? CURRENCY_SYMBOLS[currency] : null;
  if (symbol) return `${symbol}${amount}`;
  return `${currency || 'INR'} ${amount}`;
}

// Split a datetime into "DD/MM/YYYY" and "HH:MM AM/PM" for the header.
function dateTimeParts(value) {
  if (!value) return { date: '—', time: '—' };
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return { date: '—', time: '—' };
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

function SaleTypeBadge({ type }) {
  const { t } = useLanguage();
  const label = type === 'wholesale' ? t('pos.wholesale') : type === 'retail' ? t('pos.retail') : (type || '—');
  return <span className="badge badge-default">{label}</span>;
}

function StatusBadge({ status }) {
  const label = INVOICE_STATUS_LABELS[status] || status || '—';
  return <span className={`badge badge-${status || 'default'}`}>{label}</span>;
}

function PaymentTypeBadge({ type }) {
  const label = PAYMENT_TYPE_LABELS[type] || type || '—';
  return <span className="badge badge-default">{label}</span>;
}

function ReceiptRow({ label, value, strong = false, danger = false, className = '' }) {
  return (
    <div className={`receipt-total-line${strong ? ' is-strong' : ''}${danger ? ' is-danger' : ''}${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InvoiceSheet({ invoice }) {
  const { t } = useLanguage();
  const customer = invoice.customer || null;
  const returns = invoice.returns ?? [];
  const payments = invoice.payments ?? [];
  const credit = invoice.credit ?? null;

  const shop = invoice.shop || {};
  const currency = shop.currency || 'INR';
  const money = (value) => receiptMoney(value, currency);

  const cgst = Number(invoice.cgstAmount || 0);
  const sgst = Number(invoice.sgstAmount || 0);
  const igst = Number(invoice.igstAmount || 0);
  const hasGst = cgst > 0 || sgst > 0 || igst > 0;
  const interState = igst > 0;

  const balanceDue = Number(invoice.balanceDue || 0);
  const showCreditBalance = balanceDue > 0;
  const displayPayments = balanceDue > 0
    ? [...payments, { id: 'credit-balance', method: 'credit', amount: balanceDue, paymentDate: null, receivedByName: null }]
    : payments;

  const stamp = dateTimeParts(invoice.saleDate);
  const saleTypeLabel = invoice.saleType === 'wholesale' ? t('pos.wholesale') : t('pos.retail');

  let methodLabel = '';
  if (displayPayments.length > 0) {
    methodLabel = displayPayments[0].method === 'credit'
      ? t('pos.credit')
      : PAYMENT_METHOD_LABELS[displayPayments[0].method] || displayPayments[0].method;
  } else if (invoice.paymentType) {
    methodLabel = PAYMENT_TYPE_LABELS[invoice.paymentType] || invoice.paymentType;
  }
  let paymentLabel = methodLabel || '—';
  if (invoice.paymentType === 'partial') {
    paymentLabel = methodLabel ? `${methodLabel} (${t('pos.partial')})` : t('pos.partial');
  } else if (invoice.paymentType === 'credit') {
    paymentLabel = t('pos.credit');
  }

  return (
    <div className="receipt">
      <div className="receipt-head">
        <div className="receipt-shop">{shop.shopName || t('common.appName')}</div>
      </div>

      <table className="receipt-meta">
        <tbody>
          <tr>
            <td>{t('invoice.billNo')}</td>
            <td>{invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <td>{t('invoice.date')}</td>
            <td>{stamp.date}</td>
          </tr>
          <tr>
            <td>{t('invoice.time')}</td>
            <td>{stamp.time}</td>
          </tr>
          <tr>
            <td>{t('invoice.type')}</td>
            <td>{saleTypeLabel}</td>
          </tr>
        </tbody>
      </table>

      <div className="receipt-dotted" />

      <table className="receipt-meta">
        <tbody>
          <tr>
            <td>{t('pos.customer')}</td>
            <td>{customer ? customer.name : t('common.walkIn')}</td>
          </tr>
          {customer?.phone ? (
            <tr>
              <td>{t('invoice.mobile')}</td>
              <td>{customer.phone}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="receipt-dotted" />

      <table className="receipt-meta">
        <tbody>
          <tr>
            <td>{t('pos.status')}</td>
            <td>{INVOICE_STATUS_LABELS[invoice.status] || invoice.status || '—'}</td>
          </tr>
          <tr>
            <td>{t('pos.paymentType')}</td>
            <td>{paymentLabel}</td>
          </tr>
          <tr>
            <td>{t('invoice.amountPaid')}</td>
            <td>{money(invoice.amountPaid)}</td>
          </tr>
          {showCreditBalance ? (
            <tr className="receipt-balanced-row">
              <td>{t('invoice.creditBalance')}</td>
              <td>{money(balanceDue)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="receipt-dotted" />

      {invoice.items && invoice.items.length > 0 ? (
        <table className="receipt-items">
          <thead>
            <tr>
              <th>{t('pos.items')}</th>
              <th className="num">{t('pos.qty')}</th>
              <th className="num">{t('invoice.rate')}</th>
              <th className="num">{t('pos.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={item.productId ?? index}>
                <td className="receipt-item-name">
                  {index + 1}. {item.productName}
                  {item.productCode ? <span className="receipt-sub"> [{item.productCode}]</span> : null}
                </td>
                <td className="num">
                  {formatQuantity(item.quantity)}
                  {item.unit ? ` ${item.unit}` : ''}
                </td>
                <td className="num">
                  {item.mrp != null && Number(item.mrp) > 0 ? (
                    <span className="receipt-mrp">{money(item.mrp)}</span>
                  ) : null}
                  {money(item.unitPrice)}
                </td>
                <td className="num">{money(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="receipt-dotted" />

      <div className="receipt-totals">
        <ReceiptRow label={t('pos.subtotal')} value={money(invoice.subtotal)} />
        {Number(invoice.discountAmount) > 0 ? (
          <ReceiptRow label={t('pos.discount')} value={`−${money(invoice.discountAmount)}`} />
        ) : null}
        {hasGst && interState ? (
          <>
            <ReceiptRow label={t('invoice.igst')} value={money(igst)} />
            <ReceiptRow label={t('invoice.gstTotal')} value={money(invoice.taxAmount)} />
          </>
        ) : null}
        {hasGst && !interState ? (
          <>
            {cgst > 0 ? <ReceiptRow label={t('invoice.cgst')} value={money(cgst)} /> : null}
            {sgst > 0 ? <ReceiptRow label={t('invoice.sgst')} value={money(sgst)} /> : null}
            <ReceiptRow label={t('invoice.gstTotal')} value={money(invoice.taxAmount)} />
          </>
        ) : null}
        <div className="receipt-total-sep" />
        <ReceiptRow label={t('pos.total')} value={money(invoice.totalAmount)} strong />
        <div className="receipt-total-sep" />
        <ReceiptRow label={t('pos.paid')} value={money(invoice.amountPaid)} />
        {showCreditBalance ? (
          <ReceiptRow label={t('invoice.creditBalance')} value={money(balanceDue)} danger />
        ) : null}
      </div>

      {displayPayments.length > 0 ? (
        <div className="receipt-section">
          <div className="receipt-section-title">{t('pos.payment')}</div>
          <table className="receipt-items">
            <thead>
              <tr>
                <th>{t('pos.method')}</th>
                <th className="num">{t('pos.amount')}</th>
                <th>{t('audit.time')}</th>
                <th>{t('audit.user')}</th>
              </tr>
            </thead>
            <tbody>
              {displayPayments.map((pmt) => (
                <tr key={pmt.id}>
                  <td>{pmt.method === 'credit' ? t('pos.credit') : PAYMENT_METHOD_LABELS[pmt.method] || pmt.method}</td>
                  <td className="num">{money(pmt.amount)}</td>
                  <td>{pmt.paymentDate ? formatDateTime(pmt.paymentDate) : '—'}</td>
                  <td>{pmt.receivedByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {returns.length > 0 ? (
        <div className="receipt-section">
          <div className="receipt-section-title">{t('nav.returns')}</div>
          {returns.map((ret) => (
            <div key={ret.id} className="receipt-return">
              <div className="receipt-return-meta">
                <span>{t('pos.returnDate')}: {formatDateTime(ret.returnDate)}</span>
                <span>{t('pos.refundAmount')}: {money(ret.refundAmount)}</span>
              </div>
              {ret.reason ? <div className="receipt-return-reason">{t('pos.reason')}: {ret.reason}</div> : null}
              {ret.createdByName ? (
                <div className="receipt-return-reason">{t('pos.processedBy')}: {ret.createdByName}</div>
              ) : null}
              {ret.items && ret.items.length > 0 ? (
                <table className="receipt-items">
                  <thead>
                    <tr>
                      <th>{t('pos.items')}</th>
                      <th className="num">{t('pos.qty')}</th>
                      <th className="num">{t('invoice.rate')}</th>
                      <th className="num">{t('pos.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ret.items.map((item, index) => (
                      <tr key={item.productId ?? index}>
                        <td className="receipt-item-name">
                          {item.productName}
                          {item.productCode ? <span className="receipt-sub"> [{item.productCode}]</span> : null}
                        </td>
                        <td className="num">
                          {formatQuantity(item.quantity)}
                          {item.unit ? ` ${item.unit}` : ''}
                        </td>
                        <td className="num">{money(item.unitPrice)}</td>
                        <td className="num">{money(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {credit ? (
        <div className="receipt-section">
          <div className="receipt-section-title">{t('invoice.credit')}</div>
          {credit.recorded ? (
            <table className="receipt-items">
              <tbody>
                <tr>
                  <td>{t('pos.amount')}</td>
                  <td className="num">{money(credit.amount)}</td>
                </tr>
                <tr>
                  <td>{t('invoice.netCredit')}</td>
                  <td className="num">{money(credit.netCredit)}</td>
                </tr>
                {credit.reversalCount > 0 ? (
                  <tr>
                    <td>{t('invoice.reversed')}</td>
                    <td className="num">{money(credit.reversalTotal)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p className="receipt-sub" style={{ margin: 0 }}>
              {t('common.none')}
              {credit.reversalCount > 0 ? ` · ${credit.reversalCount} · ${money(credit.reversalTotal)}` : ''}.
            </p>
          )}
        </div>
      ) : null}

      <div className="receipt-dotted" />

      <div className="receipt-foot">
        <div className="receipt-thanks">{t('invoice.thankYou')}</div>
        <div className="receipt-foot-shop">{shop.shopName || t('common.appName')}</div>
        <div className="receipt-sub">
          {t('invoice.title')} #{invoice.saleId} · {invoice.createdBy?.username || '—'} · {formatDateTime(invoice.createdAt)}
        </div>
      </div>
    </div>
  );
}

export default function InvoicePage() {
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [printerType, setPrinterType] = useState('thermal');
  const [paperSize, setPaperSize] = useState('80mm');

  const [detailId, setDetailId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const deepLinkSale = searchParams.get('sale');

  // The POS success screen links to /invoices?sale=<id> to open this
  // invoice immediately in print/read mode.
  const openDetail = useCallback((id) => setDetailId(id), []);

  useEffect(() => {
    if (deepLinkSale && /^\d+$/.test(deepLinkSale)) {
      openDetail(Number(deepLinkSale));
      const next = new URLSearchParams(searchParams);
      next.delete('sale');
      setSearchParams(next, { replace: true });
    }
  }, []);

  const invoiceList = useAsync(
    () =>
      invoiceService.list({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: status || undefined,
        page,
        limit: LIMIT,
      }),
    [search, status, fromDate, toDate, page]
  );

  const invoiceDetail = useAsync(
    () => (detailId ? invoiceService.getBySaleId(detailId) : Promise.resolve(null)),
    [detailId]
  );

  useEffect(() => {
    function onAfterPrint() {
      document.body.classList.remove('invoice-print-mode');
      document.body.classList.remove('invoice-print-a4', 'invoice-print-thermal-58', 'invoice-print-thermal-80');
    }
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('invoice-print-mode');
      document.body.classList.remove('invoice-print-a4', 'invoice-print-thermal-58', 'invoice-print-thermal-80');
    };
  }, []);

  const pagination = invoiceList.data?.pagination ?? null;
  const items = invoiceList.data?.items ?? [];
  const detail = invoiceDetail.data;

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

  const closeDetail = useCallback(() => {
    document.body.classList.remove('invoice-print-mode');
    document.body.classList.remove('invoice-print-a4', 'invoice-print-thermal-58', 'invoice-print-thermal-80');
    setDetailId(null);
  }, []);

  function handlePrint() {
    document.body.classList.toggle('invoice-print-a4', printerType === 'a4');
    document.body.classList.toggle('invoice-print-thermal-58', printerType === 'thermal' && paperSize === '58mm');
    document.body.classList.toggle('invoice-print-thermal-80', printerType === 'thermal' && paperSize === '80mm');
    document.body.classList.add('invoice-print-mode');
    window.print();
  }

  const hasFilters = Boolean(search || status || fromDate || toDate);

  return (
    <div className="invoices-page">
      <div className="page-heading">
        <h1 className="page-title">{t('nav.invoices')}</h1>
        <p className="page-intro">{t('nav.invoices')}</p>
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('nav.invoices')}
            aria-label={t('nav.invoices')}
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
            <span className="sr-only">{t('nav.salesHistory')}</span>
            <input type="date" value={fromDate} onChange={handleFromDateFilter} aria-label={t('nav.salesHistory')} />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">{t('nav.salesHistory')}</span>
            <input type="date" value={toDate} onChange={handleToDateFilter} aria-label={t('nav.salesHistory')} />
          </label>
        </div>
      </div>

      {invoiceList.loading && !invoiceList.data ? <PageLoader label={t('common.loading')} /> : null}

      {invoiceList.error && !invoiceList.data ? (
        <ErrorState
          title="Invoices unavailable"
          message={invoiceList.error.message}
          status={invoiceList.error.status}
          onRetry={() => invoiceList.refetch()}
        />
      ) : null}

      {invoiceList.data && items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No invoices match your filters' : 'No invoices found'}
          description={
            hasFilters
              ? 'Try changing the search or clearing the filters.'
              : 'Invoices are generated automatically for sales; sales History will show them here.'
          }
        />
      ) : null}

      {invoiceList.data && items.length > 0 ? (
        <div className="table-card">
          <div className="table-tools">
            <p className="table-count">
              {pagination?.total ?? 0} {t('nav.invoices')}
            </p>
            {invoiceList.loading ? <span className="table-refreshing">{t('common.refreshing')}</span> : null}
          </div>

          <div className="table-scroll">
            <table className="data-table invoices-table">
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
                {items.map((invoice) => (
                  <tr key={invoice.saleId}>
                    <td className="cell-main cell-code">{invoice.invoiceNumber}</td>
                    <td>{formatDateOnly(invoice.saleDate)}</td>
                    <td>
                      {invoice.customer ? (
                        <span>
                          {invoice.customer.name}
                          {invoice.customer.phone ? (
                            <span className="cell-sub">{invoice.customer.phone}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="cell-sub">{t('common.walkIn')}</span>
                      )}
                    </td>
                    <td>
                      <SaleTypeBadge type={invoice.saleType} />
                    </td>
                    <td className="num">{formatMoney(invoice.totalAmount)}</td>
                    <td className="num">{formatMoney(invoice.amountPaid)}</td>
                    <td className="num">
                      {Number(invoice.balanceDue) > 0 ? (
                        <span className="money" style={{ color: 'var(--color-danger)' }}>
                          {formatMoney(invoice.balanceDue)}
                        </span>
                      ) : (
                        formatMoney(0)
                      )}
                    </td>
                    <td>
                      <PaymentTypeBadge type={invoice.paymentType} />
                    </td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        <ActionButton action="view" onClick={() => openDetail(invoice.saleId)}>{t('common.view')}</ActionButton>
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
        <Modal title={`${t('invoice.title')} ${detail?.invoiceNumber ?? ''}`} onClose={closeDetail} wide>
          {invoiceDetail.loading && !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Spinner label={t('common.loading')} />
            </div>
          ) : null}

          {invoiceDetail.error && !detail ? (
            <div className="form-alert" role="alert">
              {invoiceDetail.error.message || t('common.loading')}
            </div>
          ) : null}

          {detail ? (
            <div className="invoice-detail">
              <div className="invoice-actions">
                <div>
                  <StatusBadge status={detail.status} />
                  <PaymentTypeBadge type={detail.paymentType} />
                </div>
                <div className="invoice-print-options">
                  <label className="toolbar-select">
                    <span>{t('invoice.printerType')}</span>
                    <select value={printerType} onChange={(event) => setPrinterType(event.target.value)}>
                      <option value="thermal">{t('invoice.thermal')}</option>
                      <option value="a4">{t('invoice.a4')}</option>
                    </select>
                  </label>
                  {printerType === 'thermal' ? (
                    <label className="toolbar-select">
                      <span>{t('invoice.paperSize')}</span>
                      <select value={paperSize} onChange={(event) => setPaperSize(event.target.value)}>
                        <option value="58mm">58mm</option>
                        <option value="80mm">76mm / 80mm</option>
                      </select>
                    </label>
                  ) : null}
                  <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
                    {t('invoice.printInvoice')}
                  </button>
                </div>
              </div>

              {detail.credit?.recorded ? (
                <div className="notice-bar notice-bar-muted" role="status">
                  {t('pos.creditNotice')} {formatMoney(detail.credit.netCredit)}
                  {detail.credit.reversalCount > 0 ? ` (${detail.credit.reversalCount})` : ''}.
                </div>
              ) : null}

              <InvoiceSheet invoice={detail} />
            </div>
          ) : null}
        </Modal>
      ) : null}

      {detail
        ? createPortal(
            <div id="invoice-print-portal">
              <InvoiceSheet invoice={detail} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}