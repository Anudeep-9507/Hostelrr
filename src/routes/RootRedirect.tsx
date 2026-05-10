import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from './routes';
import { Loader2 } from 'lucide-react';

/**
 * Smart root redirect:
 * - authenticated → /dashboard
 * - unauthenticated → /signin
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
    return <Navigate to={ROUTES.dashboard.path} replace />;
  }

  return <Navigate to={ROUTES.signin.path} replace />;
}
