import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, CreditCard, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import { formatDate, getTodayIST } from '../lib/utils';
import { getHostelSubscription, submitHostelSubscriptionPayment } from '../lib/supabaseAPI';

const formatIst = (value?: string | null) => value
  ? `${formatDate(value)} ${new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    }).format(new Date(value))} IST`
  : '—';

const formatInr = (value?: number | null) => value == null
  ? 'Not configured'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function Subscription() {
  const navigate = useNavigate();
  const { hostelProfile, syncStateWithDb } = useApp();
  const [overview, setOverview] = React.useState<any>(null);
  const [reference, setReference] = React.useState('');
  const [paidOn, setPaidOn] = React.useState(getTodayIST());
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!hostelProfile?.id) return;
    setLoading(true);
    try {
      setOverview(await getHostelSubscription(hostelProfile.id));
    } catch (error: any) {
      toast.error(error?.message || 'Could not load subscription details');
    } finally {
      setLoading(false);
    }
  }, [hostelProfile?.id]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const subscription = overview?.subscription;
  const plan = overview?.matched_plan;
  const pending = overview?.pending_submission;
  const paymentSettings = overview?.payment_settings;
  const expired = Boolean(overview && !overview.writable);
  const statusLabel = expired ? 'Expired' : (subscription?.status === 'active' ? 'Active' : 'Trial');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hostelProfile?.id || !reference.trim()) return;
    setSubmitting(true);
    try {
      await submitHostelSubscriptionPayment(hostelProfile.id, reference.trim(), paidOn);
      setReference('');
      toast.success('UPI payment submitted for review');
      await refresh();
      await syncStateWithDb();
    } catch (error: any) {
      toast.error(error?.message || 'Could not submit the payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 pb-10 sm:p-8">
      <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="mb-7 flex items-start gap-4">
        <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700"><CreditCard className="h-6 w-6" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Subscription</h1>
          <p className="mt-1 text-sm text-gray-500">Manage the Hostelrr plan for {hostelProfile?.hostelName || 'your hostel'}.</p>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-8 text-sm text-gray-500">Loading subscription…</div> : !subscription ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Subscription setup is not available yet. Refresh after the subscription database migration is enabled.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-gray-900">Current access</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${expired ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{statusLabel}</span>
            </div>
            <div className="mt-6 space-y-4 text-sm">
              <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-4 w-4 text-gray-400" /><div><div className="text-xs text-gray-500">Trial started</div><div className="font-semibold text-gray-800">{formatIst(subscription.trial_started_at)}</div></div></div>
              <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-4 w-4 text-gray-400" /><div><div className="text-xs text-gray-500">Trial ends</div><div className="font-semibold text-gray-800">{formatIst(subscription.trial_ends_at)}</div></div></div>
              {subscription.current_period_end && <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /><div><div className="text-xs text-gray-500">Paid through</div><div className="font-semibold text-gray-800">{formatIst(subscription.current_period_end)}</div></div></div>}
              <div className="border-t pt-4 text-gray-600">Configured beds: <strong className="text-gray-900">{overview.bed_count ?? '—'}</strong></div>
              <div className="text-gray-600">Matching plan: <strong className="text-gray-900">{plan?.name || 'Price not configured'}</strong></div>
              <div className="text-gray-600">Renewal amount: <strong className="text-gray-900">{formatInr(plan?.amount_inr)}</strong></div>
            </div>
            {expired && <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Your workspace is read-only until a subscription payment is approved.</div>}
            <button onClick={() => void refresh()} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"><RefreshCw className="h-4 w-4" /> Refresh status</button>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-gray-900">Renew with UPI</h2>
            {pending ? (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Payment reference <strong>{pending.payment_reference}</strong> is awaiting admin verification.
              </div>
            ) : !plan ? (
              <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">Pricing for this bed count has not been configured yet. Please contact Hostelrr support.</p>
            ) : !paymentSettings?.upi_vpa ? (
              <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">UPI payment details have not been configured yet. Please contact Hostelrr support.</p>
            ) : (
              <>
                <div className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-950">
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Pay {formatInr(plan.amount_inr)} to</div>
                  <div className="mt-1 break-all text-lg font-bold">{paymentSettings.upi_vpa}</div>
                  {paymentSettings.payee_name && <div className="mt-1 text-indigo-800">{paymentSettings.payee_name}</div>}
                  <div className="mt-2 text-xs text-indigo-700">Plan covers {plan.billing_days} days for {overview.bed_count} configured beds.</div>
                </div>
                <form onSubmit={submit} className="mt-5 space-y-4">
                  <label className="block text-sm font-medium text-gray-700">UPI transaction reference / UTR
                    <input required minLength={3} maxLength={160} value={reference} onChange={event => setReference(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">Date paid
                    <input required type="date" value={paidOn} onChange={event => setPaidOn(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <button disabled={submitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit payment for verification'}</button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
