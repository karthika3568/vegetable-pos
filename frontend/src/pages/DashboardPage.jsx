import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiArrowRight, FiBox, FiFileText, FiPackage, FiRefreshCw, FiShoppingCart, FiTrendingUp, FiUserPlus, FiUsers } from 'react-icons/fi';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../context/AuthContext.jsx';
import { dashboardService } from '../services/dashboard.service.js';
import { stockService } from '../services/stock.service.js';
import { customerService } from '../services/customer.service.js';
import PageLoader from '../components/PageLoader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import StatCard from '../components/StatCard.jsx';
import { formatMoney, formatQuantity, formatCount, formatDateOnly } from '../utils/format.js';

function QuickActionButton({ label, icon: Icon, onClick, tone = 'default' }) {
  return (
    <button type="button" className={`quick-action quick-action-${tone}`} onClick={onClick}>
      <span className="quick-action-icon" aria-hidden="true"><Icon size={16} /></span>
      <span>{label}</span>
      <FiArrowRight className="quick-action-arrow" size={14} />
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch } = useAsync(async () => {
    const [summary, stockPage, customerPage] = await Promise.all([
      dashboardService.getSummary({ top: 5 }),
      stockService.list({ page: 1, limit: 100 }),
      customerService.list({ page: 1, limit: 1 }),
    ]);

    return { summary, stockPage, customerPage };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const summary = useMemo(() => data?.summary ?? null, [data]);
  const period = useMemo(() => summary?.period ?? {}, [summary]);
  const sales = useMemo(() => summary?.sales ?? {}, [summary]);
  const topProducts = useMemo(() => summary?.topProducts ?? [], [summary]);
  const recentSales = useMemo(() => summary?.recentSales ?? [], [summary]);
  const recentPurchases = useMemo(() => summary?.recentPurchases ?? [], [summary]);

  const customerTotal = useMemo(() => {
    const total = Number(data?.customerPage?.pagination?.total ?? summary?.topCustomers?.length ?? 0);
    return Number.isFinite(total) ? total : 0;
  }, [data, summary]);

  const lowStockProducts = useMemo(() => {
    return (data?.stockPage?.items ?? [])
      .filter((item) => {
        const quantity = Number(item.quantity ?? 0);
        const minimumStock = Number(item.minimum_stock ?? 0);
        return minimumStock > 0 ? quantity <= minimumStock : quantity <= 0;
      })
      .slice(0, 5)
      .map((item) => ({
        id: item.product_id,
        name: item.product_name,
        stock: Number(item.quantity ?? 0),
        unit: item.unit || '',
        minimumStock: Number(item.minimum_stock ?? 0),
        status: Number(item.quantity ?? 0) <= 0 ? 'Out of stock' : 'Low stock',
      }));
  }, [data]);

  const salesTrendValues = useMemo(() => {
    const values = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const total = (recentSales || []).reduce((sum, sale) => {
        const saleDate = sale.saleDate ? new Date(sale.saleDate).toISOString().slice(0, 10) : null;
        return saleDate === key ? sum + Number(sale.totalAmount ?? 0) : sum;
      }, 0);
      return {
        label: date.toLocaleDateString([], { weekday: 'short' }),
        value: total,
      };
    });

    const maxValue = Math.max(...values.map((bucket) => bucket.value), 1);
    return values.map((bucket) => ({
      ...bucket,
      height: (bucket.value / maxValue) * 100,
    }));
  }, [recentSales]);

  const recentActivities = useMemo(() => {
    return [
      ...(recentSales || []).slice(0, 2).map((sale) => ({
        id: `sale-${sale.saleId}`,
        title: 'Sale completed',
        detail: `${sale.customer || 'Walk-in Customer'} • ${formatMoney(sale.totalAmount)}`,
        time: sale.saleDate,
      })),
      ...(recentPurchases || []).slice(0, 2).map((purchase) => ({
        id: `purchase-${purchase.purchaseId}`,
        title: 'Purchase received',
        detail: `${purchase.supplier || 'Supplier'} • ${formatMoney(purchase.totalAmount)}`,
        time: purchase.purchaseDate,
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 4);
  }, [recentPurchases, recentSales]);

  const summaryCards = useMemo(() => [
    {
      label: "Today's Sales",
      value: formatMoney(sales.netSalesRevenue),
      sub: `${formatCount(sales.saleCount || 0)} orders`,
      tone: 'success',
      icon: FiTrendingUp,
    },
    {
      label: 'Orders',
      value: formatCount(sales.saleCount || 0),
      sub: `${formatCount(sales.completedSaleCount || 0)} completed`,
      tone: 'default',
      icon: FiShoppingCart,
    },
    {
      label: 'Customers',
      value: formatCount(customerTotal),
      sub: customerTotal === 1 ? '1 active customer' : 'customers',
      tone: 'default',
      icon: FiUsers,
    },
    {
      label: 'Low Stock',
      value: formatCount(lowStockProducts.length),
      sub: lowStockProducts.length ? 'Needs attention' : 'All stocked',
      tone: lowStockProducts.length ? 'warning' : 'success',
      icon: FiAlertTriangle,
    },
  ], [customerTotal, lowStockProducts, sales]);

  const quickActions = useMemo(() => {
    const actions = [];
    if (hasPermission('sales.create')) {
      actions.push({ label: 'Create Sale', icon: FiShoppingCart, onClick: () => navigate('/pos'), tone: 'success' });
    }
    if (hasPermission('products.manage')) {
      actions.push({ label: 'Add Product', icon: FiBox, onClick: () => navigate('/products'), tone: 'default' });
    }
    if (hasPermission('customers.manage')) {
      actions.push({ label: 'Add Customer', icon: FiUserPlus, onClick: () => navigate('/customers'), tone: 'default' });
    }
    if (hasPermission('purchases.create')) {
      actions.push({ label: 'Add Purchase', icon: FiPackage, onClick: () => navigate('/purchases'), tone: 'default' });
    }
    if (hasPermission('reports.view')) {
      actions.push({ label: 'View Reports', icon: FiFileText, onClick: () => navigate('/reports'), tone: 'default' });
    }
    return actions;
  }, [hasPermission, navigate]);

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
      <div className="dash-header">
        <div>
          <p className="dash-eyebrow">Business overview</p>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-period">
            {formatDateOnly(period.fromDate || new Date())} — {formatDateOnly(period.toDate || new Date())}
          </p>
        </div>

        <div className="dash-actions">
          <button type="button" className="btn btn-outline" onClick={handleRefresh} disabled={refreshing} aria-busy={refreshing}>
            <FiRefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <section className="dashboard-panel dashboard-panel-emphasis">
            <div className="panel-head">
              <h2 className="panel-title">Low Stock Items</h2>
              <button type="button" className="panel-link-button" onClick={() => navigate('/stock')}>
                View All Stock
              </button>
            </div>

            {lowStockProducts.length ? (
              <div className="low-stock-list">
                {lowStockProducts.map((item) => (
                  <div key={item.id} className="low-stock-item">
                    <div className="low-stock-name-wrap">
                      <span className="low-stock-name">{item.name}</span>
                      <span className="low-stock-meta">{item.unit ? `${formatQuantity(item.stock)} ${item.unit}` : formatQuantity(item.stock)}</span>
                    </div>
                    <div className="low-stock-meta-wrap">
                      <span className={`status-pill ${item.status === 'Out of stock' ? 'status-danger' : 'status-warning'}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">All products are sufficiently stocked.</div>
            )}
          </section>

          <section className="dashboard-panel">
            <div className="panel-head">
              <h2 className="panel-title">Sales Overview</h2>
              <button type="button" className="panel-link-button" onClick={() => navigate('/sales')}>
                View Sales
              </button>
            </div>

            <div className="sales-overview-panel">
              <div className="sales-overview-summary">
                <span className="sales-overview-label">This period</span>
                <strong>{formatMoney(sales.netSalesRevenue)}</strong>
              </div>

              <div className="sales-chart" aria-label="Sales trend chart">
                {salesTrendValues.map((bucket) => (
                  <div key={bucket.label} className="sales-chart-bar-wrap">
                    <div className="sales-chart-bar" style={{ height: `${bucket.height}%` }} />
                    <span className="sales-chart-label">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="dashboard-side-column">
          <section className="dashboard-panel">
            <div className="panel-head">
              <h2 className="panel-title">Top Selling Products</h2>
              <button type="button" className="panel-link-button" onClick={() => navigate('/sales')}>
                View All Sales
              </button>
            </div>

            {topProducts.length ? (
              <div className="dashboard-mini-table-wrap">
                <table className="dashboard-mini-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th className="num">Qty</th>
                      <th className="num">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((product, index) => (
                      <tr key={product.productId ?? `${product.productName}-${index}`}>
                        <td className="cell-index">{index + 1}</td>
                        <td>
                          <span className="cell-main">{product.productName}</span>
                          {product.sku ? <span className="cell-sub">{product.sku}</span> : null}
                        </td>
                        <td className="num">{formatQuantity(product.netQuantity ?? product.soldQuantity ?? 0)}</td>
                        <td className="num">{formatMoney(product.netSales ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dashboard-empty">No sales recorded in this period yet.</div>
            )}
          </section>

          <section className="dashboard-panel">
            <div className="panel-head">
              <h2 className="panel-title">Recent Activities</h2>
              <button type="button" className="panel-link-button" onClick={() => navigate('/sales')}>
                View All
              </button>
            </div>

            {recentActivities.length ? (
              <div className="activities-list">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="activity-item">
                    <div className="activity-icon" aria-hidden="true">•</div>
                    <div className="activity-copy">
                      <span className="activity-title">{activity.title}</span>
                      <span className="activity-detail">{activity.detail}</span>
                    </div>
                    <span className="activity-time">
                      {new Date(activity.time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">No recent activity found.</div>
            )}
          </section>
        </div>
      </div>

      <section className="quick-actions">
        <div className="panel-head quick-actions-heading">
          <h2 className="panel-title">Quick Actions</h2>
        </div>

        <div className="quick-actions-grid">
          {quickActions.map((action) => (
            <QuickActionButton
              key={action.label}
              label={action.label}
              icon={action.icon}
              onClick={action.onClick}
              tone={action.tone}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
