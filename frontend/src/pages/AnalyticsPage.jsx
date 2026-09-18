import { useEffect, useMemo, useState } from 'react';
import {
  FiAlertTriangle,
  FiBox,
  FiCalendar,
  FiChevronDown,
  FiClock,
  FiInbox,
  FiRefreshCw,
  FiSearch,
  FiShoppingCart,
  FiTrendingUp,
} from 'react-icons/fi';
import { useAsync } from '../hooks/useAsync.js';
import { analyticsService } from '../services/analytics.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import Spinner from '../components/Spinner.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { formatMoney, formatQuantity, formatCount, formatDateOnly, formatDateTime } from '../utils/format.js';

const ALL_PRODUCTS_PAGE_SIZE = 100;
const RECENT_SALES_PAGE_SIZE = 10;
const STOCK_TX_PAGE_SIZE = 15;
const SALE_LINE_FETCH_CAP = 3000;

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'month', label: 'This Month' },
];

const TREND_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const STOCK_TYPES = [
  { value: '', label: 'All movements' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'sale', label: 'Sale' },
  { value: 'return_purchase', label: 'Purchase return' },
  { value: 'return_sale', label: 'Sale return' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'cancellation_reversal', label: 'Cancellation reversal' },
  { value: 'damage', label: 'Damage / Wastage' },
];

function pad(num) {
  return String(num).padStart(2, '0');
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayString() {
  return toDateString(new Date());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function resolvePeriod(value) {
  if (value === 'today') return { fromDate: todayString(), toDate: todayString(), label: 'Today' };
  if (value === 'yesterday') return { fromDate: toDateString(addDays(new Date(), -1)), toDate: toDateString(addDays(new Date(), -1)), label: 'Yesterday' };
  if (value === '30') return { fromDate: toDateString(addDays(new Date(), -29)), toDate: todayString(), label: 'Last 30 days' };
  if (value === 'month') {
    const d = new Date();
    const first = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    return { fromDate: first, toDate: todayString(), label: 'This Month' };
  }
  return { fromDate: toDateString(addDays(new Date(), -6)), toDate: todayString(), label: 'Last 7 days' };
}

function toDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return toDateString(date);
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

function trendDayLabel(value, rangeDays) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  const weekday = date.toLocaleDateString([], { weekday: 'short' });
  const dayNumber = String(date.getDate());
  const monthShort = date.toLocaleDateString([], { month: 'short' });
  if (rangeDays === 1) return weekday;
  if (rangeDays <= 7) return weekday;
  if (rangeDays <= 30) return `${weekday} ${dayNumber}`;
  return `${dayNumber} ${monthShort}`;
}

function transactionTypeLabel(type) {
  const labels = {
    purchase: 'Purchase',
    sale: 'Sale',
    return_purchase: 'Purchase return',
    return_sale: 'Sale return',
    adjustment: 'Adjustment',
    cancellation_reversal: 'Cancellation reversal',
    damage: 'Damage / Wastage',
  };
  return labels[type] || type || '—';
}

function InlineEmpty({ icon: Icon = FiInbox, title, message }) {
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

function SectionLoading({ label }) {
  return (
    <div className="ana-inline-loading" role="status">
      <Spinner size={20} label={label || 'Loading…'} />
    </div>
  );
}

function TrendBarChart({ data, max }) {
  const gridRatios = [1, 0.75, 0.5, 0.25, 0];
  return (
    <div className="sales-chart">
      <div className="sales-chart-y" aria-hidden="true">
        {gridRatios.map((ratio) => (
          <span key={ratio} style={{ top: `${(1 - ratio) * 100}%` }}>
            {formatQuantity(max * ratio)}
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
                className={`sales-chart-col${bucket.quantity > 0 ? '' : ' has-zero'}`}
                style={{ '--bar-h': `${bucket.percent}%` }}
              >
                <span className="sales-chart-tip">
                  {bucket.label + ' '}
                  {formatQuantity(bucket.quantity)}
                  {' · '}
                  {formatMoney(bucket.revenue)}
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

export default function AnalyticsPage() {
  const [periodValue, setPeriodValue] = useState('7');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [productsPage, setProductsPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [trendValue, setTrendValue] = useState('7');
  const [salesPage, setSalesPage] = useState(1);
  const [stockPage, setStockPage] = useState(1);
  const [stockType, setStockType] = useState('');
  const [byTimeProductId, setByTimeProductId] = useState(null);
  const [byTimeDate, setByTimeDate] = useState(todayString());
  const [stockProductId, setStockProductId] = useState(null);
  const [stockDate, setStockDate] = useState(todayString());
  const [asOfDate, setAsOfDate] = useState(todayString());
  const [asOfResult, setAsOfResult] = useState(null);
  const [asOfLoading, setAsOfLoading] = useState(false);
  const [asOfError, setAsOfError] = useState(null);

  const range = useMemo(() => resolvePeriod(periodValue), [periodValue]);
  const trendRange = useMemo(() => resolvePeriod(trendValue), [trendValue]);

  const master = useAsync(
    async () =>
      analyticsService.listProducts({
        search: searchQuery && searchQuery.trim() ? searchQuery.trim() : undefined,
        fromDate: resolvePeriod(periodValue).fromDate,
        toDate: resolvePeriod(periodValue).toDate,
        page: productsPage,
        limit: ALL_PRODUCTS_PAGE_SIZE,
      }),
    [periodValue, searchQuery, productsPage]
  );

  // Live product search: filter as the operator types (debounced) and
  // immediately when the Search button / Enter is used. Clearing the box
  // restores the full list right away.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === '') {
      setSearchQuery((prev) => (prev === '' ? prev : ''));
      setProductsPage(1);
      return undefined;
    }
    const timer = setTimeout(() => {
      setSearchQuery(value);
      setProductsPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (selectedProductId === null && master.data && master.data.items && master.data.items.length) {
      setSelectedProductId(master.data.items[0].productId);
    }
  }, [master.data, selectedProductId]);

  useEffect(() => {
    setSalesPage(1);
    setStockPage(1);
    setAsOfDate(todayString());
    setAsOfResult(null);
    setAsOfError(null);
    if (selectedProductId) {
      setByTimeDate(todayString());
      setStockDate(todayString());
      setAsOfLoading(true);
      analyticsService
        .priceAsOf({ productId: selectedProductId, date: todayString() })
        .then(setAsOfResult)
        .catch((err) => setAsOfError(err?.message || 'Price lookup failed'))
        .finally(() => setAsOfLoading(false));
    }
  }, [selectedProductId]);

  useEffect(() => {
    if (selectedProductId) {
      setByTimeProductId(selectedProductId);
      setStockProductId(selectedProductId);
    }
  }, [selectedProductId]);

  const summary = master.data?.summary ?? null;
  const productRows = master.data?.items ?? [];
  const productsPagination = master.data?.pagination ?? null;

  const detail = useAsync(
    async () => {
      if (!selectedProductId) return null;
      const resolved = resolvePeriod(periodValue);
      return analyticsService.getProduct({
        productId: selectedProductId,
        fromDate: resolved.fromDate,
        toDate: resolved.toDate,
      });
    },
    [selectedProductId, periodValue]
  );

  const recentSales = useAsync(
    async () => {
      if (!selectedProductId) return null;
      const resolved = resolvePeriod(periodValue);
      return analyticsService.listSales({
        productId: selectedProductId,
        fromDate: resolved.fromDate,
        toDate: resolved.toDate,
        page: salesPage,
        limit: RECENT_SALES_PAGE_SIZE,
      });
    },
    [selectedProductId, periodValue, salesPage]
  );

  const trend = useAsync(
    async () => {
      if (!selectedProductId) return null;
      const resolved = resolvePeriod(trendValue);
      const lines = await (async () => {
        const pageSize = 100;
        const first = await analyticsService.listSales({
          productId: selectedProductId,
          fromDate: resolved.fromDate,
          toDate: resolved.toDate,
          page: 1,
          limit: pageSize,
        });
        let items = [...(first.items ?? [])];
        const total = Number(first.pagination?.total ?? 0);
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        for (let page = 2; page <= pageCount; page += 1) {
          const next = await analyticsService.listSales({
            productId: selectedProductId,
            fromDate: resolved.fromDate,
            toDate: resolved.toDate,
            page,
            limit: pageSize,
          });
          items.push(...(next.items ?? []));
          if (items.length >= SALE_LINE_FETCH_CAP) break;
        }
        return items;
      })();

      const byDay = new Map();
      for (const line of lines) {
        const key = toDateKey(line.saleDate);
        if (!key) continue;
        if (!byDay.has(key)) byDay.set(key, { quantity: 0, revenue: 0, sales: 0 });
        const bucket = byDay.get(key);
        bucket.quantity += Number(line.quantity ?? 0);
        bucket.revenue += Number(line.lineTotal ?? 0);
        bucket.sales += 1;
      }

      const days = trendValue === '1' ? 1 : Number(trendValue) || 7;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const buckets = [];
      for (let i = days - 1; i >= 0; i -= 1) {
        const d = addDays(today, -i);
        const key = toDateString(d);
        const data = byDay.get(key) || { quantity: 0, revenue: 0, sales: 0 };
        buckets.push({
          date: key,
          label: trendDayLabel(key, days),
          quantity: data.quantity,
          revenue: data.revenue,
          sales: data.sales,
        });
      }

      const maxRaw = Math.max(...buckets.map((bucket) => bucket.quantity), 0);
      const max = niceCeil(maxRaw);
      return {
        buckets: buckets.map((bucket) => ({ ...bucket, percent: max > 0 ? (bucket.quantity / max) * 100 : 0 })),
        max,
        lineCount: lines.length,
      };
    },
    [selectedProductId, trendValue]
  );

  const byTime = useAsync(
    async () => {
      if (!byTimeProductId) return null;
      return analyticsService.salesByTime({
        productId: byTimeProductId,
        date: byTimeDate,
      });
    },
    [byTimeProductId, byTimeDate]
  );

  const stockTx = useAsync(
    async () => {
      if (!stockProductId) return null;
      return analyticsService.stockTransactions({
        productId: stockProductId,
        fromDate: stockDate,
        toDate: stockDate,
        type: stockType || undefined,
        page: stockPage,
        limit: STOCK_TX_PAGE_SIZE,
      });
    },
    [stockProductId, stockDate, stockType, stockPage]
  );

  const handleRefresh = async () => {
    await master.refetch();
    if (selectedProductId) {
      await Promise.all([
        detail.refetch(),
        recentSales.refetch(),
        trend.refetch(),
        byTime.refetch(),
        stockTx.refetch(),
      ]);
    }
  };

  const handleProductSearch = (event) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
    setProductsPage(1);
  };

  const handleSelectProduct = (productId) => {
    setSelectedProductId(productId);
  };

  const handlePeriodChange = (value) => {
    setPeriodValue(value);
    setProductsPage(1);
  };

  const handleLookupPrice = async () => {
    if (!selectedProductId || asOfLoading) return;
    setAsOfLoading(true);
    setAsOfError(null);
    try {
      const result = await analyticsService.priceAsOf({ productId: selectedProductId, date: asOfDate });
      setAsOfResult(result);
    } catch (err) {
      setAsOfError(err?.message || 'Price lookup failed');
      setAsOfResult(null);
    } finally {
      setAsOfLoading(false);
    }
  };

  const summaryCards = useMemo(() => {
    const period = summary?.period ?? {};
    return [
      {
        label: 'Net Sales',
        value: formatMoney(period.netSales ?? 0),
        sub: `${formatCount(period.salesCount ?? 0)} orders · ${range.label}`,
        icon: FiTrendingUp,
        tone: 'tone-sales',
      },
      {
        label: 'Quantity Sold',
        value: formatQuantity(period.netQuantity ?? 0),
        sub: `${formatQuantity(period.quantityReturned ?? 0)} returned · ${range.label}`,
        icon: FiShoppingCart,
        tone: 'tone-orders',
      },
      {
        label: 'Stock on Hand',
        value: formatQuantity(summary?.totalStockQuantity ?? 0),
        sub: `${formatMoney(summary?.totalStockValue ?? 0)} value · ${formatCount(summary?.activeProductCount ?? 0)} active`,
        icon: FiBox,
        tone: 'tone-customers',
      },
      {
        label: 'Low Stock Items',
        value: formatCount(summary?.lowStockItems ?? 0),
        sub: Number(summary?.lowStockItems ?? 0) ? 'Product pairs at or below reorder level' : 'All products stocked',
        icon: FiAlertTriangle,
        tone: Number(summary?.lowStockItems ?? 0) ? 'tone-stock-warning' : 'tone-stock-ok',
      },
    ];
  }, [range.label, summary]);

  const selectedProduct = detail.data?.product ?? null;
  const productPeriod = detail.data?.period ?? null;

  const priceHistory = detail.data?.priceHistory ?? [];
  const recentSalesItems = recentSales.data?.items ?? [];
  const recentSalesPagination = recentSales.data?.pagination ?? null;
  const byTimeData = byTime.data;
  const stockTxItems = stockTx.data?.items ?? [];
  const stockTxPagination = stockTx.data?.pagination ?? null;

  if (master.loading && !master.data) return <PageLoader label="Loading analytics…" />;

  if (master.error && !master.data) {
    return (
      <ErrorState
        title="Analytics unavailable"
        message={master.error.message}
        status={master.error.status}
        onRetry={() => master.refetch()}
      />
    );
  }

  if (!summary) {
    return (
      <EmptyState
        title="No analytics data"
        description="Analytics will appear here once products and sales exist. Try refreshing or check that the backend is running."
      />
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dash-hero">
        <div className="dash-hero-copy">
          <h1 className="dash-welcome">Product Stock &amp; Sales Analytics</h1>
          <p className="dash-subtitle">Deep-dive into stock positions, sales and pricing per product.</p>
        </div>

        <div className="dash-hero-right ana-hero-controls">
          <form className="ana-search" onSubmit={handleProductSearch}>
            <FiSearch size={15} className="ana-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="ana-search-input"
              placeholder="Search product name, code or barcode…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search products"
            />
            <button type="submit" className="btn btn-primary btn-sm">
              Search
            </button>
          </form>
          <span className="dash-today">
            <FiCalendar size={15} />
            <span>{range.label}</span>
          </span>
          <button
            type="button"
            className="btn btn-outline dash-refresh"
            onClick={handleRefresh}
            disabled={master.loading}
            aria-busy={master.loading}
          >
            <FiRefreshCw size={15} className={master.loading ? 'is-spinning' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <div className="ana-filter-bar">
        <label className="ana-filter-label" htmlFor="ana-period-select">
          Sales period
        </label>
        <div className="dash-select-wrap">
          <select
            id="ana-period-select"
            className="dash-select"
            value={periodValue}
            onChange={(event) => handlePeriodChange(event.target.value)}
          >
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
        </div>
        <span className="ana-filter-hint">
          {formatDateOnly(range.fromDate)} — {formatDateOnly(range.toDate)}
        </span>
      </div>

      <section className="dash-card">
        <div className="dash-card-head">
          <div>
            <h2 className="dash-card-title">All Products — Stock &amp; Sales</h2>
            <p className="dash-card-caption">
              {range.label} · {formatCount(productsPagination?.total ?? productRows.length)} products
            </p>
          </div>
          <span className="dash-card-icon" aria-hidden="true">
            <FiBox size={18} />
          </span>
        </div>

        {productRows.length ? (
          <>
            <div className="dash-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="num">Current stock</th>
                    <th className="num">Selling price</th>
                    <th className="num">Sold ({periodValue === 'today' ? 'today' : range.label})</th>
                    <th className="num">Net sales ({periodValue === 'today' ? 'today' : range.label})</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((row, index) => {
                    const isSelected = Number(row.productId) === Number(selectedProductId);
                    return (
                      <tr
                        key={row.productId}
                        className={`ana-clickable-row${isSelected ? ' ana-row-selected' : ''}`}
                        onClick={() => handleSelectProduct(row.productId)}
                      >
                        <td className="cell-index">{(productsPage - 1) * ALL_PRODUCTS_PAGE_SIZE + index + 1}</td>
                        <td>
                          <span className="dash-product-cell">
                            <ProductImage source={row.imagePath} alt={row.name} />
                            <span className="dash-product-copy">
                              <span className="cell-main">{row.name}</span>
                              <span className="cell-sub">{row.sku || '—'}</span>
                            </span>
                          </span>
                        </td>
                        <td>{row.categoryName || '—'}</td>
                        <td className="num">
                          {formatQuantity(row.currentStock)}
                          {row.unit ? ` ${row.unit}` : ''}
                        </td>
                        <td className="num">{formatMoney(row.sellingPrice)}</td>
                        <td className="num">
                          <span className={Number(row.currentStock) <= Number(row.minimumStock) && Number(row.currentStock) > 0 ? 'cell-sub' : ''}>
                            {formatQuantity(row.netQuantity)}
                            <span className="cell-sub">{row.quantityReturned ? ` (${formatQuantity(row.quantityReturned)} ret.)` : ''}</span>
                          </span>
                        </td>
                        <td className="num">{formatMoney(row.netSales)}</td>
                        <td>
                          <span className={`stock-badge ${row.status === 'active' ? 'st-ok' : 'st-out'}`}>
                            {row.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {productsPagination && productsPagination.totalPages > 1 ? (
              <Pagination
                page={productsPage}
                totalPages={productsPagination.totalPages}
                totalItems={productsPagination.total}
                pageSize={ALL_PRODUCTS_PAGE_SIZE}
                onChange={setProductsPage}
              />
            ) : null}
          </>
        ) : (
          <InlineEmpty
            icon={FiSearch}
            title="No products found"
            message="Try changing the search or clearing the filters."
          />
        )}
      </section>

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

      {!selectedProduct ? (
        <EmptyState
          title="Select a product"
          description="Search and click a product to see its stock, sales and pricing analytics."
        />
      ) : (
        <>
          <section className="ana-detail-grid">
            <article className="dash-card">
              <div className="dash-card-head">
                <div>
                  <h2 className="dash-card-title">Product Summary</h2>
                  <p className="dash-card-caption">{range.label}</p>
                </div>
              </div>
              {detail.loading && !selectedProduct ? (
                <SectionLoading label="Loading product…" />
              ) : (
                <>
                  {selectedProduct ? (
                    <div className="ana-product-summary">
                      <div className="ana-product-identity">
                        <ProductImage source={selectedProduct.imagePath} alt={selectedProduct.name} size="md" />
                        <div className="ana-product-copy">
                          <p className="ana-product-name">{selectedProduct.name}</p>
                          <p className="ana-product-meta">{selectedProduct.sku || '—'}</p>
                          <p className="ana-product-meta">{selectedProduct.categoryName || '—'}</p>
                        </div>
                        <span className={`stock-badge ${selectedProduct.status === 'active' ? 'st-ok' : 'st-out'}`}>
                          {selectedProduct.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="ana-product-prices">
                        <div className="ana-price-cell">
                          <span className="ana-price-label">Selling price</span>
                          <span className="ana-price-value">{formatMoney(selectedProduct.sellingPrice)}</span>
                        </div>
                        <div className="ana-price-cell">
                          <span className="ana-price-label">Purchase price</span>
                          <span className="ana-price-value">{formatMoney(selectedProduct.purchasePrice)}</span>
                        </div>
                        <div className="ana-price-cell">
                          <span className="ana-price-label">Current stock</span>
                          <span className="ana-price-value">
                            {formatQuantity(selectedProduct.currentStock)}
                            <span className="ana-price-unit">{selectedProduct.unit ? ` ${selectedProduct.unit}` : ''}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <InlineEmpty icon={FiBox} title="Product not found" message="This product could not be loaded." />
                  )}

                  <div className="ana-period-stats">
                    <div className="ana-period-stat">
                      <span className="ana-period-stat-label">Orders</span>
                      <span className="ana-period-stat-value">{formatCount(productPeriod?.salesCount ?? 0)}</span>
                    </div>
                    <div className="ana-period-stat">
                      <span className="ana-period-stat-label">Quantity sold</span>
                      <span className="ana-period-stat-value">{formatQuantity(productPeriod?.quantitySold ?? 0)}</span>
                    </div>
                    <div className="ana-period-stat">
                      <span className="ana-period-stat-label">Quantity returned</span>
                      <span className="ana-period-stat-value">{formatQuantity(productPeriod?.quantityReturned ?? 0)}</span>
                    </div>
                    <div className="ana-period-stat">
                      <span className="ana-period-stat-label">Gross sales</span>
                      <span className="ana-period-stat-value">{formatMoney(productPeriod?.grossSales ?? 0)}</span>
                    </div>
                    <div className="ana-period-stat">
                      <span className="ana-period-stat-label">Net sales</span>
                      <span className="ana-period-stat-value">{formatMoney(productPeriod?.netSales ?? 0)}</span>
                    </div>
                  </div>
                </>
              )}
            </article>

            <article className="dash-card">
              <div className="dash-card-head">
                <div>
                  <h2 className="dash-card-title">Stock &amp; Sales Trend</h2>
                  <p className="dash-card-caption">
                    {trendRange.label} · {selectedProduct ? `${selectedProduct.name} daily quantity sold` : ''}
                  </p>
                </div>
                <div className="dash-select-wrap">
                  <select
                    className="dash-select"
                    aria-label="Trend period"
                    value={trendValue}
                    onChange={(event) => setTrendValue(event.target.value)}
                  >
                    {TREND_RANGES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
                </div>
              </div>

              {trend.loading && !trend.data ? (
                <SectionLoading label="Loading trend…" />
              ) : !trend.data || !trend.data.buckets.some((bucket) => bucket.quantity > 0) ? (
                <InlineEmpty
                  icon={FiTrendingUp}
                  title="No sales in this period"
                  message="Daily sales bars will appear here once this product is sold."
                />
              ) : (
                <TrendBarChart data={trend.data.buckets} max={trend.data.max} />
              )}
            </article>
          </section>

          <section className="ana-detail-grid">
            <article className="dash-card">
              <div className="dash-card-head">
                <div>
                  <h2 className="dash-card-title">Price History</h2>
                  <p className="dash-card-caption">Append-only ledger of price changes</p>
                </div>
              </div>

              <div className="ana-asof">
                <label className="ana-filter-label" htmlFor="ana-asof-date">
                  Price on date
                </label>
                <input
                  id="ana-asof-date"
                  type="date"
                  className="ana-date-input"
                  value={asOfDate}
                  onChange={(event) => setAsOfDate(event.target.value || todayString())}
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={handleLookupPrice} disabled={asOfLoading}>
                  {asOfLoading ? 'Checking…' : 'Check price'}
                </button>
                {asOfResult ? (
                  <span className="ana-asof-result">
                    {asOfResult.sellingPrice !== null
                      ? `${formatMoney(asOfResult.sellingPrice)} (cost ${formatMoney(asOfResult.costPrice ?? 0)})`
                      : 'No price recorded for this date'}
                  </span>
                ) : null}
                {asOfError ? <span className="ana-asof-error">{asOfError}</span> : null}
              </div>

              {detail.loading && !detail.data ? null : priceHistory.length ? (
                <div className="dash-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Effective date</th>
                        <th className="num">Selling price</th>
                        <th className="num">Cost price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDateOnly(row.effectiveFrom)}</td>
                          <td className="num">{formatMoney(row.sellingPrice)}</td>
                          <td className="num">{formatMoney(row.costPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <InlineEmpty
                  icon={FiClock}
                  title="No price history"
                  message="Price changes will be recorded here over time."
                />
              )}
            </article>

            <article className="dash-card">
              <div className="dash-card-head">
                <div>
                  <h2 className="dash-card-title">Sales by Time</h2>
                  <p className="dash-card-caption">
                    Hourly sales · {formatDateOnly(byTimeDate)} · only actual sale hours
                  </p>
                </div>
                <div className="ana-time-controls">
                  <label className="ana-filter-label" htmlFor="ana-bytime-product">
                    Product
                  </label>
                  <div className="dash-select-wrap">
                    <select
                      id="ana-bytime-product"
                      className="dash-select"
                      aria-label="Product for sales by time"
                      value={byTimeProductId || ''}
                      onChange={(event) => setByTimeProductId(Number(event.target.value))}
                    >
                      {master.data?.items?.map((row) => (
                        <option key={row.productId} value={row.productId}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
                  </div>
                  <label className="ana-filter-label" htmlFor="ana-bytime-date">
                    Date
                  </label>
                  <input
                    id="ana-bytime-date"
                    type="date"
                    className="ana-date-input"
                    value={byTimeDate}
                    onChange={(event) => setByTimeDate(event.target.value || todayString())}
                  />
                </div>
              </div>

              {byTime.loading || !byTimeProductId ? (
                <SectionLoading label="Loading time slots…" />
              ) : !byTimeData || !byTimeData.slots.length ? (
                <InlineEmpty
                  icon={FiClock}
                  title="No sales recorded on this date"
                  message="Hourly sales will appear here for the selected product and date."
                />
              ) : (
                <div className="dash-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hour</th>
                        <th className="num">Sales</th>
                        <th className="num">Customers</th>
                        <th className="num">Qty</th>
                        <th className="num">Revenue</th>
                        <th className="num">Avg ₹</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byTimeData.slots.map((slot) => (
                        <tr key={slot.slotLabel}>
                          <td>{slot.slotLabel}</td>
                          <td className="num">{formatCount(slot.salesCount)}</td>
                          <td className="num">{formatCount(slot.customerCount)}</td>
                          <td className="num">{formatQuantity(slot.quantity)}</td>
                          <td className="num">{formatMoney(slot.amount)}</td>
                          <td className="num">{formatMoney(slot.avgPrice)}</td>
                        </tr>
                      ))}
                      <tr className="ana-totals-row">
                        <td>Total</td>
                        <td className="num">{formatCount(byTimeData.totals.salesCount)}</td>
                        <td className="num">{formatCount(byTimeData.totals.customerCount)}</td>
                        <td className="num">{formatQuantity(byTimeData.totals.quantity)}</td>
                        <td className="num">{formatMoney(byTimeData.totals.amount)}</td>
                        <td className="num">{formatMoney(byTimeData.totals.avgPrice)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <section className="ana-detail-grid">
            <article className="dash-card">
              <div className="dash-card-head">
                <div>
                  <h2 className="dash-card-title">Recent Sales</h2>
                  <p className="dash-card-caption">{selectedProduct.name} · {range.label}</p>
                </div>
                <span className="dash-card-icon" aria-hidden="true">
                  <FiShoppingCart size={18} />
                </span>
              </div>

              {recentSales.loading && !recentSales.data ? (
                <SectionLoading label="Loading sales…" />
              ) : recentSalesItems.length ? (
                <>
                  <div className="dash-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date &amp; time</th>
                          <th>Invoice</th>
                          <th>Customer</th>
                          <th className="num">Qty</th>
                          <th className="num">Unit price</th>
                          <th className="num">Line total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentSalesItems.map((line) => (
                          <tr key={line.saleItemId}>
                            <td>{formatDateTime(line.saleDate)}</td>
                            <td>{line.invoiceNumber || `#${line.saleId}`}</td>
                            <td>{line.customerName}</td>
                            <td className="num">
                              {formatQuantity(line.quantity)}
                              {line.unit ? ` ${line.unit}` : ''}
                            </td>
                            <td className="num">{formatMoney(line.unitPrice)}</td>
                            <td className="num">{formatMoney(line.lineTotal)}</td>
                            <td>{line.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={salesPage}
                    totalPages={recentSalesPagination?.totalPages || 1}
                    totalItems={recentSalesPagination?.total || 0}
                    pageSize={RECENT_SALES_PAGE_SIZE}
                    onChange={setSalesPage}
                  />
                </>
              ) : (
                <InlineEmpty
                  icon={FiShoppingCart}
                  title="No sales in this period"
                  message="Exact sale lines will appear here once the product is sold."
                />
              )}
            </article>

            <article className="dash-card">
              <div className="dash-card-head">
                <div>
                  <h2 className="dash-card-title">Stock Movement</h2>
                  <p className="dash-card-caption">
                    {STOCK_TYPES.find((option) => option.value === stockType)?.label || 'All movements'} ·{' '}
                    {formatDateOnly(stockDate)}
                  </p>
                </div>
                <div className="ana-time-controls">
                  <label className="ana-filter-label" htmlFor="ana-stock-product">
                    Product
                  </label>
                  <div className="dash-select-wrap">
                    <select
                      id="ana-stock-product"
                      className="dash-select"
                      aria-label="Product for stock movement"
                      value={stockProductId || ''}
                      onChange={(event) => {
                        setStockProductId(Number(event.target.value));
                        setStockPage(1);
                      }}
                    >
                      {master.data?.items?.map((row) => (
                        <option key={row.productId} value={row.productId}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
                  </div>
                  <label className="ana-filter-label" htmlFor="ana-stock-date">
                    Date
                  </label>
                  <input
                    id="ana-stock-date"
                    type="date"
                    className="ana-date-input"
                    value={stockDate}
                    onChange={(event) => {
                      setStockDate(event.target.value || todayString());
                      setStockPage(1);
                    }}
                  />
                  <div className="dash-select-wrap">
                    <select
                      className="dash-select"
                      aria-label="Stock movement type"
                      value={stockType}
                      onChange={(event) => {
                        setStockType(event.target.value);
                        setStockPage(1);
                      }}
                    >
                      {STOCK_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown size={14} className="dash-select-chevron" aria-hidden="true" />
                  </div>
                </div>
              </div>

              {stockTx.loading || !stockProductId ? (
                <SectionLoading label="Loading movements…" />
              ) : stockTxItems.length ? (
                <>
                  <div className="dash-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date &amp; time</th>
                          <th>Type</th>
                          <th className="num">Before → After</th>
                          <th className="num">Change</th>
                          <th>Note</th>
                          <th>User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockTxItems.map((tx) => (
                          <tr key={tx.id}>
                            <td>{formatDateTime(tx.createdAt)}</td>
                            <td>{transactionTypeLabel(tx.transactionType)}</td>
                            <td className="num">
                              {formatQuantity(tx.quantityBefore)} → {formatQuantity(tx.quantityAfter)}
                            </td>
                            <td className="num">
                              <span className={Number(tx.quantityChange) >= 0 ? 'ana-qty-pos' : 'ana-qty-neg'}>
                                {Number(tx.quantityChange) >= 0 ? '+' : ''}
                                {formatQuantity(tx.quantityChange)}
                              </span>
                            </td>
                            <td className="cell-sub">{tx.note || '—'}</td>
                            <td>{tx.createdByName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={stockPage}
                    totalPages={stockTxPagination?.totalPages || 1}
                    totalItems={stockTxPagination?.total || 0}
                    pageSize={STOCK_TX_PAGE_SIZE}
                    onChange={setStockPage}
                  />
                </>
              ) : (
                <InlineEmpty
                  icon={FiBox}
                  title="No stock movements on this date"
                  message="Purchases, sales, damages and adjustments for the selected product and date will appear here."
                />
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}