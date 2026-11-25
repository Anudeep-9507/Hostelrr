import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineError() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
          <WifiOff className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-950">No Internet Connection</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Check your internet connection and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
