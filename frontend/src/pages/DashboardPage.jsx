import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiBox,
  FiCalendar,
  FiChevronDown,
  FiInbox,
  FiPackage,
  FiPieChart,
  FiRefreshCw,
  FiShoppingCart,
  FiTrendingUp,
  FiUsers,
} from 'react-icons/fi';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { dashboardService } from '../services/dashboard.service.js';
import { stockService } from '../services/stock.service.js';
import { customerService } from '../services/customer.service.js';
import { productService } from '../services/product.service.js';
import { reportsService } from '../services/reports.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { formatMoney, formatQuantity, formatCount, formatDateOnly } from '../utils/format.js';

const PRODUCTS_PAGE_SIZE = 100;
const REPORT_PAGE_SIZE = 100;

const DONUT_COLORS = ['#16804b', '#2563c7', '#f0a63b', '#c83b43', '#7c5cd6', '#0f9e9e', '#d66f2f', '#4c9a3f'];

const CHART_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
];

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
  return formatMoney(n);
}

function activeSalesOnly(sale) {
  return sale.status !== 'cancelled';
}

function toDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatActivityTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function stockStatusClass(status) {
  if (status === 'Out of Stock') return 'st-out';
  if (status === 'Low Stock') return 'st-low';
  return 'st-ok';
}

function stockStatusWeight(status) {
  if (status === 'Out of Stock') return 0;
  if (status === 'Low Stock') return 1;
  return 2;
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

function SalesBarChart({ data, max }) {
  const gridRatios = [1, 0.75, 0.5, 0.25, 0];
  return (
    <div className="sales-chart">
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
            {data.map((bucket) => (
              <div
                key={bucket.date}
                className={`sales-chart-col${bucket.value > 0 ? '' : ' has-zero'}`}
                style={{ '--bar-h': `${bucket.percent}%` }}
              >
                <span className="sales-chart-tip">
                  {bucket.label + ' '}
                  {formatMoney(bucket.value)}
                </span>
                <span className="sales-chart-bar" style={{ height: `${bucket.percent}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="sales-chart-x" aria-hidden="true">
          {data.map((bucket) => (
            <span key={bucket.date}>{bucket.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
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

function CategoryDonut({ segments, total }) {
  const cx = 100;
  const cy = 100;
  const outer = 92;
  const inner = 58;
  let angle = 0;

  const slices = segments.map((segment) => {
    const sweep = total > 0 ? (segment.value / total) * 360 : 0;
    const path = segments.length === 1
      ? fullRing(cx, cy, outer, inner)
      : donutSlice(cx, cy, outer, inner, angle, angle + sweep);
    angle += sweep;
    return { ...segment, path };
  });

  return (
    <div className="category-donut">
      <div className="category-donut-chart">
        <svg viewBox="0 0 200 200" role="img" aria-label="Sales by category">
          {slices.map((slice) => (
            <path key={slice.name} d={slice.path} fill={slice.color} className="donut-segment">
              <title>{`${slice.name} - ${formatMoney(slice.value)} (${slice.percent}%)`}</title>
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
          <li key={segment.name} className="category-legend-item">
            <span className="category-legend-dot" style={{ background: segment.color }} aria-hidden="true" />
            <span className="category-legend-name" title={segment.name}>
              {segment.name}
            </span>
            <span className="category-legend-value">{formatMoney(segment.value)}</span>
            <span className="category-legend-percent">{segment.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [chartRange, setChartRange] = useState(7);

  const { data, loading, error, refetch } = useAsync(async () => {
    // Core dashboard figures - never optional.
    const [summary, stockPage, customerPage] = await Promise.all([
      dashboardService.getSummary({ top: 20 }),
      stockService.list({ page: 1, limit: 100 }),
      customerService.list({ page: 1, limit: 1 }),
    ]);

    // Auxiliary views (category breakdown, product thumbnails). These
    // degrade gracefully to empty states instead of taking down the cards.
    let productReport = null;
    let productPage = [];
    try {
      [productReport, productPage] = await Promise.all([
        reportsService.getRowReport('products', { page: 1, limit: REPORT_PAGE_SIZE }),
        fetchAllProducts(),
      ]);
    } catch {
      productReport = null;
      productPage = [];
    }

    return { summary, stockPage, customerPage, productReport, productPage };
  }, []);

  const handleRefresh = useMemo(
    () => async () => {
      setRefreshing(true);
      try {
        await refetch();
      } finally {
        setRefreshing(false);
      }
    },
    [refetch]
  );

  const summary = useMemo(() => data?.summary ?? null, [data]);
  const period = useMemo(() => summary?.period ?? {}, [summary]);
  const sales = useMemo(() => summary?.sales ?? {}, [summary]);
  const stockSummary = useMemo(() => summary?.stock ?? {}, [summary]);
  const topProducts = useMemo(() => (summary?.topProducts ?? []).slice(0, 5), [summary]);
  const recentSales = useMemo(() => summary?.recentSales ?? [], [summary]);
  const recentPurchases = useMemo(() => summary?.recentPurchases ?? [], [summary]);

  const customerTotal = useMemo(() => {
    const total = Number(data?.customerPage?.pagination?.total ?? 0);
    return Number.isFinite(total) ? total : 0;
  }, [data]);

  const lowStockCount = useMemo(() => {
    const count = Number(stockSummary.lowStockCount);
    return Number.isFinite(count) ? count : 0;
  }, [stockSummary]);

  const productLookup = useMemo(() => {
    const map = new Map();
    for (const product of data?.productPage ?? []) {
      map.set(Number(product.id), product);
    }
    return map;
  }, [data]);

  const stockStatuses = useMemo(() => {
    return (data?.stockPage?.items ?? [])
      .map((item) => {
        const quantity = Number(item.quantity ?? 0);
        const minimumStock = Number(item.minimum_stock ?? 0);
        let status = 'Normal';
        if (quantity <= 0) status = 'Out of Stock';
        else if (minimumStock > 0 && quantity <= minimumStock) status = 'Low Stock';
        return {
          id: Number(item.product_id),
          name: item.product_name,
          unit: item.unit || '',
          quantity,
          status,
          imagePath: productLookup.get(Number(item.product_id))?.imagePath ?? null,
        };
      })
      .sort((a, b) => stockStatusWeight(a.status) - stockStatusWeight(b.status) || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [data, productLookup]);

  const salesTrend = useMemo(() => {
    const range = Number(chartRange) || 7;
    const buckets = Array.from({ length: range }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (range - 1 - index));
      const key = toDateKey(date);
      let value = 0;
      for (const sale of recentSales) {
        if (!activeSalesOnly(sale)) continue;
        if (toDateKey(sale.saleDate) === key) value += Number(sale.totalAmount ?? 0);
      }
      const weekday = date.toLocaleDateString([], { weekday: 'short' });
      const dayNumber = String(date.getDate());
      const monthShort = date.toLocaleDateString([], { month: 'short' });
      let label = weekday;
      if (range === 14) label = `${weekday} ${dayNumber}`;
      else if (range >= 30) label = `${dayNumber} ${monthShort}`;
      return { date: key, label, value };
    });

    const maxRaw = Math.max(...buckets.map((bucket) => bucket.value), 0);
    const max = niceCeil(maxRaw);

    return {
      buckets: buckets.map((bucket) => ({ ...bucket, percent: max > 0 ? (bucket.value / max) * 100 : 0 })),
      max,
      hasSales: maxRaw > 0,
    };
  }, [chartRange, recentSales]);

  const categorySegments = useMemo(() => {
    const totals = new Map();
    for (const row of data?.productReport?.items ?? []) {
      const name = row.categoryName || 'Uncategorized';
      totals.set(name, (totals.get(name) || 0) + Number(row.netSales ?? 0));
    }

    let segments = [...totals.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((segment) => segment.value > 0)
      .sort((a, b) => b.value - a.value);

    if (segments.length > 8) {
      const top = segments.slice(0, 7);
      const rest = segments.slice(7).reduce((sum, segment) => sum + segment.value, 0);
      if (rest > 0) top.push({ name: 'Other', value: rest });
      segments = top;
    }

    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    return segments.map((segment, index) => ({
      ...segment,
      percent: total > 0 ? Number(((segment.value / total) * 100).toFixed(1)) : 0,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    }));
  }, [data]);

  const categoryTotal = useMemo(
    () => categorySegments.reduce((sum, segment) => sum + segment.value, 0),
    [categorySegments]
  );

  const recentActivities = useMemo(() => {
    const saleActivities = (recentSales || []).slice(0, 3).map((sale) => ({
      id: `sale-${sale.saleId}`,
      kind: 'sale',
      title: sale.status === 'returned' ? 'Sale returned' : 'Sale completed',
      detail: `${sale.invoiceNumber || `Invoice #${sale.saleId}`} · ${sale.customer || 'Walk-in Customer'} · ${formatMoney(
        sale.totalAmount
      )}`,
      time: sale.saleDate,
    }));

    const purchaseActivities = (recentPurchases || []).slice(0, 2).map((purchase) => ({
      id: `purchase-${purchase.purchaseId}`,
      kind: 'purchase',
      title: purchase.status === 'cancelled' ? 'Purchase cancelled' : 'Purchase received',
      detail: `${purchase.invoiceNumber || `Invoice #${purchase.purchaseId}`} · ${purchase.supplier || 'Supplier'} · ${formatMoney(
        purchase.totalAmount
      )}`,
      time: purchase.purchaseDate,
    }));

    return [...saleActivities, ...purchaseActivities]
      .filter((activity) => activity.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);
  }, [recentPurchases, recentSales]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Today's Sales",
        value: formatMoney(sales.netSalesRevenue),
        sub: `${formatCount(sales.saleCount || 0)} orders`,
        icon: FiTrendingUp,
        tone: 'tone-sales',
      },
      {
        label: 'Total Orders',
        value: formatCount(sales.saleCount || 0),
        sub: `${formatCount(sales.completedSaleCount || 0)} completed`,
        icon: FiShoppingCart,
        tone: 'tone-orders',
      },
      {
        label: 'Total Customers',
        value: formatCount(customerTotal),
        sub: `${formatCount(customerTotal)} registered`,
        icon: FiUsers,
        tone: 'tone-customers',
      },
      {
        label: 'Low Stock Items',
        value: formatCount(lowStockCount),
        sub: lowStockCount ? `${lowStockCount} need restocking` : 'All products stocked',
        icon: FiAlertTriangle,
        tone: lowStockCount ? 'tone-stock-warning' : 'tone-stock-ok',
      },
    ],
    [customerTotal, lowStockCount, sales]
  );

  const chartRangeLabel = useMemo(() => {
    const match = CHART_RANGES.find((option) => option.value === chartRange);
    return match ? match.label : 'Last 7 days';
  }, [chartRange]);

  if (loading) return <PageLoader label="Loading dashboard…" />;

  if (error) {
    return (
      <ErrorState
        title="Dashboard unavailable"
        message={error.message}
        status={error.status}
        onRetry={() => refetch()}
      />
    );
  }

  if (!summary) {
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
          <h1 className="dash-welcome">Welcome, {user?.fullName || user?.username || 'Admin'}!</h1>
          <p className="dash-subtitle">Here&apos;s what&apos;s happening in your vegetable shop today.</p>
        </div>

        <div className="dash-hero-right">
          <span className="dash-today">
            <FiCalendar size={15} />
            <span>{todayLabel()}</span>
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

      <section className="dash-stat-grid" aria-label="Key figures">
        {summaryCards.map((card) => (
          <article key={card.label} className={`dash-stat-card ${card.tone}`}>
            <div className="dash-stat-top">
              <span className="dash-stat-label">{card.label}</span>
              <span className="dash-stat-icon" aria-hidden="true">
                <card.icon size={20} />
              </span>
            </div>
            <p className="dash-stat-value">{card.value}</p>
            <p className="dash-stat-sub">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="dash-charts-grid">
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2 className="dash-card-title">Sales Overview</h2>
              <p className="dash-card-caption">{chartRangeLabel}</p>
            </div>
            <div className="dash-select-wrap">
              <select
                className="dash-select"
                aria-label="Chart period"
                value={chartRange}
                onChange={(event) => setChartRange(Number(event.target.value))}
              >
                {CHART_RANGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
            </div>
          </div>

          {salesTrend.hasSales ? (
            <SalesBarChart data={salesTrend.buckets} max={salesTrend.max} />
          ) : (
            <DashboardInlineEmpty
              icon={FiTrendingUp}
              title="No sales recorded"
              message="Sales data will appear here after completing a sale."
            />
          )}
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2 className="dash-card-title">Sales by Category</h2>
              <p className="dash-card-caption">
                This period · {formatDateOnly(period.fromDate)} — {formatDateOnly(period.toDate)}
              </p>
            </div>
            <span className="dash-card-icon" aria-hidden="true">
              <FiPieChart size={18} />
            </span>
          </div>

          {categorySegments.length ? (
            <CategoryDonut segments={categorySegments} total={categoryTotal} />
          ) : (
            <DashboardInlineEmpty
              icon={FiPieChart}
              title="No category data"
              message="Category breakdown will appear here once products are sold."
            />
          )}
        </article>
      </section>

      <section className="dash-tables-grid">
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2 className="dash-card-title">Top Selling Products</h2>
              <p className="dash-card-caption">This period</p>
            </div>
            <button type="button" className="btn-link" onClick={() => navigate('/sales')}>
              View Sales
            </button>
          </div>

          {topProducts.length ? (
            <div className="dash-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="num">Quantity</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, index) => {
                    const full = productLookup.get(Number(product.productId));
                    return (
                      <tr key={product.productId ?? `${product.productName}-${index}`}>
                        <td className="cell-index">{index + 1}</td>
                        <td>
                          <span className="dash-product-cell">
                            <ProductImage source={full?.imagePath ?? null} alt={product.productName} />
                            <span className="dash-product-copy">
                              <span className="cell-main">{product.productName}</span>
                              {product.sku ? <span className="cell-sub">{product.sku}</span> : null}
                            </span>
                          </span>
                        </td>
                        <td>{full?.categoryName || '—'}</td>
                        <td className="num">{formatQuantity(product.netQuantity ?? product.soldQuantity ?? 0)}</td>
                        <td className="num">{formatMoney(product.netSales ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiBox}
              title="No sales yet"
              message="Top products will appear here after completing a sale."
            />
          )}
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2 className="dash-card-title">Stock Status</h2>
              <p className="dash-card-caption">
                {formatCount(stockSummary.totalProductsWithStock)} products ·{' '}
                {formatQuantity(stockSummary.totalQuantityOnHand)} on hand
              </p>
            </div>
            <button type="button" className="btn-link" onClick={() => navigate('/stock')}>
              View All Stock
            </button>
          </div>

          {stockStatuses.length ? (
            <div className="dash-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Current Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockStatuses.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="dash-product-cell">
                          <ProductImage source={item.imagePath} alt={item.name} />
                          <span className="dash-product-copy">
                            <span className="cell-main">{item.name}</span>
                            {item.unit ? <span className="cell-sub">{item.unit}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td className="num">
                        {formatQuantity(item.quantity)}
                        {item.unit ? ` ${item.unit}` : ''}
                      </td>
                      <td>
                        <span className={`stock-badge ${stockStatusClass(item.status)}`}>{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DashboardInlineEmpty
              icon={FiBox}
              title="No stock found"
              message="Stock will appear here once products are added."
            />
          )}
        </article>
      </section>

      <section className="dash-card dash-activities-card">
        <div className="dash-card-head">
          <div>
            <h2 className="dash-card-title">Recent Activities</h2>
            <p className="dash-card-caption">Latest sales and purchases</p>
          </div>
          <button type="button" className="btn-link" onClick={() => navigate('/sales')}>
            View All <FiArrowRight size={14} />
          </button>
        </div>

        {recentActivities.length ? (
          <ul className="activity-list">
            {recentActivities.map((activity) => (
              <li key={activity.id} className="activity-row">
                <span className={`activity-icon ${activity.kind}`} aria-hidden="true">
                  {activity.kind === 'sale' ? <FiShoppingCart size={16} /> : <FiPackage size={16} />}
                </span>
                <div className="activity-copy">
                  <p className="activity-title">{activity.title}</p>
                  <p className="activity-detail">{activity.detail}</p>
                </div>
                <span className="activity-time">{formatActivityTime(activity.time)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardInlineEmpty
            icon={FiRefreshCw}
            title="No recent activity"
            message="Recent activity will appear here as you make sales and purchases."
          />
        )}
      </section>
    </div>
  );
}

async function fetchAllProducts() {
  const first = await productService.list({ page: 1, limit: PRODUCTS_PAGE_SIZE });
  const items = [...(first?.items ?? [])];
  const total = Number(first?.pagination?.total ?? items.length);
  const pageCount = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE));

  for (let page = 2; page <= pageCount; page += 1) {
    const next = await productService.list({ page, limit: PRODUCTS_PAGE_SIZE });
    items.push(...(next?.items ?? []));
  }

  return items;
}