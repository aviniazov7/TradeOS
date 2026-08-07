import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../shared/LoadingSpinner';

// Gates a route to admins only. Used to keep the Wyckoff scanner private (owner-
// only) while it's still being calibrated — non-admins are sent home.
export default function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return isAdmin ? children : <Navigate to="/" replace />;
}
