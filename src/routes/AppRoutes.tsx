import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ROUTES } from './routes';
import AuthGuard from './AuthGuard';
import RootRedirect from './RootRedirect';
import ProtectedAppRoutes from './ProtectedAppRoutes';
import ScrollToTop from '../components/ScrollToTop';

import SignIn from '../pages/SignIn';
import SignUp from '../pages/SignUp';
import JoinForm from '../pages/JoinForm';
import AdminLogin from '../pages/AdminLogin';
import AdminGuard from './AdminGuard';
import AdminLayout from '../layouts/AdminLayout';
import { AdminOverview, AdminUsers, AdminOwnerDetail, AdminHostels, AdminHostelDetail, AdminSubscriptionsPage, AdminPayments, AdminRentPayments, AdminSystem, AdminAudit, AdminAdmins, AdminSettings, AdminDemoRequests } from '../pages/AdminConsole';
import LandingPage from '../pages/LandingPage';
import { useApp } from '../context/AppContext';

const APP_HOST = 'app.hostelrr.in';
const MARKETING_HOSTS = new Set(['hostelrr.in', 'www.hostelrr.in']);
const MARKETING_PATHS = new Set(['/', '/pricing', '/about', '/contact']);
const APP_PATHS = new Set([
  '/dashboard', '/rooms', '/residents', '/payments', '/settings', '/notes',
  '/monthly-overview', '/subscription', '/onboarding', '/signin', '/login',
  '/signup', '/admin', '/admin/login', '/join',
]);

function NotFound() {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"><h1 className="text-3xl font-bold">Page not found</h1><p className="text-slate-600">The page you requested doesn’t exist.</p><a className="font-semibold text-blue-600" href="/">Return home</a></main>;
}

function AppRootRedirect() {
  const { session, authLoading } = useApp();
  if (authLoading) return <RootRedirect />;
  if (session?.user.app_metadata?.platform_role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to={session ? ROUTES.dashboard.path : '/login'} replace />;
}

function HostRoutes() {
  const location = useLocation();
  const hostname = window.location.hostname.toLowerCase();
  const pathname = location.pathname;

  if (MARKETING_HOSTS.has(hostname)) {
    const isAppRoute = APP_PATHS.has(pathname) || pathname.startsWith('/admin/') || pathname.startsWith('/join/');
    if (isAppRoute) {
      const target = new URL(`https://${APP_HOST}${location.pathname}${location.search}${location.hash}`);
      window.location.replace(target.toString());
      return null;
    }
    if (MARKETING_PATHS.has(pathname)) return <LandingPage />;
    return <NotFound />;
  }

  if (hostname === APP_HOST) {
    if (pathname === '/') return <AppRootRedirect />;
    if (pathname === '/login') return <SignIn />;
    if (pathname === '/signin') return <SignIn />;
  }

  return <AppRouteTree />;
}

function AppRouteTree() {
  return <Routes>
    <Route path={ROUTES.home.path} element={<RootRedirect />} />
    <Route path={ROUTES.signin.path} element={<SignIn />} />
    <Route path={ROUTES.signup.path} element={<SignUp />} />
    <Route path={`${ROUTES.join.path}/:slug`} element={<JoinForm />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route element={<AdminGuard />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminOwnerDetail />} />
        <Route path="hostels" element={<AdminHostels />} />
        <Route path="demo-requests" element={<AdminDemoRequests />} />
        <Route path="hostels/:id" element={<AdminHostelDetail />} />
        <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="payments" element={<><AdminPayments /><AdminRentPayments /></>} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="audit-logs" element={<AdminAudit />} />
        <Route path="admins" element={<AdminAdmins />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Route>
    <Route element={<AuthGuard />}>{ProtectedAppRoutes()}</Route>
    <Route path="*" element={window.location.hostname.toLowerCase() === APP_HOST ? <NotFound /> : <Navigate to={ROUTES.home.path} replace />} />
  </Routes>;
}

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <HostRoutes />
    </>
  );
}
