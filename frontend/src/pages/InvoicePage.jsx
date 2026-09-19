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
import { formatMoney, formatQuantity, formatDateOnly } from '../utils/format.js';

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

function InvoiceSheet({ invoice, printerType = 'a4', paperSize = '80mm' }) {
  const { t } = useLanguage();
  const customer = invoice.customer || null;
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
  const showCreditSection = Boolean(
    balanceDue > 0 &&
      credit &&
      credit.recorded &&
      Number(credit.netCredit ?? credit.amount ?? 0) > 0
  );

  const totalQuantity = invoice.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;
  const cashierName = invoice.createdBy?.username || payments.find((pmt) => pmt.receivedByName)?.receivedByName || '—';
  const stamp = dateTimeParts(invoice.saleDate);
  const saleTypeLabel = invoice.saleType === 'wholesale' ? t('pos.wholesale') : t('pos.retail');
  const shopName = shop.shopName || 'Vegetable Shop';
  const shopAddress = shop.address || shop.shopAddress || '';
  const shopPhone = shop.phone || shop.shopPhone || '';
  const shopGstin = shop.gstin || shop.gstIn || '';

  const statusNote = balanceDue > 0
    ? `Outstanding balance: ${money(balanceDue)}`
    : '✓ Payment received successfully';

  if (printerType === 'thermal') {
    return (
      <div className={`receipt receipt-thermal receipt-thermal-${paperSize.replace(/[^0-9]/g, '')}`}>
        <div className="receipt-thermal-header">
          <div className="receipt-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 80 80" role="img" aria-hidden="true">
              <path d="M41 11c-9 4-19 14-20 28-1 15 8 28 22 33 19-4 31-22 27-39-4-18-18-25-29-22Zm8 13c7 4 11 12 10 20-1 8-6 14-13 17-8-2-14-9-14-18 0-10 8-18 17-19Z" fill="currentColor" />
            </svg>
          </div>
          <div className="receipt-shop">{shopName}</div>
          <div className="receipt-tagline">Fresh Vegetables • Better Health</div>
          {shopAddress ? <div className="receipt-thermal-meta-line">{shopAddress}</div> : null}
          {shopPhone ? <div className="receipt-thermal-meta-line">{shopPhone}</div> : null}
          {shopGstin ? <div className="receipt-thermal-meta-line">{shopGstin}</div> : null}
        </div>

        <div className="receipt-thermal-divider" />
        <div className="receipt-thermal-title">INVOICE</div>
        <div className="receipt-thermal-divider" />

        <div className="receipt-thermal-meta">
          <div className="receipt-thermal-row"><span>Bill No</span><strong>{invoice.invoiceNumber}</strong></div>
          <div className="receipt-thermal-row"><span>Date</span><strong>{stamp.date}</strong></div>
          <div className="receipt-thermal-row"><span>Time</span><strong>{stamp.time}</strong></div>
          <div className="receipt-thermal-row"><span>Cashier</span><strong>{cashierName}</strong></div>
          <div className="receipt-thermal-row"><span>Type</span><strong>{saleTypeLabel}</strong></div>
          {customer ? (
            <div className="receipt-thermal-row"><span>Customer</span><strong>{customer.name}</strong></div>
          ) : (
            <div className="receipt-thermal-row"><span>Customer</span><strong>{t('common.walkIn')}</strong></div>
          )}
        </div>

        <div className="receipt-thermal-divider" />
        <div className="receipt-thermal-table-head">
          <span>ITEM</span>
          <span>QTY</span>
          <span>RATE</span>
          <span>AMT</span>
        </div>
        <div className="receipt-thermal-divider" />
        {invoice.items && invoice.items.length > 0 ? (
          <div className="receipt-thermal-items">
            {invoice.items.map((item, index) => (
              <div key={item.productId ?? index} className="receipt-thermal-item">
                <div className="receipt-thermal-item-main">
                  <span className="receipt-thermal-item-name">{item.productName}</span>
                  {item.productCode ? <span className="receipt-thermal-item-code">[{item.productCode}]</span> : null}
                </div>
                <div className="receipt-thermal-item-meta">
                  <span>{formatQuantity(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</span>
                  <span>{money(item.unitPrice)}</span>
                  <span>{money(item.lineTotal)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="receipt-thermal-divider" />
        <div className="receipt-thermal-totals">
          <div className="receipt-thermal-row"><span>Total Qty</span><strong>{formatQuantity(totalQuantity)}</strong></div>
          <div className="receipt-thermal-row"><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div>
          {Number(invoice.discountAmount) > 0 ? (
            <div className="receipt-thermal-row"><span>Discount</span><strong>{money(invoice.discountAmount)}</strong></div>
          ) : null}
          {hasGst && !interState && cgst > 0 ? (
            <div className="receipt-thermal-row"><span>CGST</span><strong>{money(cgst)}</strong></div>
          ) : null}
          {hasGst && !interState && sgst > 0 ? (
            <div className="receipt-thermal-row"><span>SGST</span><strong>{money(sgst)}</strong></div>
          ) : null}
          {hasGst && interState && igst > 0 ? (
            <div className="receipt-thermal-row"><span>IGST</span><strong>{money(igst)}</strong></div>
          ) : null}
          {hasGst ? (
            <div className="receipt-thermal-row"><span>Tax (GST)</span><strong>{money(invoice.taxAmount)}</strong></div>
          ) : null}
        </div>
        <div className="receipt-thermal-divider" />
        <div className="receipt-thermal-row receipt-thermal-row-total"><span>Grand Total</span><strong>{money(invoice.totalAmount)}</strong></div>
        <div className="receipt-thermal-row"><span>Paid</span><strong>{money(invoice.amountPaid)}</strong></div>
        {balanceDue > 0 ? (
          <div className="receipt-thermal-row receipt-thermal-row-due"><span>Balance Due</span><strong>{money(balanceDue)}</strong></div>
        ) : (
          <div className="receipt-thermal-row"><span>Balance Due</span><strong>{money(0)}</strong></div>
        )}
        <div className="receipt-thermal-divider" />

        {payments.length > 0 ? (
          <>
            <div className="receipt-thermal-section-title">PAYMENT</div>
            {payments.map((pmt, index) => {
              const pmtStamp = dateTimeParts(pmt.paymentDate);
              return (
                <div key={pmt.id ?? index} className="receipt-thermal-payment-block">
                  <div className="receipt-thermal-row"><span>Method</span><strong>{pmt.method === 'credit' ? t('pos.credit') : PAYMENT_METHOD_LABELS[pmt.method] || pmt.method}</strong></div>
                  <div className="receipt-thermal-row"><span>Amount</span><strong>{money(pmt.amount)}</strong></div>
                  <div className="receipt-thermal-row"><span>Date</span><strong>{pmtStamp.date}</strong></div>
                  <div className="receipt-thermal-row"><span>Time</span><strong>{pmtStamp.time}</strong></div>
                  <div className="receipt-thermal-row"><span>User</span><strong>{pmt.receivedByName || '—'}</strong></div>
                </div>
              );
            })}
            <div className="receipt-thermal-divider" />
          </>
        ) : null}

        {balanceDue > 0 ? (
          <div className="receipt-status warning" style={{ marginTop: '8px', alignSelf: 'center' }}>
            Outstanding balance: {money(balanceDue)}
          </div>
        ) : (
          <div className="receipt-status success" style={{ marginTop: '8px', alignSelf: 'center' }}>
            ✓ Payment received successfully
          </div>
        )}

        {showCreditSection ? (
          <>
            <div className="receipt-thermal-divider" />
            <div className="receipt-thermal-section-title">CREDIT</div>
            <div className="receipt-thermal-row"><span>Customer</span><strong>{customer ? customer.name : t('common.walkIn')}</strong></div>
            <div className="receipt-thermal-row"><span>Credit</span><strong>{money(Number(credit.netCredit ?? credit.amount ?? 0))}</strong></div>
            <div className="receipt-thermal-row"><span>Outstanding</span><strong>{money(balanceDue)}</strong></div>
            <div className="receipt-thermal-row"><span>Status</span><strong>Outstanding</strong></div>
          </>
        ) : null}

        <div className="receipt-thermal-footer">
          <div className="receipt-thanks">Thank You For Your Business!</div>
          <div className="receipt-foot-shop">{shopName}</div>
          <div className="receipt-sub">Invoice #{invoice.invoiceNumber} · {invoice.createdBy?.username || '—'} </div>
          <div className="receipt-sub">{stamp.date}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="receipt">
      <div className="receipt-topbar">
        <div className="receipt-brand">
          <div className="receipt-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 80 80" role="img" aria-hidden="true">
              <path d="M41 11c-9 4-19 14-20 28-1 15 8 28 22 33 19-4 31-22 27-39-4-18-18-25-29-22Zm8 13c7 4 11 12 10 20-1 8-6 14-13 17-8-2-14-9-14-18 0-10 8-18 17-19Z" fill="currentColor" />
            </svg>
          </div>
          <div className="receipt-brand-copy">
            <div className="receipt-shop">{shopName}</div>
            <div className="receipt-tagline">Fresh Vegetables • Better Health</div>
            <div className="receipt-brand-meta">
              {shopAddress ? <span>{shopAddress}</span> : null}
              {shopPhone ? <span>{shopPhone}</span> : null}
              {shopGstin ? <span>{shopGstin}</span> : null}
            </div>
          </div>
        </div>

        <div className="receipt-header-meta">
          <div className="receipt-header-line"><span>{t('invoice.billNo')}</span><strong>{invoice.invoiceNumber}</strong></div>
          <div className="receipt-header-line"><span>{t('invoice.date')}</span><strong>{stamp.date}</strong></div>
          <div className="receipt-header-line"><span>{t('invoice.time')}</span><strong>{stamp.time}</strong></div>
          <div className="receipt-header-line"><span>{t('invoice.cashier') || 'Cashier'}</span><strong>{cashierName}</strong></div>
          <div className="receipt-header-line"><span>{t('invoice.type')}</span><strong>{saleTypeLabel}</strong></div>
        </div>
      </div>

      <div className="receipt-body">
        <div className="receipt-panel">
          <div className="receipt-panel-title">{t('pos.customer')}</div>
          <div className="receipt-customer-card">
            <div className="receipt-customer-name">{customer ? customer.name : t('common.walkIn')}</div>
            {customer?.phone ? <div className="receipt-customer-meta">Phone: {customer.phone}</div> : null}
          </div>
        </div>

        {invoice.items && invoice.items.length > 0 ? (
          <div className="receipt-panel">
            <div className="receipt-panel-title">{t('invoice.items')}</div>
            <table className="receipt-items">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('pos.items')}</th>
                  <th className="num">{t('pos.qty')}</th>
                  <th className="num">{t('invoice.rate')}</th>
                  <th className="num">{t('pos.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={item.productId ?? index}>
                    <td className="receipt-row-index">{index + 1}</td>
                    <td className="receipt-item-name">
                      <span className="receipt-item-title">{item.productName}</span>
                      {item.productCode ? <span className="receipt-sub">[{item.productCode}]</span> : null}
                      {item.unit ? <span className="receipt-unit">{item.unit}</span> : null}
                    </td>
                    <td className="num">{formatQuantity(item.quantity)}{item.unit ? ` ${item.unit}` : ''}</td>
                    <td className="num">{money(item.unitPrice)}</td>
                    <td className="num">{money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="receipt-lower-grid">
          {payments.length > 0 ? (
            <div className="receipt-panel">
              <div className="receipt-panel-title">{t('pos.payment')}</div>
              <table className="receipt-payment-table">
                <thead>
                  <tr>
                    <th>{t('pos.method')}</th>
                    <th className="num">{t('pos.amount')}</th>
                    <th>{t('invoice.date')}</th>
                    <th>{t('invoice.time')}</th>
                    <th>{t('audit.user')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pmt) => {
                    const pmtStamp = dateTimeParts(pmt.paymentDate);
                    return (
                      <tr key={pmt.id}>
                        <td>{pmt.method === 'credit' ? t('pos.credit') : PAYMENT_METHOD_LABELS[pmt.method] || pmt.method}</td>
                        <td className="num">{money(pmt.amount)}</td>
                        <td>{pmtStamp.date}</td>
                        <td>{pmtStamp.time}</td>
                        <td>{pmt.receivedByName || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="receipt-panel totals-panel">
            <div className="receipt-panel-title">{t('pos.total')}</div>
            <div className="receipt-total-box">
              <div className="receipt-total-line">
                <span>{t('pos.totalQty') || 'Total Qty'}</span>
                <strong>{formatQuantity(totalQuantity)}</strong>
              </div>
              <div className="receipt-total-line">
                <span>{t('pos.subtotal')}</span>
                <strong>{money(invoice.subtotal)}</strong>
              </div>
              {Number(invoice.discountAmount) > 0 ? (
                <div className="receipt-total-line">
                  <span>{t('pos.discount')}</span>
                  <strong>- {money(invoice.discountAmount)}</strong>
                </div>
              ) : null}
              {hasGst && interState ? (
                <div className="receipt-total-line">
                  <span>{t('invoice.igst')}</span>
                  <strong>{money(igst)}</strong>
                </div>
              ) : null}
              {hasGst && !interState ? (
                <>
                  {cgst > 0 ? <div className="receipt-total-line"><span>{t('invoice.cgst')}</span><strong>{money(cgst)}</strong></div> : null}
                  {sgst > 0 ? <div className="receipt-total-line"><span>{t('invoice.sgst')}</span><strong>{money(sgst)}</strong></div> : null}
                </>
              ) : null}
              {hasGst ? (
                <div className="receipt-total-line total-gst">
                  <span>{t('invoice.gstTotal')}</span>
                  <strong>{money(invoice.taxAmount)}</strong>
                </div>
              ) : null}
              <div className="receipt-total-sep" />
              <div className="receipt-total-line total-major">
                <span>{t('pos.total')}</span>
                <strong>{money(invoice.totalAmount)}</strong>
              </div>
              <div className="receipt-total-line">
                <span>{t('pos.paid')}</span>
                <strong>{money(invoice.amountPaid)}</strong>
              </div>
              {balanceDue > 0 ? (
                <div className="receipt-total-line total-due">
                  <span>{t('pos.balanceDue')}</span>
                  <strong>{money(balanceDue)}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {showCreditSection ? (
          <div className="receipt-panel">
            <div className="receipt-panel-title">{t('invoice.credit')}</div>
            <div className="receipt-credit-grid">
              <div className="receipt-credit-label">{t('pos.customer')}</div>
              <div className="receipt-credit-value">{customer ? customer.name : t('common.walkIn')}</div>
              <div className="receipt-credit-label">{t('pos.amount')}</div>
              <div className="receipt-credit-value">{money(credit.amount)}</div>
              <div className="receipt-credit-label">{t('pos.balanceDue')}</div>
              <div className="receipt-credit-value">{money(balanceDue)}</div>
              <div className="receipt-credit-label">{t('pos.status')}</div>
              <div className="receipt-credit-value"><span className="receipt-credit-status">Outstanding</span></div>
            </div>
          </div>
        ) : null}

        <div className={`receipt-status ${balanceDue > 0 ? 'warning' : 'success'}`}>
          {statusNote}
        </div>
      </div>

      <div className="receipt-footer">
        <div className="receipt-thanks">{t('invoice.thankYou')}</div>
        <div className="receipt-foot-shop">{shopName}</div>
        <div className="receipt-sub">
          {t('invoice.title')} #{invoice.invoiceNumber} · {invoice.createdBy?.username || '—'} · {stamp.date}
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

              <InvoiceSheet invoice={detail} printerType={printerType} paperSize={paperSize} />
            </div>
          ) : null}
        </Modal>
      ) : null}

      {detail
        ? createPortal(
            <div id="invoice-print-portal">
              <InvoiceSheet invoice={detail} printerType={printerType} paperSize={paperSize} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}