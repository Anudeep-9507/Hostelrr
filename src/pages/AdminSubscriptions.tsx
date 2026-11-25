import React from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Plus, RefreshCw, Save, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  extendAdminHostelSubscription, getAdminSubscriptionPaymentSettings, getAdminSubscriptionPayments, getAdminSubscriptionPlans,
  getPlatformAdminStatus, reviewAdminSubscriptionPayment, saveAdminSubscriptionPaymentSettings,
  saveAdminSubscriptionPlan, setAdminSubscriptionPlanActive,
} from '../lib/supabaseAPI';
import { formatDate } from '../lib/utils';

const emptyPlan = { id: '', name: '', minBeds: '', maxBeds: '', amountInr: '', billingDays: '30' };

export default function AdminSubscriptions() {
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [plans, setPlans] = React.useState<any[]>([]);
  const [payments, setPayments] = React.useState<any[]>([]);
  const [form, setForm] = React.useState(emptyPlan);
  const [upi, setUpi] = React.useState('');
  const [payee, setPayee] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const [admin, planRows, paymentRows, paymentSettings] = await Promise.all([
        getPlatformAdminStatus(), getAdminSubscriptionPlans(), getAdminSubscriptionPayments(), getAdminSubscriptionPaymentSettings(),
      ]);
      setIsAdmin(admin);
      if (!admin) return;
      setPlans(planRows as any[]);
      setPayments(paymentRows as any[]);
      setUpi(paymentSettings.upi_vpa || '');
      setPayee(paymentSettings.payee_name || '');
    } catch (error: any) {
      setIsAdmin(false);
      toast.error(error?.message || 'Admin subscription data is unavailable');
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  if (isAdmin === false) return <Navigate to="/dashboard" replace />;
  if (isAdmin === null) return <div className="p-8 text-sm text-gray-500">Checking administrator access…</div>;

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      await saveAdminSubscriptionPlan({
        ...form, minBeds: Number(form.minBeds), maxBeds: form.maxBeds ? Number(form.maxBeds) : null,
        amountInr: Number(form.amountInr), billingDays: Number(form.billingDays),
      });
      setForm(emptyPlan); await refresh(); toast.success('Pricing tier saved');
    } catch (error: any) { toast.error(error?.message || 'Could not save pricing tier'); }
    finally { setBusy(false); }
  };

  const savePaymentSettings = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await saveAdminSubscriptionPaymentSettings(upi, payee); toast.success('UPI details saved'); }
    catch (error: any) { toast.error(error?.message || 'Could not save UPI details'); }
    finally { setBusy(false); }
  };

  const review = async (id: string, approve: boolean) => {
    const reason = approve ? '' : window.prompt('Reason for rejection (required):') || '';
    if (!approve && reason.trim().length < 3) return;
    setBusy(true);
    try { await reviewAdminSubscriptionPayment(id, approve, reason); await refresh(); toast.success(approve ? 'Payment approved and subscription activated' : 'Payment rejected'); }
    catch (error: any) { toast.error(error?.message || 'Could not review payment'); }
    finally { setBusy(false); }
  };

  const extend = async (hostelId: string) => {
    const days = Number(window.prompt('Extension days (1–365):'));
    if (!Number.isInteger(days) || days < 1 || days > 365) return;
    const reason = window.prompt('Reason for extension:') || '';
    if (reason.trim().length < 3) return;
    setBusy(true);
    try { await extendAdminHostelSubscription(hostelId, days, reason); toast.success('Subscription extended'); }
    catch (error: any) { toast.error(error?.message || 'Could not extend subscription'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 pb-12 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-indigo-700" /><div><h1 className="text-2xl font-bold">Subscription administration</h1><p className="text-sm text-gray-500">Pricing, UPI settings, and payment verification</p></div></div>
        <button onClick={() => void refresh()} className="rounded-lg border p-2 text-gray-600 hover:bg-gray-50" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="mb-4 font-bold">Bed-count pricing tiers</h2>
          <form onSubmit={savePlan} className="grid gap-3 sm:grid-cols-2">
            <input required placeholder="Plan name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-lg border px-3 py-2" />
            <div className="flex gap-2"><input required type="number" min="1" placeholder="From beds" value={form.minBeds} onChange={e => setForm({ ...form, minBeds: e.target.value })} className="w-full rounded-lg border px-3 py-2" /><input type="number" min={form.minBeds || 1} placeholder="To beds (blank = open)" value={form.maxBeds} onChange={e => setForm({ ...form, maxBeds: e.target.value })} className="w-full rounded-lg border px-3 py-2" /></div>
            <input required type="number" min="1" placeholder="Price (INR)" value={form.amountInr} onChange={e => setForm({ ...form, amountInr: e.target.value })} className="rounded-lg border px-3 py-2" />
            <input required type="number" min="1" max="366" placeholder="Billing days" value={form.billingDays} onChange={e => setForm({ ...form, billingDays: e.target.value })} className="rounded-lg border px-3 py-2" />
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Save tier</button>
          </form>
          <div className="mt-5 divide-y">
            {plans.length === 0 ? <p className="py-3 text-sm text-gray-500">No tiers configured. Add prices after confirming the final pricing schedule.</p> : plans.map(plan => (
              <div key={plan.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <button onClick={() => setForm({ id: plan.id, name: plan.name, minBeds: String(plan.min_beds), maxBeds: plan.max_beds ? String(plan.max_beds) : '', amountInr: String(plan.amount_inr), billingDays: String(plan.billing_days) })} className="flex min-w-0 flex-1 justify-between gap-3 text-left hover:bg-gray-50">
                  <span className="font-semibold">{plan.name} <span className="font-normal text-gray-500">({plan.min_beds}–{plan.max_beds ?? '∞'} beds)</span></span><span>₹{plan.amount_inr} / {plan.billing_days} days</span>
                </button>
                <button disabled={busy} onClick={async () => { setBusy(true); try { await setAdminSubscriptionPlanActive(plan.id, !plan.active); await refresh(); toast.success(`Pricing tier ${plan.active ? 'deactivated' : 'activated'}`); } catch (error: any) { toast.error(error?.message || 'Could not update tier'); } finally { setBusy(false); } }} className={`text-xs font-bold ${plan.active ? 'text-emerald-700' : 'text-gray-400'}`}>{plan.active ? 'Active' : 'Inactive'}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <h2 className="mb-4 font-bold">Subscription UPI account</h2>
          <form onSubmit={savePaymentSettings} className="space-y-3">
            <label className="block text-sm font-medium">UPI ID<input value={upi} onChange={e => setUpi(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="configured by Hostelrr" /></label>
            <label className="block text-sm font-medium">Payee name<input value={payee} onChange={e => setPayee(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Hostelrr" /></label>
            <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"><Save className="h-4 w-4" /> Save payment details</button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-4 font-bold">UPI payment submissions</h2>
        {payments.length === 0 ? <p className="text-sm text-gray-500">No payment submissions.</p> : <div className="space-y-3">
          {payments.map(item => <article key={item.id} className="flex flex-col justify-between gap-4 rounded-xl border p-4 md:flex-row md:items-center">
            <div className="text-sm"><div className="font-bold">{item.hostel_name} · {item.owner_email}</div><div className="mt-1 text-gray-600">{item.plan_name} · ₹{item.claimed_amount_inr} · {formatDate(item.claimed_paid_on)}</div><div className="mt-1 font-mono text-xs text-gray-500">UTR: {item.payment_reference}</div><div className="mt-1 text-xs uppercase text-gray-500">{item.status}</div></div>
            <div className="flex gap-2">
              {item.status === 'pending' && <><button disabled={busy} onClick={() => void review(item.id, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" /> Approve</button><button disabled={busy} onClick={() => void review(item.id, false)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><X className="h-4 w-4" /> Reject</button></>}
              <button disabled={busy} onClick={() => void extend(item.hostel_id)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Extend access</button>
            </div>
          </article>)}
        </div>}
      </section>
    </div>
  );
}
