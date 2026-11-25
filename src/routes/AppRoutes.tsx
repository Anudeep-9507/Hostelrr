import { Routes, Route, Navigate } from 'react-router-dom';
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

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Smart root redirect — auth-aware */}
        <Route path={ROUTES.home.path} element={<RootRedirect />} />

        {/* Public routes */}
        <Route path={ROUTES.signin.path} element={<SignIn />} />
        <Route path={ROUTES.signup.path} element={<SignUp />} />
        <Route path={`${ROUTES.join.path}/:slug`} element={<JoinForm />} />

        {/* The admin portal has its own login, guard, and layout. */}
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

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          {ProtectedAppRoutes()}
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={ROUTES.home.path} replace />} />
      </Routes>
    </>
  );
}
