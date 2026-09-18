import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiArrowDownRight,
  FiArrowRight,
  FiArrowUpRight,
  FiBox,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiInbox,
  FiPackage,
  FiPieChart,
  FiPlus,
  FiRefreshCw,
  FiShoppingCart,
  FiTrendingUp,
  FiTruck,
  FiUsers,
  FiDollarSign,
} from 'react-icons/fi';
import { useAsync } from '../hooks/useAsync.js';
import { dashboardService } from '../services/dashboard.service.js';
import { revenueService } from '../services/revenue.service.js';
import { customerService } from '../services/customer.service.js';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { formatMoney, formatQuantity, formatCount } from '../utils/format.js';

// ---------------------------------------------------------------- helpers

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayString() {
  return toDateStr(new Date());
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

function startOfWeek(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  return toDateStr(date);
}

const PERIOD_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

function resolvePreset(preset, customFrom, customTo) {
  const today = todayString();
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { fromDate: yesterday, toDate: yesterday };
  }
  if (preset === 'week') {
    return { fromDate: startOfWeek(today), toDate: today };
  }
  if (preset === 'month') {
    return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
  }
  if (preset === 'custom') {
    const from = customFrom || today;
    const to = customTo || today;
    return { fromDate: from <= to ? from : to, toDate: from <= to ? to : from };
  }
  return { fromDate: today, toDate: today };
}

function periodNoun(preset) {
  switch (preset) {
    case 'yesterday':
      return 'Yesterday';
    case 'week':
      return 'This Week';
    case 'month':
      return 'This Month';
    case 'custom':
      return 'Selected Period';
    default:
      return 'Today';
  }
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

function deltaPercent(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function dayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return dateStr || '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortDayLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return dateStr || '';
  return `${date.toLocaleDateString('en-IN', { day: 'numeric' })} ${date.toLocaleDateString('en-IN', { month: 'short' })}`;
}

function weekKey(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day);
  return toDateStr(monday);
}

function monthLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.toLocaleDateString('en-IN', { month: 'short' })} '${String(date.getFullYear()).slice(2)}`;
}

function bucketSeries(daily, mode) {
  const map = new Map();
  for (const day of daily) {
    let key;
    if (mode === 'daily') key = day.date;
    else if (mode === 'weekly') key = weekKey(day.date);
    else key = day.date.slice(0, 7);

    const bucket = map.get(key) || { key, revenue: 0, orders: 0 };
    bucket.revenue += Number(day.netSalesRevenue) || 0;
    bucket.orders += Number(day.salesCount) || 0;
    map.set(key, bucket);
  }

  const buckets = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  return buckets.map((bucket) => {
    let label = bucket.key;
    if (mode === 'daily') label = shortDayLabel(bucket.key);
    else if (mode === 'weekly') label = shortDayLabel(bucket.key);
    else label = monthLabel(bucket.key);
    return {
      ...bucket,
      key: `${mode}-${bucket.key}`,
      label,
      start: mode === 'weekly' ? bucket.key : mode === 'daily' ? bucket.key : `${bucket.key}-01`,
      end: mode === 'weekly' ? addDays(bucket.key, 6) : mode === 'daily' ? bucket.key : `${bucket.key.slice(0, 8)}${String(31).slice(0, 2)}`,
    };
  });
}

function timeOfDay(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const MOVEMENT_LABELS = {
  purchase: 'Purchase',
  sale: 'Sale',
  return_purchase: 'Return Purchase',
  return_sale: 'Return Sale',
  adjustment: 'Adjustment',
  cancellation_reversal: 'Cancellation',
  damage: 'Damage',
};

const SALE_STATUS_LABELS = {
  completed: 'Completed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  credit: 'Credit',
  partial: 'Partial',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

function saleStatusClass(status) {
  if (status === 'returned') return 'st-out';
  if (status === 'cancelled') return 'st-out';
  return 'st-ok';
}

// ---------------------------------------------------------------- chart helpers (SVG)

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

// ---------------------------------------------------------------- tiny components

function Skeleton({ className }) {
  return <span className={`dash-skel ${className || ''}`} aria-hidden="true" />;
}

function DashboardInlineEmpty({ icon: Icon = FiInbox, title, message, action }) {
  return (
    <div className="dash-inline-empty">
      <span className="dash-inline-empty-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <p className="dash-inline-empty-title">{title}</p>
      {message ? <p className="dash-inline-empty-message">{message}</p> : null}
      {action || null}
    </div>
  );
}

function KpiCard({ label, value, sub, tone, icon: Icon, delta }) {
  return (
    <article className={`dash-stat-card ${tone}`}>
      <div className="dash-stat-top">
        <span className="dash-stat-label">{label}</span>
        <span className="dash-stat-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
      </div>
      <p className="dash-stat-value">{value}</p>
      <p className="dash-stat-sub">{sub}</p>
      {delta ? <span className={`dash-stat-delta ${delta.up ? 'is-up' : 'is-down'}`}>{delta.text}</span> : null}
    </article>
  );
}

function SectionCard({ title, caption, icon: Icon, action, children, className }) {
  return (
    <article className={`dash-card ${className || ''}`}>
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
    </article>
  );
}

function TrendAreaChart({ buckets, max }) {
  const W = 640;
  const H = 210;
  const PAD = 10;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const n = buckets.length;
  const x = (index) => (n > 1 ? PAD + (index * innerW) / (n - 1) : PAD + innerW / 2);
  const y = (value) => PAD + innerH - (max > 0 ? (Number(value) / max) * innerH : 0);
  const gridRatios = [1, 0.75, 0.5, 0.25, 0];

  const revenuePath = buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(b.revenue).toFixed(1)}`).join(' ');
  const areaPath = buckets.length
    ? `${revenuePath} L ${x(n - 1).toFixed(1)} ${(H - PAD).toFixed(1)} L ${x(0).toFixed(1)} ${(H - PAD).toFixed(1)} Z`
    : '';
  const ordersPath = buckets.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(b.orders).toFixed(1)}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="dash-trend-chart">
      <div className="sales-chart-y" aria-hidden="true">
        {gridRatios.map((ratio) => (
          <span key={ratio} style={{ top: `${(1 - ratio) * 100}%` }}>
            {compactCurrency(max * ratio)}
          </span>
        ))}
      </div>
      <div className="dash-trend-body">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Sales revenue trend">
          {gridRatios.map((ratio) => (
            <line
              key={ratio}
              x1={PAD}
              x2={W - PAD}
              y1={y(max * ratio)}
              y2={y(max * ratio)}
              className="dash-trend-grid"
            />
          ))}
          {areaPath ? <path d={areaPath} className="dash-trend-area" /> : null}
          {revenuePath ? <path d={revenuePath} className="dash-trend-line" /> : null}
          {ordersPath && n > 1 ? <path d={ordersPath} className="dash-trend-orders" /> : null}
          {buckets.map((bucket, i) => (
            <g key={bucket.key}>
              <circle cx={x(i)} cy={y(bucket.revenue)} r={3.5} className="dash-trend-point" />
              <title>{`${dayLabel(bucket.start)}${bucket.end !== bucket.start ? ` – ${dayLabel(bucket.end)}` : ''}\nRevenue ${formatMoney(bucket.revenue)}\n${formatCount(bucket.orders)} sale(s)`}</title>
            </g>
          ))}
        </svg>
        <div className="sales-chart-x" aria-hidden="true">
          {buckets.map((bucket, i) => (
            <span
              key={bucket.key}
              style={{ left: `${(n > 1 ? (i / (n - 1)) * 100 : 50).toFixed(2)}%` }}
              className={i % labelStep === 0 ? '' : 'is-thinned'}
            >
              {i % labelStep === 0 ? bucket.label : ''}
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
        <svg viewBox="0 0 200 200" role="img" aria-label="Payment mix">
          {slices.map((slice) => (
            <path key={slice.label} d={slice.path} fill={slice.color} className="donut-segment">
              <title>{`${slice.label}\nSales: ${formatMoney(slice.amount)}\nShare: ${slice.percent}%`}</title>
            </path>
          ))}
          <circle cx={cx} cy={cy} r={inner} className="donut-hole" />
          <text x={cx} y={cy - 2} className="donut-center-value" textAnchor="middle">
            {compactCurrency(total)}
          </text>
          <text x={cx} y={cy + 16} className="donut-center-label" textAnchor="middle">
            Total sales
          </text>
        </svg>
      </div>
      <ul className="category-legend">
        {segments.map((segment) => (
          <li key={segment.label} className="category-legend-item">
            <span className="category-legend-dot" style={{ background: segment.color }} aria-hidden="true" />
            <span className="category-legend-name" title={segment.label}>
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

function LoadingDashboard() {
  return (
    <div className="dashboard-page" aria-busy="true">
      <div className="dash-hero">
        <div className="dash-hero-copy">
          <Skeleton className="dash-skel-title" />
          <Skeleton className="dash-skel-sub" />
        </div>
      </div>
      <div className="dash-kpi-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="dash-stat-card dash-stat-card-skeleton">
            <Skeleton className="dash-skel-line" />
            <Skeleton className="dash-skel-big" />
          </div>
        ))}
      </div>
      <div className="dash-main-grid">
        <div className="dash-card">
          <Skeleton className="dash-skel-line" />
          <Skeleton className="dash-skel-chart" />
        </div>
        <div className="dash-card">
          <Skeleton className="dash-skel-line" />
          <Skeleton className="dash-skel-table" />
        </div>
      </div>
      <div className="dash-main-grid">
        <div className="dash-card">
          <Skeleton className="dash-skel-line" />
          <Skeleton className="dash-skel-table" />
        </div>
        <div className="dash-card">
          <Skeleton className="dash-skel-line" />
          <Skeleton className="dash-skel-table" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

const PAYMENT_COLORS = {
  cash: '#16804b',
  upi: '#2563c7',
  card: '#8a5cd6',
  credit: '#e0a32a',
  bank_transfer: '#0f9e9e',
  other: '#94a3b8',
};

const TREND_MODES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function DashboardPage() {
  const [preset, setPreset] = useState('today');
  const [customFrom, setCustomFrom] = useState(todayString());
  const [customTo, setCustomTo] = useState(todayString());
  const [trendMode, setTrendMode] = useState('daily');
  const [refreshing, setRefreshing] = useState(false);

  const period = useMemo(() => resolvePreset(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const noun = periodNoun(preset);

  const { data, loading, error, refetch } = useAsync(async () => {
    const summary = await dashboardService.getSummary({ fromDate: period.fromDate, toDate: period.toDate, top: 5 });
    return summary ?? {};
  }, [period.fromDate, period.toDate]);

  const revenue = useAsync(async () => {
    const payload = await revenueService.getDashboard({ fromDate: period.fromDate, toDate: period.toDate, top: 5 });
    return payload ?? {};
  }, [period.fromDate, period.toDate]);

  const customers = useAsync(async () => {
    const payload = await customerService.list({ page: 1, limit: 1 });
    return payload ?? {};
  }, []);

  const handleRefresh = useMemo(
    () => async () => {
      setRefreshing(true);
      try {
        await Promise.all([refetch(), revenue.refetch(), customers.refetch()]);
      } finally {
        setRefreshing(false);
      }
    },
    [refetch, revenue.refetch, customers.refetch]
  );

  // ---------- derived data ----------
  const sales = useMemo(() => data?.sales ?? {}, [data]);
  const profit = useMemo(() => data?.profit ?? {}, [data]);
  const stock = useMemo(() => data?.stock ?? {}, [data]);
  const credit = useMemo(() => data?.credit ?? {}, [data]);
  const purchases = useMemo(() => data?.purchases ?? {}, [data]);
  const expenses = useMemo(() => data?.expenses ?? {}, [data]);
  const lowStock = useMemo(() => data?.lowStock ?? [], [data]);
  const recentSales = useMemo(() => data?.recentSales ?? [], [data]);
  const recentMovements = useMemo(() => data?.recentMovements ?? [], [data]);
  const pendingOrders = useMemo(() => data?.pendingOrders ?? [], [data]);
  const revenueData = useMemo(() => revenue.data ?? {}, [revenue.data]);

  const customerTotal = useMemo(() => {
    const total = Number(customers.data?.pagination?.total ?? 0);
    return Number.isFinite(total) ? total : 0;
  }, [customers.data]);

  const comparison = useMemo(() => revenueData.comparison ?? null, [revenueData]);

  const kpiDelta = (current, previous) => {
    const delta = deltaPercent(current, previous);
    if (delta === null) return null;
    const up = delta >= 0;
    return {
      up,
      text: `${up ? '▲' : '▼'} ${Math.abs(delta)}% vs previous period`,
    };
  };

  const kpiCards = useMemo(() => {
    const vsSales = comparison ? kpiDelta(sales.netSalesRevenue, comparison.totalRevenue) : null;
    const vsProfit = comparison ? kpiDelta(profit.netProfit, comparison.totalProfit) : null;
    return [
      {
        label: `${noun} Sales`,
        value: formatMoney(sales.netSalesRevenue),
        sub: `${formatCount(sales.saleCount || 0)} transactions · ${formatCount(sales.completedSaleCount || 0)} completed`,
        icon: FiShoppingCart,
        tone: 'tone-sales',
        delta: vsSales,
      },
      {
        label: 'Cash Received',
        value: formatMoney(sales.cashReceived),
        sub: `${formatMoney(sales.creditSales)} on credit sales`,
        icon: FiDollarSign,
        tone: 'tone-cash',
      },
      {
        label: 'Credit Outstanding',
        value: formatMoney(credit.currentOutstanding),
        sub: `${formatCount(credit.customersWithOutstanding || 0)} customers with balance`,
        icon: FiCreditCard,
        tone: 'tone-credit',
      },
      {
        label: `${noun} Profit`,
        value: formatMoney(profit.netProfit),
        sub: `Gross ${formatMoney(profit.grossProfit)} · Expenses ${formatMoney(profit.expenses)}`,
        icon: FiTrendingUp,
        tone: 'tone-profit',
        delta: vsProfit,
      },
      {
        label: 'Total Customers',
        value: formatCount(customerTotal),
        sub: `${formatCount(credit.customersWithOutstanding || 0)} currently on credit`,
        icon: FiUsers,
        tone: 'tone-customers',
      },
      {
        label: 'Stock Value',
        value: formatMoney(stock.inventoryValue),
        sub: `${formatCount(stock.totalProducts || 0)} products in catalog`,
        icon: FiPackage,
        tone: 'tone-stock',
      },
    ];
  }, [noun, sales, credit, profit, customerTotal, stock, comparison]);

  const trendBuckets = useMemo(() => {
    const daily = revenueData.daily ?? [];
    return { buckets: bucketSeries(daily, trendMode), hasValues: (daily || []).length > 0 };
  }, [revenueData, trendMode]);

  const trendMax = useMemo(
    () => niceCeil(Math.max.apply(null, [0, ...trendBuckets.buckets.map((b) => b.revenue), ...trendBuckets.buckets.map((b) => b.orders)])),
    [trendBuckets]
  );

  const paymentSegments = useMemo(() => {
    const payments = revenueData.payments ?? [];
    const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return payments.map((p) => ({
      label: p.label || p.method || 'Other',
      amount: Number(p.amount || 0),
      percent: total > 0 ? Number(((Number(p.amount || 0) / total) * 100).toFixed(1)) : 0,
      color: PAYMENT_COLORS[p.method] || '#94a3b8',
    }));
  }, [revenueData]);

  const paymentTotal = useMemo(
    () => paymentSegments.reduce((sum, s) => sum + s.amount, 0),
    [paymentSegments]
  );

  const topProducts = useMemo(() => {
    const source = Array.isArray(revenueData.topProducts) && revenueData.topProducts.length
      ? revenueData.topProducts
      : data?.topProducts ?? [];
    return source.slice(0, 5);
  }, [revenueData, data]);

  const saleStatusChips = useMemo(
    () => [
      { label: 'Total', value: formatCount(sales.saleCount || 0) },
      { label: 'Completed', value: formatCount(sales.completedSaleCount || 0) },
      { label: 'Cancelled', value: formatCount(sales.cancelledSaleCount || 0) },
      { label: 'Returned', value: formatCount(sales.returnedSaleCount || 0) },
    ],
    [sales]
  );

  const alerts = useMemo(() => {
    const list = [];
    if (stock.lowStockCount > 0) {
      list.push({
        key: 'low-stock',
        icon: FiAlertTriangle,
        text: `${formatCount(stock.lowStockCount)} products need restocking (${formatCount(stock.outOfStockCount || 0)} out of stock)`,
        to: '/stock',
      });
    }
    if ((credit.customersWithOutstanding || 0) > 0) {
      list.push({
        key: 'credit',
        icon: FiCreditCard,
        text: `${formatCount(credit.customersWithOutstanding)} customers have outstanding credit (${formatMoney(credit.currentOutstanding)})`,
        to: '/credits',
      });
    }
    if ((purchases.unpaidPurchaseCount || 0) > 0) {
      list.push({
        key: 'unpaid-purchases',
        icon: FiTruck,
        text: `${formatCount(purchases.unpaidPurchaseCount)} purchases are still unpaid`,
        to: '/purchases',
      });
    }
    if (pendingOrders.length > 0) {
      list.push({
        key: 'pending-orders',
        icon: FiClock,
        text: `${formatCount(pendingOrders.length)} purchase order(s) are pending`,
        to: '/purchases',
      });
    }
    if ((stock.outOfStockCount || 0) > 0) {
      list.push({
        key: 'out-of-stock',
        icon: FiBox,
        text: `${formatCount(stock.outOfStockCount)} products are out of stock`,
        to: '/stock',
      });
    }
    return list;
  }, [stock, credit, purchases, pendingOrders]);

  const insights = useMemo(() => {
    const list = [];
    if (topProducts.length && Number(topProducts[0].netSales) > 0) {
      list.push({
        key: 'top-product',
        icon: FiTrendingUp,
        text: `“${topProducts[0].productName}” generated the highest sales in ${noun.toLowerCase()} — ${formatMoney(topProducts[0].netSales)}.`,
      });
    }
    if (paymentSegments.length && paymentSegments[0].amount > 0) {
      list.push({
        key: 'payment-method',
        icon: FiDollarSign,
        text: `${paymentSegments[0].label} was the most-used payment method in ${noun.toLowerCase()} (${formatMoney(paymentSegments[0].amount)}).`,
      });
    }
    if ((expenses.categories || []).length && Number(expenses.categories[0].total) > 0) {
      list.push({
        key: 'top-expense',
        icon: FiPieChart,
        text: `${expenses.categories[0].category} is the largest expense in ${noun.toLowerCase()} (${formatMoney(expenses.categories[0].total)}).`,
      });
    }
    if ((credit.customersWithOutstanding || 0) > 0) {
      list.push({
        key: 'credit-focus',
        icon: FiCreditCard,
        text: `Credit outstanding of ${formatMoney(credit.currentOutstanding)} is spread across ${formatCount(credit.customersWithOutstanding)} customers.`,
      });
    }
    if ((sales.cashReceived || 0) > 0) {
      list.push({
        key: 'cash-pos',
        icon: FiCheckCircle,
        text: `${formatMoney(sales.cashReceived)} was collected in cash this ${noun.toLowerCase()}.`,
      });
    }
    return list;
  }, [topProducts, paymentSegments, expenses, credit, sales, noun]);

  // ---------- states ----------
  if (loading && !data) return <LoadingDashboard />;

  if (error && !data) {
    return (
      <ErrorState
        title="Unable to load dashboard data"
        message={error.message}
        status={error.status}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <EmptyState
        title="No dashboard data"
        description="No dashboard figures are available right now. Try refreshing or check that the backend is running."
      />
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dash-hero">
        <div className="dash-hero-copy">
          <h1 className="dash-welcome">Dashboard</h1>
          <p className="dash-subtitle">Good morning! Here&apos;s what&apos;s happening in your shop today.</p>
        </div>
        <div className="dash-hero-right">
          <span className="dash-today">
            <FiCalendar size={15} />
            <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </span>
          <button
            type="button"
            className="btn btn-outline dash-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <FiRefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="dash-period" aria-label="Dashboard period filter">
        <div className="dash-period-presets" role="group" aria-label="Period">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`dash-period-btn${preset === p.value ? ' is-active' : ''}`}
              onClick={() => setPreset(p.value)}
              aria-pressed={preset === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="dash-period-custom">
            <label>
              <span>From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value || todayString())} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value || todayString())} />
            </label>
          </div>
        ) : (
          <span className="dash-period-summary">
            {dayLabel(period.fromDate)}{period.fromDate !== period.toDate ? ` — ${dayLabel(period.toDate)}` : ''}
          </span>
        )}
      </section>

      <section className="dash-kpi-grid" aria-label="Key business figures">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </section>

      <section className="dash-main-grid">
        <SectionCard
          className="dash-card-wide"
          title="Sales & Revenue Trend"
          caption={`${noun} · ${dayLabel(period.fromDate)}${period.fromDate !== period.toDate ? ` — ${dayLabel(period.toDate)}` : ''}`}
          icon={FiTrendingUp}
          action={
            <div className="dash-seg" role="group" aria-label="Trend granularity">
              {TREND_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`dash-seg-btn${trendMode === mode.value ? ' is-active' : ''}`}
                  onClick={() => setTrendMode(mode.value)}
                  aria-pressed={trendMode === mode.value}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          }
        >
          {revenue.loading && !revenueData.daily ? (
            <div className="dash-card-body-loading" role="status">
              <Skeleton className="dash-skel-chart" />
            </div>
          ) : revenue.error && !revenueData.daily ? (
            <DashboardInlineEmpty
              icon={FiAlertTriangle}
              title="Could not load trend"
              message={revenue.error.message}
              action={
                <button type="button" className="btn btn-outline btn-sm" onClick={() => revenue.refetch()}>
                  Retry
                </button>
              }
            />
          ) : trendBuckets.hasValues ? (
            <>
              <TrendAreaChart buckets={trendBuckets.buckets} max={trendMax} />
              <div className="dash-chart-footer">
                <span className="rev-legend-chip"><i className="rev-legend-dot rev-dot-green" /> Revenue</span>
                <span className="rev-legend-chip"><i className="rev-legend-dot rev-dot-blue" /> Transactions</span>
                <span className="cell-sub">Tooltip shows date, revenue and sales count.</span>
              </div>
            </>
          ) : (
            <DashboardInlineEmpty
              icon={FiTrendingUp}
              title="No sales in this period"
              message="Sales trend will appear here once transactions are recorded."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Today's Sales Summary"
          caption={noun}
          icon={FiPieChart}
        >
          {Number(sales.saleCount || 0) === 0 ? (
            <DashboardInlineEmpty
              icon={FiShoppingCart}
              title="No sales yet"
              message={`No sales recorded ${noun.toLowerCase()}. Start a new sale to see your performance here.`}
              action={
                <Link to="/pos" className="btn btn-primary btn-sm">
                  <FiPlus size={14} /> New Sale
                </Link>
              }
            />
          ) : (
            <>
              <div className="dash-chip-grid">
                {saleStatusChips.map((chip) => (
                  <div key={chip.label} className="dash-chip">
                    <span className="dash-chip-label">{chip.label}</span>
                    <span className="dash-chip-value">{chip.value}</span>
                  </div>
                ))}
              </div>
              {paymentSegments.length ? (
                <PaymentDonut segments={paymentSegments} total={paymentTotal} />
              ) : (
                <DashboardInlineEmpty
                  icon={FiDollarSign}
                  title="No payment data"
                  message="Payment method breakdown will appear once sales are recorded."
                />
              )}
            </>
          )}
        </SectionCard>
      </section>

      <section className="dash-main-grid">
        <SectionCard
          title="Top Selling Products"
          caption={`Top 5 by sales — ${noun.toLowerCase()}`}
          icon={FiShoppingCart}
          action={
            <Link to="/analytics" className="dash-card-link">
              View All <FiArrowRight size={14} />
            </Link>
          }
        >
          {topProducts.length ? (
            <table className="data-table dash-compact-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Quantity Sold</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.productName}</td>
                    <td className="num">
                      {formatQuantity(p.netQuantity)} {p.unit ? p.unit : ''}
                    </td>
                    <td className="num">{formatMoney(p.netSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <DashboardInlineEmpty
              icon={FiShoppingCart}
              title="No products sold"
              message="Products you sell in this period will be ranked here."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Recent Sales"
          caption="Latest completed sales"
          icon={FiInbox}
          action={
            <Link to="/sales" className="dash-card-link">
              View Sales <FiArrowRight size={14} />
            </Link>
          }
        >
          {recentSales.length ? (
            <div className="dash-table-wrap">
              <table className="data-table dash-compact-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Time</th>
                    <th>Customer</th>
                    <th className="num">Items</th>
                    <th className="num">Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr key={sale.saleId}>
                      <td>
                        <Link to="/sales" className="cell-sub">
                          {sale.invoiceNumber}
                        </Link>
                      </td>
                      <td>{timeOfDay(sale.saleDate)}</td>
                      <td>{sale.customer}</td>
                      <td className="num">{sale.itemCount ?? '—'}</td>
                      <td className="num">{formatMoney(sale.totalAmount)}</td>
                      <td>{sale.paymentMethod ? PAYMENT_METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod : '—'}</td>
                      <td>
                        <span className={`st-badge ${saleStatusClass(sale.status)}`}>
                          {SALE_STATUS_LABELS[sale.status] || sale.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiInbox}
              title="No sales yet"
              message="Recent sales will be listed here once you complete a sale."
            />
          )}
        </SectionCard>
      </section>

      <section className="dash-main-grid">
        <SectionCard
          title="Stock Overview"
          caption="Current inventory snapshot"
          icon={FiPackage}
          action={
            <Link to="/stock" className="dash-card-link">
              View Stock <FiArrowRight size={14} />
            </Link>
          }
        >
          <div className="dash-stock-tiles">
            <div className="dash-stock-tile">
              <span className="dash-stock-tile-label">In Stock</span>
              <span className="dash-stock-tile-value st-ok">{formatCount(stock.inStockCount)}</span>
            </div>
            <div className="dash-stock-tile">
              <span className="dash-stock-tile-label">Low Stock</span>
              <span className="dash-stock-tile-value st-low">{formatCount(stock.lowStockCount)}</span>
            </div>
            <div className="dash-stock-tile">
              <span className="dash-stock-tile-label">Out of Stock</span>
              <span className="dash-stock-tile-value st-out">{formatCount(stock.outOfStockCount)}</span>
            </div>
          </div>
          <div className="dash-stock-breakdown" aria-hidden="true">
            {(() => {
              const total = Math.max(1, Number(stock.totalProducts || 0));
              const inPct = ((Number(stock.inStockCount || 0) / total) * 100).toFixed(1);
              const lowPct = ((Number(stock.lowStockCount || 0) / total) * 100).toFixed(1);
              return (
                <div className="dash-stock-bar">
                  <i className="dash-stock-seg is-in" style={{ width: `${inPct}%` }} />
                  <i className="dash-stock-seg is-low" style={{ width: `${lowPct}%` }} />
                  <i className="dash-stock-seg is-out" style={{ width: `${Math.max(0, 100 - inPct - lowPct)}%` }} />
                </div>
              );
            })()}
          </div>
          <p className="dash-stock-value">
            Current Stock Value: <strong>{formatMoney(stock.inventoryValue)}</strong>
          </p>
        </SectionCard>

        <SectionCard
          title="Low Stock Alerts"
          caption={`Triggered by the configured low-stock threshold`}
          icon={FiAlertTriangle}
          action={
            <Link to="/stock" className="dash-card-link">
              Manage Stock <FiArrowRight size={14} />
            </Link>
          }
        >
          {lowStock.length ? (
            <div className="dash-table-wrap">
              <table className="data-table dash-compact-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Current Stock</th>
                    <th className="num">Minimum Level</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((item) => (
                    <tr key={item.productId}>
                      <td>{item.productName}</td>
                      <td className="num">
                        {formatQuantity(item.quantity)} {item.unit ? item.unit : ''}
                      </td>
                      <td className="num">
                        {formatQuantity(item.minimumStock)} {item.unit ? item.unit : ''}
                      </td>
                      <td>
                        <span className={`st-badge ${item.status === 'out' ? 'st-out' : 'st-low'}`}>
                          {item.status === 'out' ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiCheckCircle}
              title="All products are sufficiently stocked"
              message="No product is at or below its configured minimum level."
            />
          )}
        </SectionCard>
      </section>

      <section className="dash-main-grid">
        <SectionCard
          title="Purchase Overview"
          caption={noun}
          icon={FiTruck}
          action={
            <Link to="/purchases" className="dash-card-link">
              View Purchases <FiArrowRight size={14} />
            </Link>
          }
        >
          <div className="dash-chip-grid">
            <div className="dash-chip">
              <span className="dash-chip-label">Completed</span>
              <span className="dash-chip-value">{formatCount(purchases.completedPurchaseCount)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Unpaid</span>
              <span className="dash-chip-value">{formatCount(purchases.unpaidPurchaseCount)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Purchase Value</span>
              <span className="dash-chip-value">{formatMoney(purchases.purchaseAmount)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Supplier Due</span>
              <span className="dash-chip-value">{formatMoney(purchases.supplierDue)}</span>
            </div>
          </div>
          <h3 className="dash-subtitle-block">Pending Orders</h3>
          {pendingOrders.length ? (
            <ul className="dash-pending-list">
              {pendingOrders.map((po) => (
                <li key={po.purchaseOrderId}>
                  <span className="dash-pending-main">
                    <strong>{po.supplier}</strong>
                    <span className="cell-sub">
                      {po.poNumber} · {formatCount(po.itemCount)} items
                    </span>
                  </span>
                  <span className="dash-pending-right">
                    <span>{po.expectedDeliveryDate ? `Expected: ${dayLabel(po.expectedDeliveryDate)}` : 'Delivery date not set'}</span>
                    <span className={`st-badge ${po.status === 'partially_received' ? 'st-low' : 'st-ok'}`}>
                      {po.status === 'draft' ? 'Draft' : po.status === 'sent' ? 'Sent' : 'Partially Received'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardInlineEmpty
              icon={FiCheckCircle}
              title="No pending purchase orders"
              message="All purchase orders have been received or cancelled."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Credit Overview"
          caption={noun}
          icon={FiCreditCard}
          action={
            <Link to="/credits" className="dash-card-link">
              View Credit <FiArrowRight size={14} />
            </Link>
          }
        >
          <div className="dash-chip-grid">
            <div className="dash-chip">
              <span className="dash-chip-label">Total Outstanding</span>
              <span className="dash-chip-value">{formatMoney(credit.currentOutstanding)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Customers With Credit</span>
              <span className="dash-chip-value">{formatCount(credit.customersWithOutstanding)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Collected {noun}</span>
              <span className="dash-chip-value">{formatMoney(credit.creditCollections)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Credit Sales {noun}</span>
              <span className="dash-chip-value">{formatMoney(credit.creditSales)}</span>
            </div>
          </div>
          <h3 className="dash-subtitle-block">Top Outstanding Balances</h3>
          {credit.topCustomers?.length ? (
            <div className="dash-table-wrap">
              <table className="data-table dash-compact-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="num">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {credit.topCustomers.map((c) => (
                    <tr key={c.customerId}>
                      <td>{c.customerName}</td>
                      <td className="num">{formatMoney(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiCreditCard}
              title="No outstanding credit"
              message="All customer balances are settled."
            />
          )}
        </SectionCard>
      </section>

      <section className="dash-main-grid">
        <SectionCard
          title="Recent Stock Movements"
          caption="Latest activity in the stock ledger"
          icon={FiBox}
          action={
            <Link to="/stock" className="dash-card-link">
              View Stock Movement <FiArrowRight size={14} />
            </Link>
          }
        >
          {recentMovements.length ? (
            <ul className="dash-movement-list">
              {recentMovements.map((movement) => (
                <li key={movement.id}>
                  <span className={`dash-movement-icon ${Number(movement.quantityChange) >= 0 ? 'is-in' : 'is-out'}`} aria-hidden="true">
                    {Number(movement.quantityChange) >= 0 ? <FiArrowUpRight size={16} /> : <FiArrowDownRight size={16} />}
                  </span>
                  <span className="dash-movement-main">
                    <strong>{movement.productName}</strong>
                    <span className="cell-sub">
                      {MOVEMENT_LABELS[movement.transactionType] || movement.transactionType}
                      {movement.note ? ` · ${movement.note}` : ''}
                    </span>
                  </span>
                  <span className="dash-movement-right">
                    <span className={`dash-movement-qty ${Number(movement.quantityChange) >= 0 ? 'is-in' : 'is-out'}`}>
                      {Number(movement.quantityChange) >= 0 ? '+' : ''}
                      {formatQuantity(movement.quantityChange)} {movement.unit ? movement.unit : ''}
                    </span>
                    <span className="cell-sub">{timeOfDay(movement.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardInlineEmpty
              icon={FiBox}
              title="No stock movements yet"
              message="Purchases, sales and adjustments will appear here."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Today's Expenses"
          caption={noun}
          icon={FiPieChart}
          action={
            <Link to="/expenses" className="dash-card-link">
              View Expenses <FiArrowRight size={14} />
            </Link>
          }
        >
          <div className="dash-chip-grid">
            <div className="dash-chip">
              <span className="dash-chip-label">Total Expenses</span>
              <span className="dash-chip-value">{formatMoney(expenses.total)}</span>
            </div>
            <div className="dash-chip">
              <span className="dash-chip-label">Entries</span>
              <span className="dash-chip-value">{formatCount(expenses.count)}</span>
            </div>
          </div>
          <h3 className="dash-subtitle-block">Top Categories</h3>
          {(expenses.categories || []).length ? (
            <ul className="dash-expense-list">
              {expenses.categories.map((category) => (
                <li key={category.category}>
                  <span>{category.category}</span>
                  <span>
                    <strong>{formatMoney(category.total)}</strong>
                    {category.count > 1 ? <span className="cell-sub"> · {formatCount(category.count)} entries</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardInlineEmpty
              icon={FiPieChart}
              title="No expenses in this period"
              message="Expense categories will appear here once expenses are recorded."
            />
          )}
        </SectionCard>
      </section>

      <section className="dash-main-grid">
        <SectionCard title="Needs Attention" caption="Actionable business alerts" icon={FiAlertTriangle}>
          {alerts.length ? (
            <ul className="dash-alert-list">
              {alerts.map((alert) => (
                <li key={alert.key}>
                  <span className="dash-alert-icon" aria-hidden="true">
                    <alert.icon size={17} />
                  </span>
                  <span className="dash-alert-text">{alert.text}</span>
                  <Link to={alert.to} className="dash-alert-link" aria-label={`Open ${alert.to}`}>
                    <FiArrowRight size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardInlineEmpty
              icon={FiCheckCircle}
              title="Everything looks good"
              message="No outstanding stock, credit, purchase or expense issues right now."
            />
          )}
        </SectionCard>

        <SectionCard title="Today's Insights" caption="Derived from your live business data" icon={FiTrendingUp}>
          {insights.length ? (
            <ul className="dash-insight-list">
              {insights.map((insight) => (
                <li key={insight.key}>
                  <span className="dash-insight-icon" aria-hidden="true">
                    <insight.icon size={17} />
                  </span>
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <DashboardInlineEmpty
              icon={FiTrendingUp}
              title="No insights yet"
              message="Insights will be generated as soon as there is sales and stock activity."
            />
          )}
        </SectionCard>
      </section>

      <section className="dash-main-grid">
        <SectionCard title="Quick Actions" caption="Shortcuts to everyday tasks" icon={FiPlus}>
          <div className="dash-actions-grid">
            <Link to="/pos" className="dash-action-btn">
              <FiShoppingCart size={18} />
              <span>New Sale</span>
            </Link>
            <Link to="/purchases" className="dash-action-btn">
              <FiTruck size={18} />
              <span>Add Purchase</span>
            </Link>
            <Link to="/products" className="dash-action-btn">
              <FiPackage size={18} />
              <span>Add Product</span>
            </Link>
            <Link to="/customers" className="dash-action-btn">
              <FiUsers size={18} />
              <span>Add Customer</span>
            </Link>
            <Link to="/stock" className="dash-action-btn">
              <FiBox size={18} />
              <span>Stock Adjustment</span>
            </Link>
            <Link to="/credits" className="dash-action-btn">
              <FiCreditCard size={18} />
              <span>Collect Credit</span>
            </Link>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}