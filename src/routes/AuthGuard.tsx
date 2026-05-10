import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from './routes';
import { Loader2 } from 'lucide-react';

export default function AuthGuard() {
  const { session, authLoading, isDataLoading, isOnboardingComplete } = useApp();
  const location = useLocation();

  // Show loading spinner while auth/data is being determined
  if (authLoading || isDataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
