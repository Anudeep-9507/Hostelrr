import { AppProvider } from './context/AppContext';
import AppRoutes from './routes/AppRoutes';
import OfflineError from './components/OfflineError';

export default function App() {
  return (
    <AppProvider>
      <OfflineError />
      <AppRoutes />
    </AppProvider>
  );
}
