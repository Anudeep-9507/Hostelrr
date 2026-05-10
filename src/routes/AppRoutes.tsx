import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import AuthGuard from './AuthGuard';
import RootRedirect from './RootRedirect';
import ProtectedAppRoutes from './ProtectedAppRoutes';
import ScrollToTop from '../components/ScrollToTop';

import SignIn from '../pages/SignIn';
import SignUp from '../pages/SignUp';
import JoinForm from '../pages/JoinForm';

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
