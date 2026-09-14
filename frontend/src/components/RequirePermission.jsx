import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageLoader from './PageLoader.jsx';

/**
 * UI-level permission gate for a route. Hiding/blocking is never a
 * security boundary - the backend enforces authorization on every
 * request. This only keeps unauthorized users out of the page shell
 * and routes them to the 403 screen.
 */
export default function RequirePermission({ permission, children }) {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();

  if (isLoading) return <PageLoader label="Checking your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/403" replace />;
  return children;
}