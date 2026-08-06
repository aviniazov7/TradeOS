import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../shared/LoadingSpinner';

// Gates a route to Premium users. While auth/profile is still resolving we hold
// on the spinner (so a premium user isn't flash-redirected before their plan
// loads); once resolved, non-premium users are sent to the upgrade page.
export default function PremiumRoute({ children }) {
  const { isPremium, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return isPremium ? children : <Navigate to="/premium" replace />;
}
