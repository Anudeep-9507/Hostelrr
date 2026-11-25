import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from './routes';
import { Loader2 } from 'lucide-react';
import LandingPage from '../pages/LandingPage';

/**
 * Smart root redirect:
 * - authenticated → /dashboard
 * - unauthenticated → public landing page
 * - loading → spinner
 */
export default function RootRedirect() {
  const { session, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (session) {
    if (session.user.app_metadata?.platform_role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to={ROUTES.dashboard.path} replace />;
  }

  return <LandingPage />;
}
