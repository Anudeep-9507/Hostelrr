import { Route } from 'react-router-dom';
import { ROUTES } from './routes';
import AppLayout from '../layouts/AppLayout';

import Dashboard from '../pages/Dashboard';
import BuildingView from '../pages/BuildingView';
import Residents from '../pages/Residents';
import Payments from '../pages/Payments';
import Settings from '../pages/Settings';
import Onboarding from '../pages/Onboarding';

/**
 * Protected app routes — wrapped by AuthGuard in AppRoutes.
 * Separated to prepare for future subscription/role/feature checks.
 */
export default function ProtectedAppRoutes() {
  return (
    <>
      <Route path={ROUTES.onboarding.path} element={<Onboarding />} />
      <Route element={<AppLayout />}>
        <Route path={ROUTES.dashboard.path} element={<Dashboard />} />
        <Route path={ROUTES.rooms.path} element={<BuildingView />} />
        <Route path={ROUTES.residents.path} element={<Residents />} />
        <Route path={ROUTES.payments.path} element={<Payments />} />
        <Route path={ROUTES.settings.path} element={<Settings />} />
      </Route>
    </>
  );
}
