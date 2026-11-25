import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPlatformAdminStatus } from '../lib/supabaseAPI';

export default function AdminGuard() {
  const { session, authLoading } = useApp();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!session) { setAuthorized(false); setVerificationFailed(false); return; }
    setAuthorized(null);
    setVerificationFailed(false);
    getPlatformAdminStatus().then(value => { if (active) setAuthorized(value); })
      .catch(() => { if (active) setVerificationFailed(true); });
    return () => { active = false; };
  }, [session?.user?.id, retryCount]);

  if (authLoading || (session && authorized === null && !verificationFailed)) return <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb]"><LoaderCircle className="h-7 w-7 animate-spin text-indigo-600" aria-label="Checking admin access" /></div>;
  if (session && verificationFailed) return <div className="grid min-h-screen place-items-center bg-[#f6f7fb] p-6"><div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><h1 className="font-bold text-slate-900">Could not verify administrator access</h1><p className="mt-2 text-sm text-slate-500">Your session is still saved. Check your connection and retry.</p><button onClick={() => setRetryCount(count => count + 1)} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Try again</button></div></div>;
  if (!session || !authorized) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
