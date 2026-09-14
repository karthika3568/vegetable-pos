import { useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { reportsService } from '../services/reports.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import { formatMoney, formatQuantity, formatCount, formatDateOnly } from '../utils/format.js';

const LIMIT = 20;

const STATUS_LABELS = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
  active: 'Active',
  inactive: 'Inactive',
};

const PAYMENT_TYPE_LABELS = {
  cash: 'Cash',
  credit: 'Credit',
  partial: 'Partial',
};

const PRESETS = [
  { value: 'month', label: 'This Month' },
  { value: 'days30', label: 'Last 30 Days' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status || '—';
  return <span className={`badge badge-${status || 'default'}`}>{label}</span>;
}

function MoneyCell({ value, tone }) {
  return <span className={`money${tone ? ` tone-${tone}` : ''}`}>{formatMoney(value)}</span>;
}

function QtyCell({ value }) {
  return <span className="num-cell">{formatQuantity(value)}</span>;
}

const REPORTS = [
  {
    key: 'sales',
    label: 'Sales Report',
    description: 'Individual sales with totals, payments, balances and status for the period.',
    search: { placeholder: 'Invoice number or customer…' },
    status: ['completed', 'cancelled', 'returned'],
    paymentType: true,
    sortBy: ['date', 'total', 'status', 'id'],
    columns: [
      { key: 'invoice', label: 'Invoice', render: (r) => <span className="cell-main">{r.invoiceNumber}</span> },
      { key: 'date', label: 'Date', render: (r) => formatDateOnly(r.saleDate) },
      {
        key: 'customer',
        label: 'Customer',
        render: (r) => <span className="cell-main">{r.customerName || 'Walk-in Customer'}</span>,
      },
      {
        key: 'payment',
        label: 'Payment',
        render: (r) => (
          <span className="badge badge-default">{PAYMENT_TYPE_LABELS[r.paymentType] || r.paymentType || '—'}</span>
        ),
      },
      { key: 'total', label: 'Total', num: true, render: (r) => formatMoney(r.totalAmount) },
      { key: 'paid', label: 'Paid', num: true, render: (r) => formatMoney(r.paidAmount) },
      {
        key: 'balance',
        label: 'Balance',
        num: true,
        render: (r) =>
          Number(r.balanceDue) > 0 ? (
            <MoneyCell value={r.balanceDue} tone="danger" />
          ) : (
            formatMoney(0)
          ),
      },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { key: 'by', label: 'Recorded By', render: (r) => r.createdByName || '—' },
    ],
    summary: (s) => [
      { label: 'Sales', value: formatCount(s.salesCount) },
      { label: 'Cancelled', value: formatCount(s.cancelledSalesCount) },
      { label: 'Returned', value: formatCount(s.returnedSalesCount) },
      { label: 'Gross Sales', value: formatMoney(s.grossSalesRevenue) },
      { label: 'Returned Refunds', value: `−${formatMoney(s.returnedAmount)}`, tone: 'danger' },
      { label: 'Net Sales', value: formatMoney(s.netSalesRevenue), tone: 'success' },
      { label: 'Cash Received', value: formatMoney(s.cashReceived) },
      { label: 'Credit Outstanding', value: formatMoney(s.creditOutstanding), tone: 'warning' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchase Report',
    description: 'Individual purchases with quantities, totals and payments for the period.',
    search: { placeholder: 'Invoice number or supplier…' },
    status: ['completed', 'cancelled'],
    sortBy: ['date', 'total', 'supplier', 'id'],
    columns: [
      { key: 'invoice', label: 'Invoice', render: (r) => <span className="cell-main">{r.invoiceNumber}</span> },
      { key: 'date', label: 'Date', render: (r) => formatDateOnly(r.purchaseDate) },
      { key: 'supplier', label: 'Supplier', render: (r) => <span className="cell-main">{r.supplierName || '—'}</span> },
      { key: 'qty', label: 'Qty', num: true, render: (r) => formatQuantity(r.totalQuantity) },
      { key: 'items', label: 'Items', num: true, render: (r) => formatCount(r.itemCount) },
      { key: 'total', label: 'Total', num: true, render: (r) => formatMoney(r.totalAmount) },
      { key: 'paid', label: 'Paid', num: true, render: (r) => formatMoney(r.paidAmount) },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { key: 'by', label: 'Recorded By', render: (r) => r.createdByName || '—' },
    ],
    summary: (s) => [
      { label: 'Completed', value: formatCount(s.completedCount) },
      { label: 'Cancelled', value: formatCount(s.cancelledCount) },
      { label: 'Total Amount', value: formatMoney(s.totalAmount) },
      { label: 'Total Paid', value: formatMoney(s.totalPaid) },
      { label: 'Total Quantity', value: formatQuantity(s.totalQuantity) },
    ],
  },
  {
    key: 'expenses',
    label: 'Expense Report',
    description: 'Expense ledger rows with category filter for the period.',
    search: { placeholder: 'Description or category…' },
    category: true,
    sortBy: ['date', 'amount', 'category', 'id'],
    columns: [
      { key: 'date', label: 'Date', render: (r) => formatDateOnly(r.expenseDate) },
      { key: 'category', label: 'Category', render: (r) => <span className="cell-main">{r.category}</span> },
      { key: 'description', label: 'Description', render: (r) => r.description || '—' },
      { key: 'amount', label: 'Amount', num: true, render: (r) => <MoneyCell value={r.amount} tone="danger" /> },
      { key: 'by', label: 'Recorded By', render: (r) => r.createdByName || '—' },
    ],
    summary: (s) => [
      { label: 'Entries', value: formatCount(s.count) },
      { label: 'Total Amount', value: formatMoney(s.totalAmount), tone: 'danger' },
    ],
  },
  {
    key: 'income',
    label: 'Income Report',
    description: 'Income ledger rows (non-sales receipts) with category filter for the period.',
    search: { placeholder: 'Description or category…' },
    category: true,
    sortBy: ['date', 'amount', 'category', 'id'],
    columns: [
      { key: 'date', label: 'Date', render: (r) => formatDateOnly(r.incomeDate) },
      { key: 'category', label: 'Category', render: (r) => <span className="cell-main">{r.category}</span> },
      { key: 'description', label: 'Description', render: (r) => r.description || '—' },
      { key: 'amount', label: 'Amount', num: true, render: (r) => <MoneyCell value={r.amount} /> },
      { key: 'by', label: 'Recorded By', render: (r) => r.createdByName || '—' },
    ],
    summary: (s) => [
      { label: 'Entries', value: formatCount(s.count) },
      { label: 'Total Amount', value: formatMoney(s.totalAmount) },
    ],
  },
  {
    key: 'profit',
    label: 'Revenue Report',
    description: 'Revenue and profit summary computed from every business ledger for the period.',
    sortBy: null,
    columns: [],
    summary: null,
  },
  {
    key: 'stock',
    label: 'Stock Report',
    description: 'Stock levels with purchase, sale, return and adjustment quantities for the period.',
    search: { placeholder: 'Product name or SKU…' },
    sortBy: ['name', 'sku', 'current', 'id'],
    columns: [
      {
        key: 'product',
        label: 'Product',
        render: (r) => (
          <span>
            <span className="cell-main">{r.name}</span>
            {r.sku ? <span className="cell-sub">{r.sku}</span> : null}
          </span>
        ),
      },
      { key: 'category', label: 'Category', render: (r) => r.categoryName || '—' },
      { key: 'current', label: 'Current Qty', num: true, render: (r) => <QtyCell value={r.currentQuantity} /> },
      { key: 'purchased', label: 'Purchased', num: true, render: (r) => <QtyCell value={r.purchaseQty} /> },
      { key: 'sold', label: 'Sold', num: true, render: (r) => <QtyCell value={r.saleQty} /> },
      { key: 'returned', label: 'Returned', num: true, render: (r) => <QtyCell value={r.returnSaleQty} /> },
      { key: 'adjusted', label: 'Adjusted', num: true, render: (r) => <QtyCell value={r.adjustmentQty} /> },
      { key: 'cancelled', label: 'Cancelled', num: true, render: (r) => <QtyCell value={r.cancellationReversalQty} /> },
    ],
    summary: (s) => [
      { label: 'Products', value: formatCount(s.productCount) },
      { label: 'Total Current Qty', value: formatQuantity(s.totalCurrentQuantity) },
      { label: 'Transactions in Window', value: formatCount(s.transactionsInWindow) },
    ],
  },
  {
    key: 'credit',
    label: 'Credit Report',
    description: 'Customer credit balances with created, collected and reversed activity for the period.',
    status: ['active', 'inactive'],
    sortBy: ['balance', 'name', 'id'],
    columns: [
      { key: 'customer', label: 'Customer', render: (r) => <span className="cell-main">{r.name}</span> },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { key: 'limit', label: 'Limit', num: true, render: (r) => formatMoney(r.creditLimit) },
      {
        key: 'balance',
        label: 'Current Balance',
        num: true,
        render: (r) =>
          Number(r.currentBalance) > 0 ? <MoneyCell value={r.currentBalance} tone="danger" /> : formatMoney(0),
      },
      {
        key: 'created',
        label: 'Created',
        num: true,
        render: (r) => (
          <span>
            {formatMoney(r.createdAmount)}
            <span className="cell-sub">{formatCount(r.createdCount)} txns</span>
          </span>
        ),
      },
      {
        key: 'collected',
        label: 'Collected',
        num: true,
        render: (r) => (
          <span>
            {formatMoney(r.collectedAmount)}
            <span className="cell-sub">{formatCount(r.collectedCount)} txns</span>
          </span>
        ),
      },
      {
        key: 'reversed',
        label: 'Reversed',
        num: true,
        render: (r) => (
          <span>
            {formatMoney(r.reversedAmount)}
            <span className="cell-sub">{formatCount(r.reversedCount)} txns</span>
          </span>
        ),
      },
    ],
    summary: (s) => [
      { label: 'Total Outstanding', value: formatMoney(s.totalOutstanding), tone: 'danger' },
      { label: 'Customers w/ Outstanding', value: formatCount(s.outstandingCustomers) },
      { label: 'Created', value: formatMoney(s.createdAmount) },
      { label: 'Collected', value: formatMoney(s.collectedAmount) },
      { label: 'Reversed', value: formatMoney(s.reversedAmount) },
    ],
  },
  {
    key: 'customers',
    label: 'Customer Report',
    description: 'Per-customer sales totals for the period.',
    search: { placeholder: 'Customer name…' },
    sortBy: ['name', 'gross', 'salesCount'],
    columns: [
      {
        key: 'customer',
        label: 'Customer',
        render: (r) => <span className="cell-main">{r.customerName}</span>,
      },
      { key: 'sales', label: 'Sales', num: true, render: (r) => formatCount(r.salesCount) },
      { key: 'gross', label: 'Gross', num: true, render: (r) => formatMoney(r.grossSales) },
      { key: 'returns', label: 'Returns', num: true, render: (r) => <MoneyCell value={r.returnedAmount} tone="danger" /> },
      { key: 'net', label: 'Net Sales', num: true, render: (r) => <MoneyCell value={r.netSales} /> },
      { key: 'paid', label: 'Paid', num: true, render: (r) => formatMoney(r.paidAmount) },
      { key: 'balance', label: 'Balance Due', num: true, render: (r) => formatMoney(r.balanceDue) },
    ],
    summary: (s) => [
      { label: 'Customers With Sales', value: formatCount(s.customersWithSales) },
      { label: 'Sales Count', value: formatCount(s.salesCount) },
      { label: 'Gross Sales', value: formatMoney(s.grossSales) },
      { label: 'Returned', value: `−${formatMoney(s.returnedAmount)}`, tone: 'danger' },
      { label: 'Net Sales', value: formatMoney(s.netSales), tone: 'success' },
      { label: 'Paid', value: formatMoney(s.paidAmount) },
      { label: 'Balance Due', value: formatMoney(s.balanceDue), tone: 'warning' },
    ],
  },
  {
    key: 'products',
    label: 'Product Report',
    description: 'Per-product sold, returned and net sales quantities and values for the period.',
    search: { placeholder: 'Product name or SKU…' },
    sortBy: ['name', 'gross', 'quantitySold'],
    columns: [
      {
        key: 'product',
        label: 'Product',
        render: (r) => (
          <span>
            <span className="cell-main">{r.name}</span>
            {r.sku ? <span className="cell-sub">{r.sku} · {r.unit || 'unit'}</span> : null}
          </span>
        ),
      },
      { key: 'category', label: 'Category', render: (r) => r.categoryName || '—' },
      { key: 'sold', label: 'Sold', num: true, render: (r) => <QtyCell value={r.quantitySold} /> },
      { key: 'returned', label: 'Returned', num: true, render: (r) => <QtyCell value={r.quantityReturned} /> },
      { key: 'netQty', label: 'Net Qty', num: true, render: (r) => <QtyCell value={r.netQuantity} /> },
      { key: 'gross', label: 'Gross', num: true, render: (r) => formatMoney(r.grossSales) },
      { key: 'net', label: 'Net Sales', num: true, render: (r) => <MoneyCell value={r.netSales} /> },
    ],
    summary: (s) => [
      { label: 'Products', value: formatCount(s.productCount) },
      { label: 'Qty Sold', value: formatQuantity(s.quantitySold) },
      { label: 'Qty Returned', value: formatQuantity(s.quantityReturned) },
      { label: 'Net Qty', value: formatQuantity(s.netQuantity) },
      { label: 'Gross Sales', value: formatMoney(s.grossSales) },
      { label: 'Returned', value: `−${formatMoney(s.returnedAmount)}`, tone: 'danger' },
      { label: 'Net Sales', value: formatMoney(s.netSales), tone: 'success' },
    ],
  },
  {
    key: 'suppliers',
    label: 'Supplier Report',
    description: 'Per-supplier purchase volumes and totals for the period.',
    search: { placeholder: 'Supplier name…' },
    sortBy: ['name', 'total', 'purchaseCount'],
    columns: [
      { key: 'supplier', label: 'Supplier', render: (r) => <span className="cell-main">{r.supplierName}</span> },
      { key: 'purchases', label: 'Purchases', num: true, render: (r) => formatCount(r.purchaseCount) },
      { key: 'cancelled', label: 'Cancelled', num: true, render: (r) => formatCount(r.cancelledCount) },
      { key: 'qty', label: 'Total Qty', num: true, render: (r) => <QtyCell value={r.totalQuantity} /> },
      { key: 'total', label: 'Total Amount', num: true, render: (r) => formatMoney(r.totalAmount) },
    ],
    summary: (s) => [
      { label: 'Suppliers', value: formatCount(s.supplierCount) },
      { label: 'Completed Purchases', value: formatCount(s.completedPurchaseCount) },
      { label: 'Cancelled', value: formatCount(s.cancelledPurchaseCount) },
      { label: 'Total Quantity', value: formatQuantity(s.totalQuantity) },
      { label: 'Total Amount', value: formatMoney(s.totalAmount) },
    ],
  },
];

const REPORT_MAP = Object.fromEntries(REPORTS.map((report) => [report.key, report]));

function SummaryGrid({ items }) {
  return (
    <div className="summary-grid">
      {items.map((item) => (
        <div key={item.label} className="summary-item">
          <span className="summary-label">{item.label}</span>
          <span className={`summary-value${item.tone ? ` tone-${item.tone}` : ''}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function ReportSummary({ report }) {
  const summaryData = report.summaryData ?? {};
  const items = typeof report.summary === 'function' ? report.summary(summaryData) : [];
  return (
    <section className="detail-card">
      <div className="card-heading">
        <h2 className="card-title">Period Summary</h2>
      </div>
      <SummaryGrid items={items} />
    </section>
  );
}

function ProfitSummary({ data = {} }) {
  const safeData = data ?? {};
  const statementItems = [
    { label: 'Gross Sales Revenue', value: formatMoney(safeData.grossSalesRevenue ?? 0) },
    { label: 'Returned Refunds', value: `−${formatMoney(safeData.returnedAmount ?? 0)}`, tone: 'danger' },
    { label: 'Net Sales Revenue', value: formatMoney(safeData.netSalesRevenue ?? 0), tone: 'success' },
    { label: 'Cost of Goods Sold', value: `−${formatMoney(safeData.costOfGoodsSold ?? 0)}`, tone: 'danger' },
    { label: 'Gross Profit', value: formatMoney(safeData.grossProfit ?? 0), tone: 'success' },
    { label: 'Other Income', value: `+${formatMoney(safeData.otherIncome ?? 0)}` },
    { label: 'Expenses', value: `−${formatMoney(safeData.expenses ?? 0)}`, tone: 'danger' },
    {
      label: 'Net Profit',
      value: formatMoney(safeData.netProfit ?? 0),
      tone: Number(safeData.netProfit ?? 0) >= 0 ? 'success' : 'danger',
    },
  ];
  const activityItems = [
    { label: 'Active Sales', value: formatCount(safeData.salesCount ?? 0) },
    { label: 'Returned Sales', value: formatCount(safeData.returnedSalesCount ?? 0) },
    { label: 'Cancelled Sales', value: formatCount(safeData.cancelledSalesCount ?? 0) },
    { label: 'Cash Received', value: formatMoney(safeData.cashReceived ?? 0) },
    { label: 'Credit Outstanding', value: formatMoney(safeData.creditOutstanding ?? 0), tone: 'warning' },
    { label: 'Expense Entries', value: formatCount(safeData.expenseCount ?? 0) },
    { label: 'Income Entries', value: formatCount(safeData.incomeCount ?? 0) },
  ];
  return (
    <div className="dash-grid">
      <section className="detail-card">
        <div className="card-heading">
          <h2 className="card-title">Revenue Statement</h2>
        </div>
        <SummaryGrid items={statementItems} />
      </section>
      <section className="detail-card">
        <div className="card-heading">
          <h2 className="card-title">Period Activity</h2>
        </div>
        <SummaryGrid items={activityItems} />
      </section>
    </div>
  );
}

export default function ReportsPage() {
  const [active, setActive] = useState(REPORTS[0].key);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [page, setPage] = useState(1);

  const report = REPORT_MAP[active];
  const isProfit = active === 'profit';
  const showSearch = Boolean(report.search);
  const statusOptions = report.status || [];
  const showPaymentType = Boolean(report.paymentType);
  const showCategory = Boolean(report.category);
  const sortOptions = report.sortBy || [];

  const data = useAsync(
    () =>
      isProfit
        ? reportsService.getProfitSummary({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
          })
        : reportsService.getRowReport(active, {
            search: search || undefined,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            status: status || undefined,
            paymentType: paymentType || undefined,
            category: category || undefined,
            sortBy: sortBy || undefined,
            sortOrder: sortOrder || undefined,
            page,
            limit: LIMIT,
          }),
    [active, search, fromDate, toDate, status, paymentType, category, sortBy, sortOrder, page]
  );

  function selectReport(key) {
    if (key === active) return;
    setActive(key);
    setSearchInput('');
    setSearch('');
    setPreset('');
    setFromDate('');
    setToDate('');
    setStatus('');
    setPaymentType('');
    setCategory('');
    setSortBy('');
    setSortOrder('');
    setPage(1);
  }

  function applyPreset(value) {
    setPreset(value);
    const today = new Date();
    if (value === 'month') {
      setFromDate(toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      setToDate(toDateStr(today));
    } else if (value === 'days30') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setFromDate(toDateStr(start));
      setToDate(toDateStr(today));
    } else if (value === 'year') {
      setFromDate(`${today.getFullYear()}-01-01`);
      setToDate(toDateStr(today));
    } else if (value === 'all') {
      setFromDate('');
      setToDate('');
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleReset() {
    setSearchInput('');
    setSearch('');
    setPreset('');
    setFromDate('');
    setToDate('');
    setStatus('');
    setPaymentType('');
    setCategory('');
    setSortBy('');
    setSortOrder('');
    setPage(1);
  }

  function resetOnFilterChange(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  const summary = isProfit ? (data.data ?? {}) : (data.data?.summary ?? {});
  const items = data.data?.items ?? [];
  const pagination = data.data?.pagination ?? null;
  const hasFilters = Boolean(search || status || paymentType || category || fromDate || toDate);

  return (
    <div className="reports-page">
      <div className="page-heading">
        <h1 className="page-title">Reports</h1>
        <p className="page-intro">
          Row and aggregate reports served directly by the backend. The summary block always reflects the full period
          — row filters only scope the table below it.
        </p>
      </div>

      <div className="report-tabs" role="tablist" aria-label="Report type">
        {REPORTS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={active === entry.key}
            className={active === entry.key ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            onClick={() => selectReport(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <form className="toolbar-search" onSubmit={handleSearchSubmit} role="search">
          {showSearch ? (
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={report.search.placeholder}
              aria-label="Search this report"
            />
          ) : null}

          <label className="toolbar-select">
            <span className="sr-only">Period preset</span>
            <select value={preset} onChange={(event) => applyPreset(event.target.value)}>
              <option value="">Custom period</option>
              {PRESETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="toolbar-select">
            <span className="sr-only">From date</span>
            <input type="date" value={fromDate} onChange={resetOnFilterChange(setFromDate)} aria-label="From date" />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">To date</span>
            <input type="date" value={toDate} onChange={resetOnFilterChange(setToDate)} aria-label="To date" />
          </label>

          {statusOptions.length > 0 ? (
            <label className="toolbar-select">
              <span className="sr-only">Status filter</span>
              <select value={status} onChange={resetOnFilterChange(setStatus)}>
                <option value="">All statuses</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option] || option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showPaymentType ? (
            <label className="toolbar-select">
              <span className="sr-only">Payment type filter</span>
              <select value={paymentType} onChange={resetOnFilterChange(setPaymentType)}>
                <option value="">All payment types</option>
                <option value="cash">Cash</option>
                <option value="credit">Credit</option>
                <option value="partial">Partial</option>
              </select>
            </label>
          ) : null}

          {showCategory ? (
            <label className="toolbar-select">
              <span className="sr-only">Category filter</span>
              <input
                type="text"
                value={category}
                onChange={resetOnFilterChange(setCategory)}
                placeholder="Category (exact)"
                aria-label="Category filter"
              />
            </label>
          ) : null}

          {sortOptions.length > 0 ? (
            <label className="toolbar-select">
              <span className="sr-only">Sort by</span>
              <select value={sortBy} onChange={resetOnFilterChange(setSortBy)}>
                <option value="">Default order</option>
                {sortOptions.map((option) => (
                  <option key={option} value={option}>
                    Sort: {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="toolbar-select">
            <span className="sr-only">Sort order</span>
            <select value={sortOrder} onChange={resetOnFilterChange(setSortOrder)}>
              <option value="">Default</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>

          <button type="submit" className="btn btn-primary">
            Apply
          </button>
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Reset
          </button>
        </form>
      </div>

      <p className="dash-period" style={{ margin: '0 0 12px' }}>
        Period:{' '}
        <strong>
          {fromDate ? formatDateOnly(fromDate) : 'start of records'} — {toDate ? formatDateOnly(toDate) : 'today'}
        </strong>
      </p>

      {data.loading && !data.data ? <PageLoader label={`Loading ${report.label.toLowerCase()}…`} /> : null}

      {data.error && !data.data ? (
        <ErrorState
          title="Report unavailable"
          message={data.error.message}
          status={data.error.status}
          onRetry={() => data.refetch()}
        />
      ) : null}

      {data.data ? (
        <>
          {isProfit ? (
            <ProfitSummary data={summary} />
          ) : (
            <ReportSummary report={{ ...report, summaryData: summary }} />
          )}

          {!isProfit && data.loading ? (
            <div className="table-refreshing" style={{ margin: '12px 0' }}>
              Refreshing…
            </div>
          ) : null}

          {!isProfit ? (
            <div className="table-card">
              <div className="table-tools">
                <p className="table-count">
                  {pagination?.total ?? 0} row{pagination?.total === 1 ? '' : 's'}
                </p>
              </div>

              {items.length === 0 ? (
                <EmptyState
                  title={hasFilters ? 'No rows match your filters' : `No ${report.label.replace(' Report', '').toLowerCase()} rows in this period`}
                  description={
                    hasFilters
                      ? 'Try changing the search, status, category or date range.'
                      : 'Rows appear here as soon as the related transactions are recorded.'
                  }
                />
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {report.columns.map((column) => (
                            <th key={column.key} className={column.num ? 'num' : undefined}>
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row, index) => (
                          <tr key={row.id ?? row.customerId ?? row.productId ?? row.supplierId ?? index}>
                            {report.columns.map((column) => (
                              <td key={column.key} className={column.num ? 'num' : undefined}>
                                {column.render(row)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination page={pagination?.page ?? 1} totalPages={pagination?.totalPages ?? 1} onChange={setPage} />
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <p className="dashboard-note">
        Every figure and row is the exact value returned by the backend /reports API for the selected period — the page
        only formats money (2 decimals), quantities (3 decimals) and counts for display.
      </p>
    </div>
  );
}