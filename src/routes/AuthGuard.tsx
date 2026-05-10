import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from './routes';
import { Loader2, Database } from 'lucide-react';
import EmptyState from '../components/EmptyState';

export default function AuthGuard() {
  const { session, authLoading, isDataLoading, isOnboardingComplete, dataFetchError, retryDataFetch } = useApp();
  const location = useLocation();

  if (dataFetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <EmptyState 
          icon={Database}
          title="Connection Error"
          subtitle="Failed to connect to the database. Please check your internet connection and try again."
          action={{
            label: "Retry Connection",
            onClick: retryDataFetch
          }}
        />
      </div>
    );
  }

  // Show loading spinner while auth/data is being determined
  if (authLoading || isDataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Not authenticated → redirect to sign in
  if (!session) {
    return <Navigate to={ROUTES.signin.path} replace />;
  }

  // Authenticated but onboarding not complete → redirect to onboarding
  // (unless already on onboarding page)
  if (!isOnboardingComplete && location.pathname !== ROUTES.onboarding.path) {
    return <Navigate to={ROUTES.onboarding.path} replace />;
  }

  // Onboarding complete but user manually navigates to /onboarding → redirect to dashboard
  if (isOnboardingComplete && location.pathname === ROUTES.onboarding.path) {
    return <Navigate to={ROUTES.dashboard.path} replace />;
  }

  return <Outlet />;
}
