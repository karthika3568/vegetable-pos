import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import RequirePermission from '../components/RequirePermission.jsx';
import HomeRedirect from '../components/HomeRedirect.jsx';
import MainLayout from '../layouts/MainLayout.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import ProductsPage from '../pages/ProductsPage.jsx';
import POSPage from '../pages/POSPage.jsx';
import SalesPage from '../pages/SalesPage.jsx';
import PurchasesPage from '../pages/PurchasesPage.jsx';
import CreditPage from '../pages/CreditPage.jsx';
import InvoicePage from '../pages/InvoicePage.jsx';
import ReturnsPage from '../pages/ReturnsPage.jsx';
import ExpensesIncomePage from '../pages/ExpensesIncomePage.jsx';
import ProfitPage from '../pages/ProfitPage.jsx';
import ReportsPage from '../pages/ReportsPage.jsx';
import StockPage from '../pages/StockPage.jsx';
import CategoriesPage from '../pages/CategoriesPage.jsx';
import VariantsPage from '../pages/VariantsPage.jsx';
import CustomersPage from '../pages/CustomersPage.jsx';
import SuppliersPage from '../pages/SuppliersPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import TaxCodesPage from '../pages/TaxCodesPage.jsx';
import UsersPage from '../pages/UsersPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import UnauthorizedPage from '../pages/UnauthorizedPage.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRedirect />} />

        <Route
          path="dashboard"
          element={
            <RequirePermission permission="reports.view">
              <DashboardPage />
            </RequirePermission>
          }
        />

        <Route
          path="products"
          element={
            <RequirePermission permission="products.manage">
              <ProductsPage />
            </RequirePermission>
          }
        />

        <Route
          path="pos"
          element={
            <RequirePermission permission="sales.create">
              <POSPage />
            </RequirePermission>
          }
        />

        <Route
          path="sales"
          element={
            <RequirePermission permission="sales.view">
              <SalesPage />
            </RequirePermission>
          }
        />

        <Route
          path="purchases"
          element={
            <RequirePermission permission="purchases.view">
              <PurchasesPage />
            </RequirePermission>
          }
        />

        <Route
          path="invoices"
          element={
            <RequirePermission permission="sales.view">
              <InvoicePage />
            </RequirePermission>
          }
        />

        <Route
          path="returns"
          element={
            <RequirePermission permission="sales.cancel">
              <ReturnsPage />
            </RequirePermission>
          }
        />

        <Route
          path="credits"
          element={
            <RequirePermission permission="credit.view">
              <CreditPage />
            </RequirePermission>
          }
        />

        <Route
          path="expenses"
          element={
            <RequirePermission permission="expenses.manage">
              <ExpensesIncomePage type="expense" />
            </RequirePermission>
          }
        />

        <Route
          path="income"
          element={
            <RequirePermission permission="expenses.manage">
              <ExpensesIncomePage type="income" />
            </RequirePermission>
          }
        />

        <Route
          path="profit"
          element={
            <RequirePermission permission="reports.view">
              <ProfitPage />
            </RequirePermission>
          }
        />

        <Route
          path="reports"
          element={
            <RequirePermission permission="reports.view">
              <ReportsPage />
            </RequirePermission>
          }
        />

        <Route
          path="stock"
          element={
            <RequirePermission permission="stock.view">
              <StockPage />
            </RequirePermission>
          }
        />

        <Route
          path="categories"
          element={
            <RequirePermission permission="products.manage">
              <CategoriesPage />
            </RequirePermission>
          }
        />

        <Route
          path="variants"
          element={
            <RequirePermission permission="products.manage">
              <VariantsPage />
            </RequirePermission>
          }
        />

        <Route
          path="customers"
          element={
            <RequirePermission permission="customers.manage">
              <CustomersPage />
            </RequirePermission>
          }
        />

        <Route
          path="suppliers"
          element={
            <RequirePermission permission="suppliers.manage">
              <SuppliersPage />
            </RequirePermission>
          }
        />

        <Route
          path="settings"
          element={
            <RequirePermission permission="settings.manage">
              <SettingsPage />
            </RequirePermission>
          }
        />

        <Route
          path="tax-codes"
          element={
            <RequirePermission permission="settings.manage">
              <TaxCodesPage />
            </RequirePermission>
          }
        />

        <Route
          path="users"
          element={
            <RequirePermission permission="users.manage">
              <UsersPage />
            </RequirePermission>
          }
        />

        <Route path="/403" element={<UnauthorizedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}