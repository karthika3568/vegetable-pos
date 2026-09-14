import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Permission-aware redirect for the "/" index route.
 *
 * The POS is the primary working screen, so anyone who can sell lands
 * there first. Users who cannot sell but can view reports go to the
 * dashboard. Anyone else has no usable destination.
 */
export default function HomeRedirect() {
  const { hasPermission } = useAuth();

  if (hasPermission('sales.create')) return <Navigate to="/pos" replace />;
  if (hasPermission('reports.view')) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/403" replace />;
}