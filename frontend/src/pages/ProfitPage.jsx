import { useCallback, useMemo, useState } from 'react';
import {
  FiAward,
  FiBarChart2,
  FiCalendar,
  FiChevronDown,
  FiCreditCard,
  FiInbox,
  FiLayers,
  FiPackage,
  FiPieChart,
  FiShoppingBag,
  FiRefreshCw,
  FiRotateCcw,
  FiShoppingCart,
  FiTrendingUp,
  FiDollarSign,
} from 'react-icons/fi';
import { useAsync } from '../hooks/useAsync.js';
import { revenueService } from '../services/revenue.service.js';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatMoney, formatCount, formatQuantity, formatDateOnly } from '../utils/format.js';

const TOP_LIMIT = 10;

const PRESET_DEFS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom Date Range' },
];

const TREND_MODES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const DONUT_COLORS = ['#16804b', '#2563c7', '#7c5cd6', '#f0a63b', '#0f9e9e', '#c83b43', '#4c9a3f', '#d66f2f'];

const PAYMENT_COLORS = {
  cash: '#16804b',
  upi: '#2563c7',
  card: '#7c5cd6',
  credit: '#f0a63b',
  bank_transfer: '#0f9e9e',
  other: '#94a3b8',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthWindow() {
  const today = new Date();
  return {
    fromDate: `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`,
    toDate: toDateStr(today),
  };
}

function deltaPercent(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function pctLabel(current, previous) {
  const delta = deltaPercent(current, previous);
  if (delta === null) return null;
  if (delta === 0) return 'Flat vs previous period';
  const direction = delta > 0 ? 'up' : 'down';
  return `${direction === 'up' ? '▲' : '▼'} ${Math.abs(delta)}% vs previous period`;
}

function niceCeil(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const normalized = v / pow;
  let nice = 10;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  return nice * pow;
}

function compactCurrency(value) {
  const n = Number(value) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  if (n === 0) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function shortDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return dateStr;
  return `${date.toLocaleDateString('en-IN', { day: 'numeric' })} ${date.toLocaleDateString('en-IN', { month: 'short' })}`;
}

function weekKey(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(date);
  monday.setDate(date.getDate() - day);
  return toDateStr(monday);
}

function monthLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.toLocaleDateString('en-IN', { month: 'short' })} '${String(date.getFullYear()).slice(2)}`;
}

function longDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return dateStr;
  return `${date.toLocaleDateString('en-IN', { weekday: 'long' })}, ${date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

function bucketSeries(daily, mode) {
  const map = new Map();
  for (const day of daily) {
    let key;
    if (mode === 'daily') key = day.date;
    else if (mode === 'weekly') key = weekKey(day.date);
    else if (mode === 'monthly') key = day.date.slice(0, 7);
    else key = day.date.slice(0, 4);

    const bucket = map.get(key) || { key, net: 0, gross: 0, orders: 0 };
    bucket.net += Number(day.netSalesRevenue) || 0;
    bucket.gross += Number(day.grossSalesRevenue) || 0;
    bucket.orders += Number(day.salesCount) || 0;
    map.set(key, bucket);
  }

  const buckets = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  return buckets.map((bucket) => {
    let label = bucket.key;
    if (mode === 'daily') label = shortDayLabel(bucket.key);
    else if (mode === 'weekly') label = shortDayLabel(bucket.key);
    else if (mode === 'monthly') label = monthLabel(bucket.key);
    else label = bucket.key.slice(2);
    return { ...bucket, value: bucket.net, label };
  });
}

function polarPoint(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function donutSlice(cx, cy, outer, inner, start, end) {
  const [ox1, oy1] = polarPoint(cx, cy, outer, start);
  const [ox2, oy2] = polarPoint(cx, cy, outer, end);
  const [ix1, iy1] = polarPoint(cx, cy, inner, start);
  const [ix2, iy2] = polarPoint(cx, cy, inner, end);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function fullRing(cx, cy, outer, inner) {
  return [
    `M ${(cx - outer).toFixed(2)} ${cy.toFixed(2)}`,
    `A ${outer} ${outer} 0 0 1 ${(cx + outer).toFixed(2)} ${cy.toFixed(2)}`,
    `A ${outer} ${outer} 0 0 1 ${(cx - outer).toFixed(2)} ${cy.toFixed(2)}`,
    `L ${(cx - inner).toFixed(2)} ${cy.toFixed(2)}`,
    `A ${inner} ${inner} 0 0 0 ${(cx + inner).toFixed(2)} ${cy.toFixed(2)}`,
    `A ${inner} ${inner} 0 0 0 ${(cx - inner).toFixed(2)} ${cy.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function DashboardInlineEmpty({ icon: Icon = FiInbox, title, message }) {
  return (
    <div className="dash-inline-empty">
      <span className="dash-inline-empty-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <p className="dash-inline-empty-title">{title}</p>
      {message ? <p className="dash-inline-empty-message">{message}</p> : null}
    </div>
  );
}

function TrendChart({ buckets, max }) {
  const gridRatios = [1, 0.75, 0.5, 0.25, 0];
  const labelStep = Math.max(1, Math.ceil(buckets.length / 14));
  return (
    <div className="sales-chart rev-trend-chart">
      <div className="sales-chart-y" aria-hidden="true">
        {gridRatios.map((ratio) => (
          <span key={ratio} style={{ top: `${(1 - ratio) * 100}%` }}>
            {compactCurrency(max * ratio)}
          </span>
        ))}
      </div>

      <div className="sales-chart-body">
        <div className="sales-chart-plot">
          <div className="sales-chart-grid" aria-hidden="true">
            {gridRatios.map((ratio) => (
              <i key={ratio} />
            ))}
          </div>
          <div className="sales-chart-bars">
            {buckets.map((bucket) => (
              <div
                key={bucket.key}
                className={`sales-chart-col${bucket.value > 0 ? '' : ' has-zero'}`}
                style={{ '--bar-h': `${bucket.percent}%` }}
              >
                <span className="sales-chart-tip">
                  {bucket.label}
                  {' · '}
                  {formatMoney(bucket.value)}
                  {bucket.orders > 0 ? ` · ${formatCount(bucket.orders)} orders` : ''}
                </span>
                <span className="sales-chart-bar" style={{ height: `${bucket.percent}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="sales-chart-x" aria-hidden="true">
          {buckets.map((bucket, index) => (
            <span key={bucket.key} className={index % labelStep === 0 ? '' : 'is-thinned'}>
              {index % labelStep === 0 ? bucket.label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentDonut({ segments, total }) {
  const cx = 100;
  const cy = 100;
  const outer = 92;
  const inner = 56;
  let angle = 0;

  const slices = segments.map((segment) => {
    const sweep = total > 0 ? (segment.amount / total) * 360 : 0;
    const path = segments.length === 1
      ? fullRing(cx, cy, outer, inner)
      : donutSlice(cx, cy, outer, inner, angle, angle + sweep);
    angle += sweep;
    return { ...segment, path };
  });

  return (
    <div className="category-donut">
      <div className="category-donut-chart">
        <svg viewBox="0 0 200 200" role="img" aria-label="Revenue by payment type">
          {slices.map((slice) => (
            <path key={slice.label} d={slice.path} fill={slice.color} className="donut-segment">
              <title>{`${slice.label} - ${formatMoney(slice.amount)} (${slice.percent}%)`}</title>
            </path>
          ))}
          <circle cx={cx} cy={cy} r={inner} className="donut-hole" />
          <text x={cx} y={cy - 2} className="donut-center-value" textAnchor="middle">
            {compactCurrency(total)}
          </text>
          <text x={cx} y={cy + 16} className="donut-center-label" textAnchor="middle">
            Gross revenue
          </text>
        </svg>
      </div>

      <ul className="category-legend">
        {segments.map((segment) => (
          <li key={segment.label} className="category-legend-item">
            <span className="category-legend-dot" style={{ background: segment.color }} aria-hidden="true" />
            <span className="category-legend-name" title={segment.paymentType}>
              {segment.label}
            </span>
            <span className="category-legend-value">{formatMoney(segment.amount)}</span>
            <span className="category-legend-percent">{segment.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionCard({ title, caption, icon: Icon, children, action }) {
  return (
    <section className="dash-card rev-card">
      <div className="dash-card-head">
        <div>
          <h2 className="dash-card-title">{title}</h2>
          {caption ? <p className="dash-card-caption">{caption}</p> : null}
        </div>
        {Icon ? (
          <span className="dash-card-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
        {action || null}
      </div>
      {children}
    </section>
  );
}

function RevenueKpi({ label, value, sub, tone, icon: Icon }) {
  return (
    <article className={`rev-kpi rev-kpi-${tone}`}>
      <div className="rev-kpi-top">
        <span className="rev-kpi-label">{label}</span>
        <span className="rev-kpi-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
      </div>
      <p className="rev-kpi-value">{value}</p>
      {sub ? <p className="rev-kpi-sub">{sub}</p> : null}
    </article>
  );
}

function LedgerRow({ label, value, tone = 'neutral', sign }) {
  return (
    <div className="rev-ledger-row">
      <span className="rev-ledger-label">{label}</span>
      <span className={`rev-ledger-value${tone !== 'neutral' ? ` tone-${tone}` : ''}`}>
        {sign ? `${sign}${formatMoney(value)}` : formatMoney(value)}
      </span>
    </div>
  );
}

function RevSkeleton() {
  return (
    <div className="rev-page" aria-busy="true" aria-label="Loading revenue dashboard">
      <div className="rev-head">
        <div>
          <div className="rev-skeleton rev-skeleton-title" />
          <div className="rev-skeleton rev-skeleton-line" style={{ width: 320 }} />
        </div>
        <div className="rev-skeleton rev-skeleton-pill" style={{ width: 300, height: 40 }} />
      </div>
      <div className="rev-kpi-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rev-skeleton rev-skeleton-card" />
        ))}
      </div>
      <div className="rev-charts-grid">
        <div className="rev-skeleton rev-skeleton-card" style={{ minHeight: 380 }} />
        <div className="rev-skeleton rev-skeleton-card" style={{ minHeight: 380 }} />
      </div>
      <div className="rev-skeleton rev-skeleton-card" style={{ minHeight: 300 }} />
      <div className="rev-split-grid">
        <div className="rev-skeleton rev-skeleton-card" style={{ minHeight: 320 }} />
        <div className="rev-skeleton rev-skeleton-card" style={{ minHeight: 320 }} />
      </div>
    </div>
  );
}

export default function ProfitPage() {
  const initial = useMemo(() => monthWindow(), []);
  const [preset, setPreset] = useState('month');
  const [fromDate, setFromDate] = useState(initial.fromDate);
  const [toDate, setToDate] = useState(initial.toDate);
  const [trendMode, setTrendMode] = useState('daily');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch } = useAsync(
    () =>
      revenueService.getDashboard({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        top: TOP_LIMIT,
      }),
    [fromDate, toDate]
  );

  function applyPreset(value) {
    let from = fromDate;
    let to = toDate;
    const today = new Date();
    if (value === 'today') {
      from = toDateStr(today);
      to = from;
    } else if (value === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      from = toDateStr(yesterday);
      to = from;
    } else if (value === 'week') {
      const start = new Date(today);
      start.setDate(start.getDate() - ((today.getDay() + 6) % 7));
      from = toDateStr(start);
      to = toDateStr(today);
    } else if (value === 'month') {
      from = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`;
      to = toDateStr(today);
    } else if (value === 'lastMonth') {
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      from = toDateStr(start);
      to = toDateStr(end);
    } else if (value === 'year') {
      from = `${today.getFullYear()}-01-01`;
      to = toDateStr(today);
    }
    setPreset(value);
    setFromDate(from);
    setToDate(to);
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const periodLabel = useMemo(
    () => `${fromDate ? formatDateOnly(fromDate) : 'start of records'} — ${toDate ? formatDateOnly(toDate) : 'today'}`,
    [fromDate, toDate]
  );

  const profit = useMemo(() => data?.profit ?? {}, [data]);
  const kpis = useMemo(() => data?.kpis ?? {}, [data]);
  const comparison = useMemo(() => data?.comparison ?? null, [data]);
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const payments = useMemo(() => data?.payments ?? [], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const topProducts = useMemo(() => data?.topProducts ?? [], [data]);

  const hasData = useMemo(() => {
    const sales = Number(kpis.totalSales) || 0;
    const revenue = Number(kpis.totalRevenue) || 0;
    const totalProfit = Number(kpis.totalProfit) || 0;
    const expenses = Number(profit.expenses) || 0;
    const otherIncome = Number(profit.otherIncome) || 0;
    const damageLoss = Number(profit.damageLoss) || 0;
    return (
      sales > 0 ||
      revenue > 0 ||
      totalProfit !== 0 ||
      expenses > 0 ||
      otherIncome > 0 ||
      damageLoss > 0 ||
      daily.length > 0 ||
      payments.length > 0
    );
  }, [daily.length, kpis.totalSales, kpis.totalRevenue, kpis.totalProfit, payments.length, profit.damageLoss, profit.expenses, profit.otherIncome]);

  const trendBuckets = useMemo(
    () => bucketSeries(daily, trendMode),
    [daily, trendMode]
  );

  const trend = useMemo(() => {
    const maxRaw = Math.max(...trendBuckets.map((bucket) => bucket.value), 0);
    const max = niceCeil(maxRaw);
    const buckets = trendBuckets.map((bucket) => ({
      ...bucket,
      percent: max > 0 ? (bucket.value / max) * 100 : 0,
    }));
    return { buckets, max, hasValues: maxRaw > 0 };
  }, [trendBuckets]);

  const paymentSegments = useMemo(() => {
    return payments.map((entry, index) => ({
      ...entry,
      color: PAYMENT_COLORS[entry.method] || DONUT_COLORS[index % DONUT_COLORS.length],
    }));
  }, [payments]);

  const paymentTotal = useMemo(
    () => paymentSegments.reduce((sum, segment) => sum + Number(segment.amount || 0), 0),
    [paymentSegments]
  );

  const categoryTotal = useMemo(
    () => categories.reduce((sum, category) => sum + Number(category.netSales || 0), 0),
    [categories]
  );

  const bestDay = useMemo(() => {
    if (!daily.length) return null;
    return daily.reduce((best, day) =>
      Number(day.netSalesRevenue || 0) > Number(best.netSalesRevenue || 0) ? day : best, daily[0]);
  }, [daily]);

  const revenueSub = useMemo(() => {
    const label = pctLabel(kpis.totalRevenue, comparison?.totalRevenue);
    if (label) return label;
    if (comparison && Number(comparison.totalRevenue) === 0 && Number(kpis.totalRevenue) > 0) {
      return 'New sales in this period';
    }
    return 'Net sales revenue';
  }, [comparison, kpis.totalRevenue]);

  const profitSub = useMemo(() => {
    const label = pctLabel(kpis.totalProfit, comparison?.totalProfit);
    if (label) return label;
    return 'After expenses & income';
  }, [comparison, kpis.totalProfit]);

  const kpiCards = useMemo(
    () => [
      {
        label: 'Total Revenue',
        value: formatMoney(kpis.totalRevenue),
        sub: revenueSub,
        tone: 'green',
        icon: FiTrendingUp,
      },
      {
        label: 'Total Sales',
        value: formatCount(kpis.totalSales),
        sub: `${formatCount(kpis.completedSaleCount || 0)} completed · ${formatCount(kpis.cancelledSalesCount || 0)} cancelled`,
        tone: 'blue',
        icon: FiShoppingCart,
      },
      {
        label: 'Average Order Value',
        value: formatMoney(kpis.averageOrderValue),
        sub: 'Revenue per order',
        tone: 'purple',
        icon: FiShoppingBag,
      },
      {
        label: 'Total Profit',
        value: formatMoney(kpis.totalProfit),
        sub: profitSub,
        tone: 'green',
        icon: FiDollarSign,
      },
      {
        label: 'Total Refunds',
        value: formatMoney(kpis.totalRefunds),
        sub: `${formatCount(kpis.returnedSalesCount || 0)} returned sale${Number(kpis.returnedSalesCount) === 1 ? '' : 's'}`,
        tone: 'orange',
        icon: FiRotateCcw,
      },
    ],
    [kpis, revenueSub, profitSub]
  );

  const topProductMax = useMemo(
    () => Math.max(...topProducts.map((product) => Number(product.netSales) || 0), 0),
    [topProducts]
  );

  const insights = useMemo(() => {
    const list = [];
    const revenueDelta = deltaPercent(kpis.totalRevenue, comparison?.totalRevenue);
    if (comparison && revenueDelta !== null) {
      list.push({
        icon: FiTrendingUp,
        title: revenueDelta >= 0 ? 'Revenue is growing' : 'Revenue is down',
        text:
          revenueDelta >= 0
            ? `Revenue increased ${Math.abs(revenueDelta)}% compared with the previous period.`
            : `Revenue decreased ${Math.abs(revenueDelta)}% compared with the previous period.`,
      });
    } else if (comparison && Number(comparison.totalRevenue) === 0 && Number(kpis.totalRevenue) > 0) {
      list.push({
        icon: FiTrendingUp,
        title: 'Fresh revenue',
        text: 'All revenue this period is new — the previous period had no sales.',
      });
    }

    if (topProducts.length) {
      const top = topProducts[0];
      list.push({
        icon: FiAward,
        title: 'Top product',
        text: `${top.productName} is the top revenue-generating product (${formatMoney(top.netSales)}).`,
      });
    }

    if (payments.length) {
      const top = payments[0];
      list.push({
        icon: FiCreditCard,
        title: 'Preferred payment method',
        text: `${top.label} is the most-used payment method at ${top.percent}% of revenue.`,
      });
    }

    if (bestDay && Number(bestDay.netSalesRevenue || 0) > 0) {
      list.push({
        icon: FiCalendar,
        title: 'Highest revenue day',
        text: `${longDayLabel(bestDay.date)} generated the most revenue (${formatMoney(bestDay.netSalesRevenue)}).`,
      });
    }

    if (Number(kpis.totalRefunds) > 0) {
      list.push({
        icon: FiRotateCcw,
        title: 'Refunds',
        text: `${formatMoney(kpis.totalRefunds)} was refunded across ${formatCount(kpis.returnedSalesCount)} returned sale(s).`,
      });
    }

    return list;
  }, [bestDay, comparison, kpis.totalRefunds, kpis.totalRevenue, kpis.returnedSalesCount, payments, topProducts]);

  if (loading && !data) return <RevSkeleton />;

  if (error && !data) {
    return (
      <ErrorState
        title="Unable to load revenue data"
        message={`${error.message} Please try again.`}
        status={error.status}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data) {
    return (
      <ErrorState
        title="Unable to load revenue data"
        message="The backend did not return a revenue summary. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!hasData) {
    return (
      <div className="rev-page">
        <header className="rev-head">
          <div>
            <h1 className="page-title">Revenue Dashboard</h1>
            <p className="page-intro">Track your sales, revenue, profit and business performance.</p>
          </div>
          <DateToolbar
            preset={preset}
            fromDate={fromDate}
            toDate={toDate}
            onPreset={applyPreset}
            onFromChange={(event) => {
              setPreset('custom');
              setFromDate(event.target.value);
            }}
            onToChange={(event) => {
              setPreset('custom');
              setToDate(event.target.value);
            }}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        </header>
        <EmptyState
          title="No revenue data available"
          description="There are no completed sales for the selected period. Every figure is computed from the real sales ledger — try a wider date range to see your revenue trend."
          actions={
            <button type="button" className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
              <FiRefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
              Refresh
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="rev-page">
      <header className="rev-head">
        <div>
          <h1 className="page-title">Revenue Dashboard</h1>
          <p className="page-intro">Track your sales, revenue, profit and business performance.</p>
        </div>
        <DateToolbar
          preset={preset}
          fromDate={fromDate}
          toDate={toDate}
          onPreset={applyPreset}
          onFromChange={(event) => {
            setPreset('custom');
            setFromDate(event.target.value);
          }}
          onToChange={(event) => {
            setPreset('custom');
            setToDate(event.target.value);
          }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      </header>

      <section className="rev-kpi-grid" aria-label="Key figures">
        {kpiCards.map((card) => (
          <RevenueKpi key={card.label} {...card} />
        ))}
      </section>

      <section className="rev-charts-grid">
        <SectionCard
          title="Revenue Trend"
          caption={periodLabel}
          icon={FiBarChart2}
          action={
            <div className="rev-seg" role="group" aria-label="Trend granularity">
              {TREND_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`rev-seg-btn${trendMode === mode.value ? ' is-active' : ''}`}
                  onClick={() => setTrendMode(mode.value)}
                  aria-pressed={trendMode === mode.value}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          }
        >
          {trend.hasValues ? (
            <TrendChart buckets={trend.buckets} max={trend.max} />
          ) : (
            <DashboardInlineEmpty
              icon={FiTrendingUp}
              title="No revenue in this period"
              message="The trend will appear here once sales are recorded in the selected range."
            />
          )}
          <div className="rev-chart-footer">
            <span className="rev-legend-chip"><i className="rev-legend-dot rev-dot-green" /> Net revenue</span>
            {profit.cogsMethod ? <span className="cell-sub">COGS: {profit.cogsMethod}</span> : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Revenue by Payment Type"
          caption="Share of gross revenue"
          icon={FiPieChart}
        >
          {paymentSegments.length ? (
            <PaymentDonut segments={paymentSegments} total={paymentTotal} />
          ) : (
            <DashboardInlineEmpty
              icon={FiPieChart}
              title="No payment data"
              message="Payment mix will appear here once payments are recorded."
            />
          )}
        </SectionCard>
      </section>

      <section className="rev-split-grid">
        <SectionCard
          title="Top Selling Products"
          caption={`Top ${topProducts.length ? topProducts.length : TOP_LIMIT} products by revenue this period`}
          icon={FiPackage}
        >
          {topProducts.length ? (
            <div className="dash-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th className="num">Quantity Sold</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, index) => (
                    <tr key={product.productId ?? `${product.productName}-${index}`}>
                      <td className="cell-index">{index + 1}</td>
                      <td>
                        <span className="dash-product-copy">
                          <span className="cell-main">{product.productName}</span>
                          <span className="rev-rank-track" aria-hidden="true">
                            <span
                              className="rev-rank-fill"
                              style={{ width: topProductMax > 0 ? `${(Number(product.netSales) / topProductMax) * 100}%` : '0%' }}
                            />
                          </span>
                          {product.sku ? <span className="cell-sub">{product.sku}</span> : null}
                        </span>
                      </td>
                      <td className="num">
                        {formatQuantity(product.netQuantity)}
                        {product.unit ? ` ${product.unit}` : ''}
                      </td>
                      <td className="num">{formatMoney(product.netSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiPackage}
              title="No products sold"
              message="Top products will appear here once sales are recorded."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Revenue by Category"
          caption="Net revenue share this period"
          icon={FiLayers}
        >
          {categories.length ? (
            <ul className="rev-ctg">
              {categories.map((category) => (
                <li key={category.categoryName} className="rev-ctg-row">
                  <div className="rev-ctg-top">
                    <span className="rev-ctg-name" title={category.categoryName}>{category.categoryName}</span>
                    <span className="rev-ctg-meta">
                      <strong>{formatMoney(category.netSales)}</strong>
                      <span className="rev-ctg-percent">{category.percent}%</span>
                    </span>
                  </div>
                  <span className="rev-ctg-track" aria-hidden="true">
                    <span
                      className="rev-ctg-fill"
                      style={{ width: categoryTotal > 0 ? `${category.percent}%` : '0%' }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardInlineEmpty
              icon={FiLayers}
              title="No category data"
              message="Category performance will appear here once sales are recorded."
            />
          )}
        </SectionCard>
      </section>

      <section className="rev-split-grid">
        <SectionCard
          title="Daily Revenue Summary"
          caption={periodLabel}
          icon={FiCalendar}
        >
          {daily.length ? (
            <div className="rev-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Revenue</th>
                    <th className="num">Orders</th>
                    <th className="num">Average Order Value</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((day) => (
                    <tr key={day.date}>
                      <td className="cell-main">{shortDayLabel(day.date)}</td>
                      <td className="num">{formatMoney(day.netSalesRevenue)}</td>
                      <td className="num">{formatCount(day.salesCount)}</td>
                      <td className="num">{formatMoney(day.averageOrderValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="cell-main">Total</td>
                    <td className="num">{formatMoney(kpis.totalRevenue)}</td>
                    <td className="num">{formatCount(kpis.totalSales)}</td>
                    <td className="num">{formatMoney(kpis.averageOrderValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiCalendar}
              title="No daily sales"
              message="Daily revenue will appear here once sales are recorded."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Profit Breakdown"
          caption="Direct from the /profit ledger"
          icon={FiDollarSign}
        >
          <div className="rev-ledger">
            <LedgerRow label="Gross Sales Revenue" value={profit.grossSalesRevenue} sign="+" tone="success" />
            <LedgerRow label="Returned Refunds" value={profit.returnedAmount} sign="−" tone="danger" />
            <LedgerRow label="Net Sales Revenue" value={profit.netSalesRevenue} tone="neutral" />
            <div className="rev-ledger-divider" />
            <LedgerRow label="Net Sales Revenue" value={profit.netSalesRevenue} />
            <LedgerRow label="Cost of Goods Sold" value={profit.costOfGoodsSold} sign="−" tone="danger" />
            <LedgerRow label="Damage / Wastage Loss" value={profit.damageLoss} sign="−" tone="danger" />
            <LedgerRow label="Expenses" value={profit.expenses} sign="−" tone="danger" />
            <LedgerRow label="Other Income" value={profit.otherIncome} sign="+" tone="success" />
            <LedgerRow
              label="Net Profit"
              value={profit.netProfit}
              sign={Number(profit.netProfit) >= 0 ? '+' : '−'}
              tone={Number(profit.netProfit) >= 0 ? 'success' : 'danger'}
            />
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Quick Insights"
        caption="Generated from the actual revenue data"
        icon={FiAward}
      >
        {insights.length ? (
          <ul className="rev-insights">
            {insights.map((insight, index) => (
              <li key={`${insight.title}-${index}`} className="rev-insight">
                <span className="rev-insight-icon" aria-hidden="true">
                  <insight.icon size={18} />
                </span>
                <div>
                  <p className="rev-insight-title">{insight.title}</p>
                  <p className="rev-insight-text">{insight.text}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardInlineEmpty
            icon={FiAward}
            title="Not enough data to generate insights"
            message="Insights are derived from real sales once the selected period has at least one recorded sale."
          />
        )}
      </SectionCard>
    </div>
  );
}

function DateToolbar({ preset, fromDate, toDate, onPreset, onFromChange, onToChange, refreshing, onRefresh }) {
  return (
    <div className="rev-toolbar" role="group" aria-label="Revenue period filters">
      <div className="dash-select-wrap">
        <select
          className="dash-select"
          aria-label="Preset period"
          value={preset}
          onChange={(event) => onPreset(event.target.value)}
        >
          {PRESET_DEFS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
      </div>

      <label className="toolbar-select">
        <span className="sr-only">From date</span>
        <input type="date" value={fromDate} onChange={onFromChange} aria-label="From date" />
      </label>
      <label className="toolbar-select">
        <span className="sr-only">To date</span>
        <input type="date" value={toDate} onChange={onToChange} aria-label="To date" />
      </label>

      <div className="rev-toolbar-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <FiRefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}