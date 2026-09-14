import { useCallback, useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { profitService } from '../services/profit.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { formatMoney, formatCount, formatDateOnly } from '../utils/format.js';

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

function SummaryItem({ label, value, tone }) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <span className={`summary-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
    </div>
  );
}

function SummaryGrid({ items }) {
  if (!items.length) return null;
  return (
    <div className="summary-grid">
      {items.map((item) => (
        <SummaryItem key={item.label} {...item} />
      ))}
    </div>
  );
}

function SectionCard({ title, caption, children }) {
  return (
    <section className="detail-card">
      <div className="card-heading">
        <h2 className="card-title">{title}</h2>
        {caption ? <span className="card-caption">{caption}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function ProfitPage() {
  const [preset, setPreset] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch } = useAsync(
    () =>
      profitService.getSummary({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
    [fromDate, toDate]
  );

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

  function handleFromDateChange(event) {
    setPreset('');
    setFromDate(event.target.value);
  }

  function handleToDateChange(event) {
    setPreset('');
    setToDate(event.target.value);
  }

  function handleReset() {
    setPreset('all');
    setFromDate('');
    setToDate('');
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (loading && !data) return <PageLoader label="Calculating revenue…" />;

  if (error && !data) {
    return (
      <ErrorState
        title="Revenue unavailable"
        message={error.message}
        status={error.status}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) {
    return (
      <ErrorState
        title="No revenue summary"
        message="The backend did not return a financial summary. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const statementItems = [
    { label: 'Gross Sales Revenue', value: formatMoney(data.grossSalesRevenue) },
    { label: 'Returned Refunds', value: `−${formatMoney(data.returnedAmount)}`, tone: 'danger' },
    { label: 'Net Sales Revenue', value: formatMoney(data.netSalesRevenue), tone: 'success' },
    { label: 'Cost of Goods Sold', value: `−${formatMoney(data.costOfGoodsSold)}`, tone: 'danger' },
    { label: 'Gross Profit', value: formatMoney(data.grossProfit), tone: 'success' },
    { label: 'Other Income', value: `+${formatMoney(data.otherIncome)}` },
    { label: 'Expenses', value: `−${formatMoney(data.expenses)}`, tone: 'danger' },
    {
      label: 'Net Profit',
      value: formatMoney(data.netProfit),
      tone: Number(data.netProfit) >= 0 ? 'success' : 'danger',
    },
  ];

  const activityItems = [
    { label: 'Active Sales', value: formatCount(data.salesCount) },
    { label: 'Returned Sales', value: formatCount(data.returnedSalesCount) },
    { label: 'Cancelled Sales', value: formatCount(data.cancelledSalesCount) },
    { label: 'Cash Received', value: formatMoney(data.cashReceived) },
    { label: 'Credit Outstanding', value: formatMoney(data.creditOutstanding), tone: 'warning' },
    { label: 'Expense Entries', value: formatCount(data.expenseCount) },
    { label: 'Income Entries', value: formatCount(data.incomeCount) },
  ];

  const allZero = [
    data.grossSalesRevenue,
    data.returnedAmount,
    data.netSalesRevenue,
    data.costOfGoodsSold,
    data.grossProfit,
    data.expenses,
    data.otherIncome,
    data.netProfit,
    data.cashReceived,
    data.creditOutstanding,
  ].every((value) => Number(value) === 0);

  return (
    <div className="profit-page">
      <div className="page-heading">
        <h1 className="page-title">Revenue</h1>
        <p className="page-intro">
          Financial summary computed by the backend from the real sales, return, purchase, expense and income
          ledgers for the selected period.
        </p>
      </div>

      <div className="toolbar">
        <form
          className="toolbar-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            refetch();
          }}
        >
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
            <input type="date" value={fromDate} onChange={handleFromDateChange} aria-label="From date" />
          </label>

          <label className="toolbar-select">
            <span className="sr-only">To date</span>
            <input type="date" value={toDate} onChange={handleToDateChange} aria-label="To date" />
          </label>

          <button type="submit" className="btn btn-primary">
            Apply
          </button>
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Reset
          </button>
        </form>
      </div>

      <div className="dash-header" style={{ marginBottom: 12 }}>
        <p className="dash-period">
          Period:{' '}
          <strong>
            {fromDate ? formatDateOnly(fromDate) : 'start of records'} —{' '}
            {toDate ? formatDateOnly(toDate) : 'today'}
          </strong>
          {data.cogsMethod ? (
            <span className="cell-sub" style={{ marginLeft: 8 }}>
              · COGS: {data.cogsMethod}
            </span>
          ) : null}
        </p>
        <div className="dash-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? <div className="table-refreshing" style={{ marginBottom: 12 }}>Refreshing…</div> : null}

      {allZero ? (
        <div className="notice-bar notice-bar-muted" role="status">
          No sales, returns, purchases, expenses or income have been recorded in the selected period — every
          backend figure is ₹0.00. These are real backend results, not placeholder data.
        </div>
      ) : null}

      <div className="dash-grid">
        <SectionCard title="Revenue Statement">
          <SummaryGrid items={statementItems} />
        </SectionCard>

        <SectionCard title="Period Activity">
          <SummaryGrid items={activityItems} />
        </SectionCard>
      </div>

      <p className="dashboard-note">
        Every figure is the exact value returned by the backend /profit API for the selected period — the page
        only formats money with the standard 2-decimal convention and never recalculates totals.
      </p>
    </div>
  );
}