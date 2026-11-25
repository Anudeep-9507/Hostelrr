import { useState, type FormEvent } from 'react';
import { AlertCircle, LoaderCircle, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import { supabase } from '../supabaseClient';

interface Props {
  error: Error;
  componentStack?: string;
}

function redact(value: string, limit: number) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/((?:password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*)([^\s,;]+)/gi, '$1[REDACTED]')
    .slice(0, limit);
}

export default function ErrorReportButton({ error, componentStack = '' }: Props) {
  const { hostelProfile, session, isDemoMode } = useApp();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || sent) return;
    if (isDemoMode || !session?.user?.id || !hostelProfile?.id) {
      toast.error('Sign in to a hostel account before sending an error report.');
      return;
    }

    setBusy(true);
    try {
      const { error: insertError } = await supabase.from('hostel_error_reports').insert({
        hostel_id: hostelProfile.id,
        reporter_id: session.user.id,
        comment: comment.trim() || null,
        error_name: redact(error.name || 'Error', 200),
        error_message: redact(error.message || 'Unexpected application error', 3000),
        error_stack: error.stack ? redact(error.stack, 12000) : null,
        component_stack: componentStack ? redact(componentStack, 12000) : null,
        route: window.location.pathname.slice(0, 500),
        browser: navigator.userAgent.slice(0, 500),
        environment: import.meta.env.MODE.slice(0, 100),
      });
      if (insertError) throw insertError;
      setSent(true);
      toast.success('Error report sent to your hostel administrator.');
    } catch {
      toast.error('Could not send the report. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <button
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50"
    >
      <AlertCircle className="h-4 w-4" />
      Report
    </button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="error-report-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="error-report-title" className="text-lg font-bold text-slate-900">Report this error</h2>
            <p className="mt-1 text-sm text-slate-500">A technical error log will be attached automatically. Add a comment if you want.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
        </div>
        {sent ? <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">Report sent. Your hostel administrator can review it now.</div> : <form onSubmit={submit} className="mt-5">
          <label htmlFor="error-report-comment" className="mb-2 block text-sm font-semibold text-slate-700">Comment <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea id="error-report-comment" value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={4} placeholder="What were you doing when this happened?" className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          <p className="mt-2 text-xs text-slate-400">The report includes the page, browser, and redacted error details. It excludes cookies and page data.</p>
          <button type="submit" disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </form>}
      </section>
    </div>}
  </>;
}
