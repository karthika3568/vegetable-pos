import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageLoader from './PageLoader.jsx';

/**
 * Guards the authenticated application shell. While the session is being
 * hydrated from /auth/me a loader is shown; unauthenticated users are
 * sent to /login.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoader label="Checking your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}