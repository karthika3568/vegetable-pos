/**
 * Application navigation, grouped into logical sections.
 *
 * Every item carries the backend permission code required to see it and
 * a `labelKey` that resolves through the i18n dictionaries. The sidebar
 * (and any menu) hides items the user cannot access. Server-side
 * authorization remains authoritative - hiding a link is UI-only, never
 * a security boundary.
 */
import {
  FiBarChart2,
  FiBriefcase,
  FiClipboard,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiFolder,
  FiHome,
  FiLayers,
  FiPackage,
  FiRotateCcw,
  FiSettings,
  FiShoppingCart,
  FiTrendingDown,
  FiTrendingUp,
  FiTruck,
  FiUsers,
} from 'react-icons/fi';

export const NAVIGATION = [
  {
    id: 'overview',
    labelKey: 'nav.overview',
    items: [
      { id: 'dashboard', labelKey: 'nav.dashboard', path: '/dashboard', permission: 'reports.view', icon: FiHome },
    ],
  },
  {
    id: 'sales',
    labelKey: 'nav.sales',
    items: [
      { id: 'pos', labelKey: 'nav.pos', path: '/pos', permission: 'sales.create', icon: FiShoppingCart },
      { id: 'sales-history', labelKey: 'nav.salesHistory', path: '/sales', permission: 'sales.view', icon: FiClipboard },
      { id: 'invoices', labelKey: 'nav.invoices', path: '/invoices', permission: 'sales.view', icon: FiFileText },
      { id: 'returns', labelKey: 'nav.returns', path: '/returns', permission: 'sales.cancel', icon: FiRotateCcw },
    ],
  },
  {
    id: 'stock',
    labelKey: 'nav.stockPurchases',
    items: [
      { id: 'purchases', labelKey: 'nav.purchases', path: '/purchases', permission: 'purchases.view', icon: FiTruck },
      { id: 'stock', labelKey: 'nav.stockLevels', path: '/stock', permission: 'stock.view', icon: FiPackage },
    ],
  },
  {
    id: 'catalog',
    labelKey: 'nav.catalog',
    items: [
      { id: 'products', labelKey: 'nav.products', path: '/products', permission: 'products.manage', icon: FiPackage },
      { id: 'categories', labelKey: 'nav.categories', path: '/categories', permission: 'products.manage', icon: FiFolder },
      { id: 'variants', labelKey: 'nav.productVariants', path: '/variants', permission: 'products.manage', icon: FiLayers },
      { id: 'tax-codes', labelKey: 'nav.taxCodes', path: '/tax-codes', permission: 'settings.manage', icon: FiFileText },
    ],
  },
  {
    id: 'people',
    labelKey: 'nav.people',
    items: [
      { id: 'customers', labelKey: 'nav.customers', path: '/customers', permission: 'customers.manage', icon: FiUsers },
      { id: 'suppliers', labelKey: 'nav.suppliers', path: '/suppliers', permission: 'suppliers.manage', icon: FiBriefcase },
    ],
  },
  {
    id: 'credit',
    labelKey: 'nav.creditMoney',
    items: [
      { id: 'credit', labelKey: 'nav.credit', path: '/credits', permission: 'credit.view', icon: FiCreditCard },
      { id: 'expenses', labelKey: 'nav.expenses', path: '/expenses', permission: 'expenses.manage', icon: FiTrendingDown },
      { id: 'income', labelKey: 'nav.income', path: '/income', permission: 'expenses.manage', icon: FiTrendingUp },
      { id: 'profit', labelKey: 'nav.profit', path: '/profit', permission: 'reports.view', icon: FiDollarSign },
    ],
  },
  {
    id: 'insights',
    labelKey: 'nav.insights',
    items: [
      { id: 'reports', labelKey: 'nav.reports', path: '/reports', permission: 'reports.view', icon: FiBarChart2 },
      { id: 'analytics', labelKey: 'nav.analytics', path: '/analytics', permission: 'reports.view', icon: FiTrendingUp },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.system',
    // Audit logs are intentionally not a user-facing module.
    items: [
      { id: 'settings', labelKey: 'nav.settings', path: '/settings', permission: 'settings.manage', icon: FiSettings },
      { id: 'users', labelKey: 'nav.users', path: '/users', permission: 'users.manage', icon: FiUsers },
    ],
  },
];

// Kept separately so future consumers (global search, command palette, etc.)
// can reuse the same permission filtering without duplicating rules.
export function filterNavigationByPermission(navigation, hasPermission) {
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}