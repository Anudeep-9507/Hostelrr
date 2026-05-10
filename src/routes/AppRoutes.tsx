import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import AuthGuard from './AuthGuard';
import AppLayout from '../layouts/AppLayout';
import ScrollToTop from '../components/ScrollToTop';

import Dashboard from '../pages/Dashboard';
import BuildingView from '../pages/BuildingView';
import Residents from '../pages/Residents';
import Payments from '../pages/Payments';
import Settings from '../pages/Settings';
import SignIn from '../pages/SignIn';
import SignUp from '../pages/SignUp';
import Onboarding from '../pages/Onboarding';
import JoinForm from '../pages/JoinForm';

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Root redirect */}
        <Route path={ROUTES.home} element={<Navigate to={ROUTES.dashboard} replace />} />

        {/* Public routes */}
        <Route path={ROUTES.signin} element={<SignIn />} />
        <Route path={ROUTES.signup} element={<SignUp />} />
        <Route path={`${ROUTES.join}/:slug`} element={<JoinForm />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route path={ROUTES.onboarding} element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route path={ROUTES.dashboard} element={<Dashboard />} />
            <Route path={ROUTES.rooms} element={<BuildingView />} />
            <Route path={ROUTES.residents} element={<Residents />} />
            <Route path={ROUTES.payments} element={<Payments />} />
            <Route path={ROUTES.settings} element={<Settings />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </>
  );
}
