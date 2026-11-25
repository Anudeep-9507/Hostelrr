import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BedDouble, Check, CircleHelp, ClipboardList,
  Copy, CreditCard, LayoutDashboard, Link2, LockKeyhole, LogIn, MessageCircle,
  Moon, QrCode, ShieldCheck, Sun, UsersRound, X, UserRound, FileText, Receipt,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const logo = 'https://res.cloudinary.com/dfkfysygf/image/upload/v1795005162/hostelrr_selected_logo_sgnck0.png';

function Brand({ footer = false, inverse = false }: { footer?: boolean; inverse?: boolean }) {
  return (
    <Link to={ROUTES.home.path} aria-label="Hostelrr home" className={`flex items-center ${footer ? 'gap-2.5' : 'gap-3'}`}>
      <img src={logo} alt="Hostelrr logo" className={`${footer ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl'} object-cover shadow-sm`} />
      <span className={`${footer ? 'text-lg' : 'text-2xl'} font-extrabold tracking-tight ${inverse ? 'text-white' : 'text-slate-900 hostel-dark:text-white'}`}>Hostelrr<span className="text-[#0682D4]">.</span></span>
    </Link>
  );
}

function BedAllocationPreview() {
  const rooms = [
    { name: 'Room 201', type: 'Triple', beds: [['Bed A', 'Rahul S.', 'filled'], ['Bed B', 'Aman K.', 'filled'], ['Bed C', 'Vikram', 'filled']] },
    { name: 'Room 202', type: 'Double', beds: [['Bed A', 'Saurabh P.', 'filled'], ['Bed B', 'Vacant', 'vacant']] },
    { name: 'Room 203', type: 'Double', beds: [['Bed A', 'Manish D.', 'filled'], ['Bed B', 'Due ₹4,500', 'due']] },
  ];
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hostel-dark:border-slate-700 hostel-dark:bg-slate-900 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 hostel-dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 hostel-dark:text-white"><BedDouble size={17} className="text-[#234296] hostel-dark:text-[#0682D4]" /> 2nd Floor · Bed allocation</div>
        <div className="flex gap-3 text-[10px] font-medium text-slate-500 hostel-dark:text-slate-300"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Filled</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-400" /> Vacant</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" /> Due</span></div>
      </div>
      <div className="space-y-3">
        {rooms.map((room) => (
          <div key={room.name} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 hostel-dark:border-slate-700 hostel-dark:bg-slate-800/70">
            <div className="mb-2.5 flex items-center justify-between text-xs"><span className="font-bold text-slate-900 hostel-dark:text-white">{room.name}</span><span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hostel-dark:border-slate-600 hostel-dark:bg-slate-700 hostel-dark:text-slate-200">{room.type}</span></div>
            <div className={`grid gap-2 ${room.beds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {room.beds.map(([bed, resident, state]) => <div key={bed} className={`rounded-lg border p-2 text-center ${state === 'filled' ? 'border-emerald-200/80 bg-emerald-50/80 hostel-dark:border-emerald-900 hostel-dark:bg-emerald-950/40' : state === 'vacant' ? 'border-blue-200 bg-blue-50/70 hostel-dark:border-blue-900 hostel-dark:bg-blue-950/40' : 'border-rose-200 bg-rose-50 hostel-dark:border-rose-900 hostel-dark:bg-rose-950/40'}`}><div className={`text-[11px] font-bold ${state === 'vacant' ? 'text-[#0682D4]' : state === 'due' ? 'text-rose-600 hostel-dark:text-rose-400' : 'text-slate-800 hostel-dark:text-slate-200'}`}>{bed}</div><div className={`mt-0.5 truncate text-[10px] ${state === 'due' ? 'font-bold text-rose-600 hostel-dark:text-rose-400' : 'text-slate-500 hostel-dark:text-slate-400'}`}>{resident}</div></div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JoinRequestPreview() {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm hostel-dark:border-slate-700 hostel-dark:bg-slate-900 sm:p-6">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 hostel-dark:border-slate-700">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#234296] hostel-dark:bg-blue-950/50 hostel-dark:text-blue-300"><UsersRound size={19} /></span><div><h3 className="text-sm font-extrabold text-slate-900 hostel-dark:text-white">New join request</h3><p className="mt-0.5 text-[10px] text-slate-500 hostel-dark:text-slate-400">Sample request · just received</p></div></div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold text-amber-800 hostel-dark:border-amber-900 hostel-dark:bg-amber-950/40 hostel-dark:text-amber-300">Review needed</span>
      </div>
      <div className="py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-900 hostel-dark:text-white">Aarav Mehta</p><p className="mt-1 text-[10px] text-slate-500 hostel-dark:text-slate-400">Prospective resident</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hostel-dark:bg-slate-800 hostel-dark:text-slate-300">3 sharing</span></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg border border-slate-100 bg-slate-50 p-3 hostel-dark:border-slate-700 hostel-dark:bg-slate-800"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Phone</p><p className="mt-1 text-xs font-semibold text-slate-800 hostel-dark:text-slate-200">+91 98••• ••210</p></div><div className="rounded-lg border border-slate-100 bg-slate-50 p-3 hostel-dark:border-slate-700 hostel-dark:bg-slate-800"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Preferred move-in</p><p className="mt-1 text-xs font-semibold text-slate-800 hostel-dark:text-slate-200">15 Dec · Sample</p></div></div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 hostel-dark:border-slate-700"><span className="text-[10px] font-medium text-slate-500 hostel-dark:text-slate-400">You decide what happens next.</span><span className="rounded-lg bg-[#234296] px-3 py-2 text-[10px] font-bold text-white">Review request</span></div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3 hostel-dark:border-blue-900 hostel-dark:bg-blue-950/40"><span className="flex items-center gap-2 text-[10px] font-bold text-[#234296] hostel-dark:text-blue-300"><QrCode size={16} /> Share your hostel link or QR</span><Copy size={14} className="text-[#0682D4]" /></div>
    </div>
  );
}

function RentCyclePreview() {
  const cycles = [
    ['Rahul S.', '₹7,500', 'Paid', 'text-emerald-700 hostel-dark:text-emerald-300'],
    ['Aman K.', '₹4,500 due', 'Partial', 'text-amber-700 hostel-dark:text-amber-300'],
    ['Vikram', '₹9,000 due', 'Late', 'text-rose-700 hostel-dark:text-rose-300'],
  ];
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm hostel-dark:border-slate-700 hostel-dark:bg-slate-900 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-4 hostel-dark:border-slate-700"><div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">RECURRING BILLING · SAMPLE</span><h3 className="mt-1 text-sm font-extrabold text-slate-900 hostel-dark:text-white">December rent cycles</h3></div><span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-bold text-[#234296] hostel-dark:border-blue-900 hostel-dark:bg-blue-950/50 hostel-dark:text-blue-300"><Check size={12} /> Auto-generated</span></div>
      <div className="space-y-2.5">{cycles.map(([name, amount, status, tone]) => <div key={name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 hostel-dark:border-slate-700 hostel-dark:bg-slate-800/70"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800 hostel-dark:text-slate-200">{name}</p><p className="mt-0.5 text-[10px] text-slate-500">Monthly cycle · due date set for this hostel</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold text-slate-800 hostel-dark:text-slate-200">{amount}</p><p className={`mt-0.5 text-[10px] font-extrabold ${tone}`}>{status}</p></div></div>)}</div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[10px] leading-5 text-emerald-900 hostel-dark:border-emerald-900 hostel-dark:bg-emerald-950/30 hostel-dark:text-emerald-300"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>Cycles and due dates are generated automatically. Payments are recorded by the owner.</span></div>
    </div>
  );
}

function TenantRecordPreview() {
  const records = [
    { icon: FileText, label: 'Joining form', detail: 'Submitted · 12 Jan', tone: 'text-blue-600 bg-blue-50 hostel-dark:text-blue-300 hostel-dark:bg-blue-950/50' },
    { icon: UserRound, label: 'Resident profile', detail: 'Room 204 · Bed B', tone: 'text-violet-600 bg-violet-50 hostel-dark:text-violet-300 hostel-dark:bg-violet-950/50' },
    { icon: CreditCard, label: 'Payment history', detail: 'January rent · Paid', tone: 'text-emerald-600 bg-emerald-50 hostel-dark:text-emerald-300 hostel-dark:bg-emerald-950/50' },
    { icon: Receipt, label: 'Rent ledger', detail: '₹8,500 paid · ₹0 due', tone: 'text-amber-600 bg-amber-50 hostel-dark:text-amber-300 hostel-dark:bg-amber-950/50' },
  ];
  return <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hostel-dark:border-slate-700 hostel-dark:bg-slate-900 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 hostel-dark:border-slate-700">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#234296] hostel-dark:bg-blue-950/50 hostel-dark:text-blue-300"><UserRound size={19}/></span><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hostel-dark:text-slate-400">TENANT FILE · SAMPLE</p><h3 className="mt-0.5 text-sm font-extrabold text-slate-900 hostel-dark:text-white">Aarav Mehta</h3></div></div>
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700 hostel-dark:border-emerald-900 hostel-dark:bg-emerald-950/40 hostel-dark:text-emerald-300">Active resident</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">{records.map(({icon:Icon,label,detail,tone})=><div key={label} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 hostel-dark:border-slate-700 hostel-dark:bg-slate-800/70"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={17}/></span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800 hostel-dark:text-slate-200">{label}</p><p className="mt-0.5 truncate text-[10px] text-slate-500 hostel-dark:text-slate-400">{detail}</p></div><Check size={14} className="ml-auto shrink-0 text-emerald-500"/></div>)}</div>
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-[10px] font-semibold text-blue-800 hostel-dark:border-blue-900/60 hostel-dark:bg-blue-950/40 hostel-dark:text-blue-200"><ShieldCheck size={15} className="shrink-0"/>Joining details, resident records, and rent activity stay connected.</div>
  </div>;
}

function WorkspacePreview() {
  return (
    <section aria-label="Illustrative Hostelrr workspace" className="relative z-20 mx-auto mb-16 mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 shadow-2xl hostel-dark:border-slate-800 hostel-dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 hostel-dark:border-slate-700 hostel-dark:bg-slate-800/80 sm:px-6">
          <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border border-red-600 bg-red-500" /><span className="inline-block h-3 w-3 rounded-full border border-amber-600 bg-amber-400" /><span className="inline-block h-3 w-3 rounded-full border border-green-600 bg-green-500" /></div>
          <div className="mx-auto hidden max-w-md flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 font-mono text-xs text-slate-500 hostel-dark:border-slate-700 hostel-dark:bg-slate-900 hostel-dark:text-slate-300 sm:flex"><LockKeyhole size={13} className="text-slate-400" /> Hostelrr workspace</div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-extrabold tracking-wide text-[#234296] hostel-dark:border-blue-900 hostel-dark:bg-blue-950/50 hostel-dark:text-blue-300">SAMPLE VIEW</span>
        </div>
        <div className="space-y-6 bg-slate-50/50 p-4 hostel-dark:bg-slate-900/60 sm:p-7">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200/70 pb-4 hostel-dark:border-slate-700 md:flex-row md:items-center">
            <div className="flex items-center gap-3.5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-[#234296] to-[#0682D4] text-xl font-extrabold text-white shadow-md">G</div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold tracking-tight text-slate-900 hostel-dark:text-white sm:text-xl">Greenwood PG &amp; Hostel</h2><span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hostel-dark:border-slate-700 hostel-dark:bg-slate-800 hostel-dark:text-slate-300">Example</span></div><p className="mt-0.5 text-xs font-medium text-slate-500 hostel-dark:text-slate-400">Sample workspace · 124 configured beds</p></div></div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-2"><div className="min-w-[70px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-center hostel-dark:border-slate-700 hostel-dark:bg-slate-800"><div className="text-sm font-extrabold text-slate-900 hostel-dark:text-white">124</div><div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Beds</div></div><div className="min-w-[70px] rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-center hostel-dark:border-emerald-900 hostel-dark:bg-emerald-950/40"><div className="text-sm font-extrabold text-emerald-700 hostel-dark:text-emerald-300">108</div><div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700 hostel-dark:text-emerald-400">Occupied</div></div><div className="min-w-[70px] rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-center hostel-dark:border-blue-900 hostel-dark:bg-blue-950/40"><div className="text-sm font-extrabold text-[#234296] hostel-dark:text-blue-300">16</div><div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#0682D4] hostel-dark:text-blue-300">Vacant</div></div></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['OCCUPANCY', '87.1%', 'Configured beds in use', 'text-slate-900 hostel-dark:text-white'],
              ['RESIDENTS', '108', 'Active residents', 'text-slate-900 hostel-dark:text-white'],
              ['RENT RECORDED', '₹9,45,000', 'This month · example', 'text-emerald-700 hostel-dark:text-emerald-300'],
              ['OUTSTANDING DUES', '₹1,35,000', 'Example balances', 'text-rose-700 hostel-dark:text-rose-300'],
            ].map(([label, value, note, tone]) => <div key={label} className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm hostel-dark:border-slate-700 hostel-dark:bg-slate-800/90"><div className="text-[10px] font-bold tracking-wider text-slate-500">{label}</div><div className={`mt-1 text-xl font-extrabold tracking-tight ${tone}`}>{value}</div><div className="mt-1.5 text-[10px] text-slate-500 hostel-dark:text-slate-400">{note}</div></div>)}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7"><BedAllocationPreview /></div>
            <div className="space-y-4 lg:col-span-5">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm hostel-dark:border-slate-700 hostel-dark:bg-slate-800/90 sm:p-5">
                <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-slate-900 hostel-dark:text-white"><ClipboardList size={17} className="text-[#0682D4]" /> Rent activity</div><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600 hostel-dark:bg-slate-700 hostel-dark:text-slate-300">Example</span></div>
                <div className="space-y-2.5">{[['Rahul S.', '₹7,500 · UPI', 'Paid', 'text-emerald-700 hostel-dark:text-emerald-300'], ['Aman K.', '₹4,500 · balance due', 'Partial', 'text-amber-700 hostel-dark:text-amber-300'], ['Vikram', '₹9,000 · due date passed', 'Late', 'text-rose-700 hostel-dark:text-rose-300']].map(([name, detail, status, color]) => <div key={name} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0 hostel-dark:border-slate-700"><div><p className="text-xs font-bold text-slate-800 hostel-dark:text-slate-200">{name}</p><p className="mt-0.5 text-[10px] text-slate-500 hostel-dark:text-slate-400">{detail}</p></div><span className={`text-[10px] font-extrabold ${color}`}>{status}</span></div>)}</div>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs leading-5 text-slate-700 hostel-dark:border-blue-900 hostel-dark:bg-blue-950/40 hostel-dark:text-slate-200"><div className="flex items-center gap-2 font-bold text-[#0682D4] hostel-dark:text-blue-300"><MessageCircle size={15} /> Owner-led WhatsApp reminder</div><p className="mt-1.5 text-[11px] text-slate-600 hostel-dark:text-slate-300">Prepare a message for a resident and review it before sending in WhatsApp.</p></div>
            </div>
          </div>
          <p className="text-center text-[10px] font-medium text-slate-500">Illustrative sample data · actual workspace reflects your hostel</p>
        </div>
      </div>
    </section>
  );
}

function FeatureRows() {
  return (
    <section id="features" className="scroll-mt-20 border-y border-slate-200 bg-slate-50/70 py-12 hostel-dark:border-slate-800 hostel-dark:bg-slate-900/40 md:py-16">
      <div className="mx-auto max-w-6xl space-y-14 px-4 sm:px-6 lg:px-8 lg:space-y-20">
        <div className="mx-auto mb-2 max-w-2xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-[.18em] text-[#0682D4]">Made for the day-to-day</span>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 hostel-dark:text-white sm:text-4xl">Everything you need to run your property.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">From bed availability to rent follow-ups, manage the essentials in one clear workspace.</p>
        </div>
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-bold text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><BedDouble size={14} /> Rooms &amp; beds</span><h2 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 hostel-dark:text-white sm:text-3xl">See your floor plan and bed assignments clearly.</h2><p className="text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">Keep floors, rooms, sharing types, and beds organized. Check which beds are occupied, vacant, or reserved from a visual room view.</p><ul className="space-y-2 pt-1 text-xs text-slate-600 hostel-dark:text-slate-300 sm:text-sm"><li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Track occupancy and vacancies</li><li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Assign and move residents between beds</li></ul></div>
          <BedAllocationPreview />
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="order-2 lg:order-1"><RentCyclePreview /></div>
          <div className="order-1 space-y-4 lg:order-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-bold text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><CreditCard size={14} /> Rent follow-ups</span><h2 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 hostel-dark:text-white sm:text-3xl">Automatic rent tracking keeps due dates clear.</h2><p className="text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">Hostelrr creates recurring rent cycles and tracks outstanding dues. Record cash or UPI payments, including partial payments, to keep each resident’s balance current.</p><div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hostel-dark:border-emerald-900 hostel-dark:bg-emerald-950/30 hostel-dark:text-emerald-300"><Check size={15} /> Monthly rent cycles generated automatically</div></div>
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-bold text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><CreditCard size={14} /> Rent tracking</span><h2 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 hostel-dark:text-white sm:text-3xl">Know what’s paid, pending, or overdue.</h2><p className="text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">Record cash or UPI payments, including partial payments, and review payment cycles and history without searching through registers.</p><ul className="space-y-2 pt-1 text-xs text-slate-600 hostel-dark:text-slate-300 sm:text-sm"><li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> See pending and late rent cycles</li><li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Keep resident payment history together</li></ul></div>
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hostel-dark:border-slate-800 hostel-dark:bg-slate-900 sm:p-7"><div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">PAYMENT HISTORY · EXAMPLE</span><span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#234296] hostel-dark:border-blue-900 hostel-dark:bg-blue-950/50 hostel-dark:text-blue-300">This month</span></div><div className="text-3xl font-extrabold tracking-tight text-slate-900 hostel-dark:text-white">₹4,80,000</div><div className="space-y-3">{[['Rent recorded', '₹4,80,000', 76, 'bg-[#0682D4]'], ['Outstanding dues', '₹1,37,150', 24, 'bg-amber-500']].map(([label, amount, width, color]) => <div key={String(label)}><div className="flex justify-between text-xs font-semibold text-slate-700 hostel-dark:text-slate-200"><span>{label}</span><span>{amount}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 hostel-dark:bg-slate-800"><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div></div>)}</div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 hostel-dark:border-slate-700 hostel-dark:bg-slate-800 hostel-dark:text-slate-300"><span className="font-bold text-[#234296] hostel-dark:text-blue-300">Payment history:</span> cash and UPI entries stay linked to each resident’s rent cycle.</div></div>
        </div>

        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="order-2 lg:order-1"><JoinRequestPreview /></div>
          <div className="order-1 space-y-4 lg:order-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-bold text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><Link2 size={14} /> Resident onboarding</span><h2 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 hostel-dark:text-white sm:text-3xl">Collect join requests with a link or QR.</h2><p className="text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">Share your hostel’s join form with prospective residents. Review their details and preferences, then decide whether to add them to your resident list.</p><div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-[#234296] hostel-dark:border-blue-900 hostel-dark:bg-blue-950/40 hostel-dark:text-blue-300"><QrCode size={15} /> Share digitally, review on your terms</div></div>
        </div>
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"><div className="space-y-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-bold text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><UsersRound size={14}/> Tenant records</span><h2 className="text-2xl font-extrabold leading-snug tracking-tight text-slate-900 hostel-dark:text-white sm:text-3xl">All tenant details, from joining form to rent ledger.</h2><p className="text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">Keep each resident’s joining request, profile, bed assignment, and payment history together in one place.</p><div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-[#234296] hostel-dark:border-blue-900 hostel-dark:bg-blue-950/40 hostel-dark:text-blue-300"><Check size={15}/>Review joining requests before adding residents</div></div><TenantRecordPreview/></div>
      </div>
    </section>
  );
}

function Comparison() {
  const problems = [
    ['Scattered rent notes', 'Balances and due dates are easy to lose across notebooks and spreadsheets.'],
    ['Unclear vacancies', 'Confirming whether a specific bed is free can mean checking room by room.'],
    ['Resident details in many places', 'Paper forms and message threads make updates harder to find.'],
    ['Manual payment history', 'Reconstructing who paid what takes time when records are spread out.'],
  ];
  const solutions = [
    ['A visual bed view', 'See rooms, beds, residents, and vacancy status together.'],
    ['Resident records', 'Keep resident profiles and bed assignments in the workspace.'],
    ['Rent cycles and dues', 'Review payment history, partial payments, and overdue amounts.'],
    ['Owner-led reminders', 'Prepare a WhatsApp reminder and send it when you are ready.'],
  ];
  return (
    <section id="comparison" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
      <div className="mx-auto mb-12 max-w-2xl text-center"><div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-blue-100/70 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><CircleHelp size={14} /> Why Hostelrr</div><h2 className="mb-3 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 hostel-dark:text-white sm:text-4xl">From scattered records to a hostel that runs in sync.</h2><p className="text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-base">Connect bed assignments, resident details, rent cycles, and follow-ups in one clear owner workspace.</p></div>
      <div className="mb-8 grid items-stretch gap-6 md:grid-cols-2 lg:gap-8">
        <article className="flex flex-col justify-between rounded-2xl border border-rose-200/80 bg-rose-50/70 p-6 transition hover:-translate-y-1 hover:shadow-xl hostel-dark:border-rose-900/60 hostel-dark:bg-rose-950/30 sm:p-8"><div><span className="mb-3 inline-flex items-center gap-2 rounded-full bg-rose-100/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-700 hostel-dark:bg-rose-900/50 hostel-dark:text-rose-300"><X size={14} /> The manual way</span><h3 className="text-xl font-bold tracking-tight text-slate-900 hostel-dark:text-white">Registers, sheets, and follow-ups</h3><p className="mt-1 text-xs text-slate-600 hostel-dark:text-slate-300 sm:text-sm">When details live in different places, it takes more effort to get the full picture.</p><ul className="space-y-4 pt-6">{problems.map(([title, copy]) => <li key={title} className="flex items-start gap-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-200/80 text-rose-700 hostel-dark:bg-rose-900/60 hostel-dark:text-rose-300"><X size={13} /></span><div><h4 className="text-sm font-bold text-slate-800 hostel-dark:text-slate-200">{title}</h4><p className="mt-0.5 text-xs leading-relaxed text-slate-600 hostel-dark:text-slate-300">{copy}</p></div></li>)}</ul></div><div className="mt-6 flex items-center gap-2 border-t border-rose-200/60 pt-4 text-xs font-semibold text-rose-700 hostel-dark:border-rose-900/40 hostel-dark:text-rose-300"><ClipboardList size={15} /> Details can be hard to keep in sync</div></article>
        <article className="relative flex flex-col justify-between rounded-2xl border-2 border-[#0682D4] bg-white p-6 shadow-xl shadow-blue-500/10 transition hover:-translate-y-1 hover:shadow-2xl hostel-dark:bg-slate-900 sm:p-8"><span className="hostelrr-badge-shimmer absolute -top-3.5 right-6 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md"><ShieldCheck size={13} /> The Hostelrr workspace</span><div><span className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0682D4] hostel-dark:bg-blue-950/60 hostel-dark:text-blue-300"><LayoutDashboard size={14} /> One clear view</span><h3 className="text-xl font-bold tracking-tight text-slate-900 hostel-dark:text-white">Hostel operations, kept simple</h3><p className="mt-1 text-xs text-slate-600 hostel-dark:text-slate-300 sm:text-sm">Keep the core records and everyday actions in one owner workspace.</p><ul className="space-y-3 pt-5">{solutions.map(([title, copy]) => <li key={title} className="flex items-start gap-3 rounded-xl p-1.5"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 hostel-dark:bg-emerald-950/60 hostel-dark:text-emerald-300"><Check size={14} /></span><div><h4 className="text-sm font-bold text-slate-900 hostel-dark:text-white">{title}</h4><p className="mt-0.5 text-xs leading-relaxed text-slate-600 hostel-dark:text-slate-300">{copy}</p></div></li>)}</ul></div><div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-emerald-700 hostel-dark:border-slate-800 hostel-dark:text-emerald-300"><Check size={15} /> A practical workspace for daily operations</div></article>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-blue-200/80 bg-blue-50/70 p-4 text-center text-xs font-semibold text-slate-700 hostel-dark:border-blue-900/50 hostel-dark:bg-blue-950/30 hostel-dark:text-slate-200 sm:flex-row sm:text-sm"><span className="flex items-center gap-2"><UsersRound size={17} className="text-[#0682D4]" /> Built for hostel and PG owners</span><span className="hidden text-slate-300 sm:inline">•</span><span>Residents don’t need a Hostelrr account</span></div>
    </section>
  );
}

export default function LandingPage() {
  const [isDark, setIsDark] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoPhone, setDemoPhone] = useState('');
  const [demoSource, setDemoSource] = useState<'popup' | 'hero'>('popup');
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoSent, setDemoSent] = useState(false);
  const [heroPhone, setHeroPhone] = useState('');
  const heroRef = useRef<HTMLElement | null>(null);
  const popupTimer = useRef<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    popupTimer.current = window.setTimeout(() => {
      setDemoSource('popup');
      setDemoPhone('');
      setDemoOpen(true);
    }, 5000);
    return () => { if (popupTimer.current !== null) window.clearTimeout(popupTimer.current); };
  }, []);
  useEffect(() => {
    if ((location.state as { openDemoRequest?: boolean } | null)?.openDemoRequest) {
      if (popupTimer.current !== null) window.clearTimeout(popupTimer.current);
      setDemoSource('popup');
      setDemoPhone('');
      setDemoOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);
  const openDemo = (source: 'popup' | 'hero', phone = '') => {
    if (popupTimer.current !== null) window.clearTimeout(popupTimer.current);
    setDemoSource(source); setDemoPhone(phone); setDemoSent(false); setDemoOpen(true);
  };
  const submitDemo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const digits = demoPhone.replace(/\D/g, '').slice(-10);
    const beds = Number(values.get('beds'));
    if (!/^[6-9]\d{9}$/.test(digits)) { toast.error('Enter a valid 10-digit Indian mobile number.'); return; }
    if (!Number.isInteger(beds) || beds < 1 || beds > 10000) { toast.error('Enter a valid number of beds.'); return; }
    setDemoBusy(true);
    const { error } = await supabase.from('demo_requests').insert({
      name: String(values.get('name') || '').trim() || null,
      phone: `+91${digits}`, beds,
      pincode: String(values.get('pincode') || '').trim() || null,
      source: demoSource,
    });
    setDemoBusy(false);
    if (error) { toast.error('Could not submit your request. Please try again.'); return; }
    setDemoSent(true);
  };
  return (
    <main onScroll={() => setIsCompact((heroRef.current?.getBoundingClientRect().bottom ?? 0) <= 80)} className={`h-dvh overflow-y-auto overscroll-contain bg-[#F8FAFC] font-sans text-slate-800 hostel-dark:bg-[#0B1120] hostel-dark:text-slate-100 ${isDark ? 'hostel-dark' : ''}`}>
      <header className={`sticky top-0 z-50 w-full px-3 pt-3 transition-all duration-300 sm:px-4 ${isCompact ? 'pt-2' : ''}`}>
        <div className={`mx-auto rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-xl transition-all duration-300 hostel-dark:border-slate-700 hostel-dark:bg-[#0B1120]/90 ${isCompact ? 'max-w-5xl shadow-lg' : 'max-w-7xl shadow-sm'}`}>
        <div className={`mx-auto flex items-center justify-between transition-all duration-300 ${isCompact ? 'h-16 max-w-5xl px-4 sm:px-6' : 'h-20 max-w-7xl px-4 sm:px-6 lg:px-8'}`}>
          <Brand />
          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm font-semibold text-slate-600 hostel-dark:text-slate-300 md:flex"><a className="transition-colors hover:text-[#234296] hostel-dark:hover:text-[#0682D4]" href="#features">Features</a><a className="transition-colors hover:text-[#234296] hostel-dark:hover:text-[#0682D4]" href="#comparison">Problems Solved</a><a className="transition-colors hover:text-[#234296] hostel-dark:hover:text-[#0682D4]" href="#comparison">Why Us</a><a className="transition-colors hover:text-[#234296] hostel-dark:hover:text-[#0682D4]" href="#trial">Free Demo</a></nav>
          <div className="flex items-center gap-2 sm:gap-3"><button type="button" aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setIsDark(!isDark)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hostel-dark:text-slate-300 hostel-dark:hover:bg-slate-800">{isDark ? <Sun size={19} /> : <Moon size={19} />}</button><Link to={ROUTES.signin.path} className="hidden rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hostel-dark:text-slate-200 hostel-dark:hover:bg-slate-800 sm:inline-flex"><LogIn size={15} className="mr-1.5" /> Log In</Link><button type="button" onClick={()=>openDemo('hero')} className="inline-flex items-center justify-center rounded-xl bg-[#234296] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#1a3275] sm:px-5">Get Started</button></div>
        </div>
        </div>
      </header>

      <section ref={heroRef} className="hostelrr-fade-up relative isolate overflow-hidden pb-14 pt-12 md:pb-16 md:pt-16">
        <div className="pointer-events-none absolute left-1/2 top-1/4 -z-10 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-blue-300/30 to-[#0682D4]/20 blur-[130px] hostel-dark:from-blue-900/30 hostel-dark:to-cyan-900/20" />
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="hostelrr-badge-glow mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#234296] hostel-dark:border-blue-900/60 hostel-dark:bg-blue-950/40 hostel-dark:text-blue-300"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Built for PG &amp; Hostel Owners</div>
          <h1 className="mb-4 text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-900 hostel-dark:text-white sm:text-5xl lg:text-6xl">Manage every bed, resident, and rent payment <span className="bg-gradient-to-r from-[#234296] via-[#0682D4] to-cyan-500 bg-clip-text text-transparent">in one place.</span></h1>
          <p className="mx-auto mb-6 max-w-2xl text-base leading-relaxed text-slate-600 hostel-dark:text-slate-300 sm:text-lg">Keep bed allocations, resident details, rent records, and payment follow-ups together—with less paperwork to manage.</p>
          <form className="mx-auto mb-6 flex w-full max-w-xl flex-col gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-lg shadow-blue-900/5 transition-colors focus-within:border-[#0682D4] focus-within:ring-2 focus-within:ring-blue-100 hostel-dark:border-slate-700 hostel-dark:bg-slate-900 hostel-dark:focus-within:border-[#0682D4] hostel-dark:focus-within:ring-blue-900/50 sm:flex-row" onSubmit={e => { e.preventDefault(); openDemo('hero', heroPhone); }}><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-slate-50/70 px-3 transition-colors focus-within:border-[#0682D4] hostel-dark:border-slate-600 hostel-dark:bg-slate-800"><span className="text-sm font-bold text-slate-500 hostel-dark:text-slate-300">+91</span><input aria-label="Mobile number" type="tel" inputMode="numeric" maxLength={10} value={heroPhone} onChange={e=>setHeroPhone(e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="Your mobile number" className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 hostel-dark:text-white hostel-dark:placeholder:text-slate-400" required /></label><button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#234296] px-6 text-sm font-bold text-white transition hover:bg-[#1b347a]">Get Free Demo <ArrowRight size={16}/></button></form>
          <div className="inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm hostel-dark:border-slate-800 hostel-dark:bg-slate-900/60 hostel-dark:text-slate-300"><span className="flex items-center gap-1.5"><Check size={13} className="text-emerald-600" /> No resident app needed</span><span className="hidden text-slate-300 sm:inline">•</span><span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-[#0682D4]" /> Owner-managed workspace</span></div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white hostel-dark:border-slate-800 hostel-dark:bg-slate-900/70" aria-label="Hostelrr facts"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8"><div className="grid grid-cols-2 gap-4 divide-y divide-slate-100 text-center hostel-dark:divide-slate-800 md:grid-cols-4 md:divide-x md:divide-y-0 lg:gap-6">{[['100%', 'Owner controlled'], ['17+ hrs*', 'Hours saved weekly'], ['0', 'Resident apps required'], ['3', 'Core workflows']].map(([value, label]) => <div key={label} className="group cursor-default rounded-xl p-3 transition duration-300 hover:-translate-y-0.5 hover:scale-[1.03]"><div className="inline-block text-2xl font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-[#234296] hostel-dark:text-white hostel-dark:group-hover:text-[#0682D4] sm:text-3xl">{value}</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 hostel-dark:text-slate-300 sm:text-xs">{label}</div></div>)}</div><p className="mt-2 text-center text-[9px] text-slate-500 hostel-dark:text-slate-400">*Illustrative estimate, not a measured customer result.</p></div></section>

      <div id="product" className="scroll-mt-20"><WorkspacePreview /></div>
      <FeatureRows />
      <Comparison />

      <section id="trial" className="scroll-mt-20 border-t border-slate-200 bg-slate-50 py-12 hostel-dark:border-slate-800 hostel-dark:bg-slate-900/60 md:py-16"><div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"><div className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-[#00388d] via-[#004bb5] to-[#0042a5] px-6 py-14 text-center text-white shadow-2xl sm:px-8 md:py-20"><div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" /><div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center"><div className="hostelrr-badge-glow mb-6 inline-block rounded-full border border-white/20 bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-white/90">Book a free demo</div><h2 className="mb-5 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">Spend less time managing.<br />More time growing.</h2><p className="mb-8 max-w-2xl text-base font-normal leading-relaxed text-white/80 sm:text-lg">Bring your rooms, residents, and rent tracking together with Hostelrr. Get a clearer view of the details you manage every day.</p><button type="button" onClick={()=>openDemo("hero")} className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-[#003da5] shadow-lg transition hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-slate-100">Get Free Demo <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" /></button></div></div></div></section>

      <footer className="border-t border-slate-100 bg-white px-6 py-12 hostel-dark:border-slate-800 hostel-dark:bg-[#0B1120] lg:px-12"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-10 md:flex-row"><div className="max-w-sm"><Brand footer /><p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600 hostel-dark:text-slate-300">Hostel operations, kept simple. Manage rooms, residents, rent, and join requests in one owner workspace.</p><span className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-slate-700 hostel-dark:border-blue-900/40 hostel-dark:bg-blue-950/40 hostel-dark:text-slate-300"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Built for Co-Living &amp; PGs</span></div><div className="grid grid-cols-2 gap-12 sm:gap-16"><div><h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-900 hostel-dark:text-white">Product</h3><ul className="space-y-3 text-sm text-slate-600 hostel-dark:text-slate-300"><li><a className="transition-colors hover:text-[#234296]" href="#features">Features</a></li><li><a className="transition-colors hover:text-[#234296]" href="#comparison">Why Hostelrr</a></li><li><a className="transition-colors hover:text-[#234296]" href="#trial">Free Demo</a></li></ul></div><div><h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-900 hostel-dark:text-white">Account</h3><ul className="space-y-3 text-sm text-slate-600 hostel-dark:text-slate-300"><li><Link className="transition-colors hover:text-[#234296]" to={ROUTES.signin.path}>Log In</Link></li><li><button type="button" onClick={()=>openDemo('hero')} className="transition-colors hover:text-[#234296]">Get Started</button></li></ul></div></div></div><div className="mx-auto mt-10 max-w-7xl border-t border-slate-100 pt-6 text-center text-xs text-slate-500 hostel-dark:border-slate-800 hostel-dark:text-slate-400">© {new Date().getFullYear()} Hostelrr. All rights reserved.</div></footer>
      {demoOpen && <DemoRequestModal phone={demoPhone} busy={demoBusy} sent={demoSent} onClose={()=>setDemoOpen(false)} onPhoneChange={setDemoPhone} onSubmit={submitDemo}/>}
    </main>
  );
}

function DemoRequestModal({phone,busy,sent,onClose,onPhoneChange,onSubmit}:{phone:string;busy:boolean;sent:boolean;onClose:()=>void;onPhoneChange:(value:string)=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="demo-title" className="hostelrr-demo-modal relative grid max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-[28px] bg-white shadow-2xl md:min-h-[580px] md:grid-cols-[.85fr_1.15fr]"><button onClick={onClose} aria-label="Close demo form" className="hostelrr-demo-close absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"><X size={19}/></button><aside className="hidden bg-gradient-to-br from-[#071944] via-[#102e69] to-[#234296] p-8 text-white md:flex md:flex-col"><Brand inverse/><p className="mt-16 max-w-sm text-3xl font-semibold leading-tight">Your hostel, <span className="text-blue-300">clearer</span> from day one.</p><p className="mt-3 max-w-sm text-sm leading-6 text-blue-100/80">A personalized walkthrough of Hostelrr’s owner workspace.</p><div className="mt-9 space-y-3">{['Beds and rooms at a glance','Resident details in one place','Rent cycles and payment records'].map(label=><div key={label} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm"><Check size={16} className="text-emerald-300"/>{label}</div>)}</div><div className="mt-auto rounded-2xl border border-white/15 bg-white/10 p-4 text-xs text-blue-100">A walkthrough tailored to your property.</div></aside><div className="hostelrr-demo-form p-6 pt-16 sm:p-10 sm:pt-16">{sent?<div className="flex min-h-[400px] flex-col items-center justify-center text-center"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Check size={30}/></span><h2 id="demo-title" className="mt-5 text-2xl font-extrabold text-slate-900">Request received</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Our team will contact you to arrange your Hostelrr demo.</p><a href="https://wa.me/917330744800?text=Hi%20Hostelrr%2C%20I%E2%80%99m%20interested%20in%20a%20free%20demo%20for%20my%20hostel.%20Please%20contact%20me." target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-5 py-3 font-bold text-emerald-700"><MessageCircle size={18}/> Message us on WhatsApp</a><button onClick={onClose} className="hostelrr-demo-close mt-4 text-sm font-semibold text-slate-500">Close</button></div>:<><h2 id="demo-title" className="max-w-md text-2xl font-bold leading-snug text-slate-950 sm:text-3xl">Interested in managing your property smartly?</h2><p className="mt-2 text-sm text-slate-500">Tell us a little about your property and we’ll get in touch.</p><form onSubmit={onSubmit} className="mt-7 space-y-4"><input name="name" maxLength={100} placeholder="Name" className="h-14 w-full rounded-xl border border-slate-200 px-5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/><div className="flex h-14 items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><span className="border-r px-4 text-sm font-semibold text-slate-500">+91</span><input required type="tel" inputMode="numeric" maxLength={10} value={phone.replace(/^\+?91/, '')} onChange={e=>onPhoneChange(e.target.value.replace(/\D/g,'').slice(-10))} placeholder="Phone number *" className="h-full w-full rounded-xl px-4 text-sm text-slate-900 outline-none"/></div><input required name="beds" type="number" min="1" max="10000" step="1" placeholder="Number of rooms / beds *" className="h-14 w-full rounded-xl border border-slate-200 px-5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/><input name="pincode" inputMode="numeric" maxLength={10} placeholder="Area pincode" className="h-14 w-full rounded-xl border border-slate-200 px-5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/><button disabled={busy} className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-[#3e55f5] text-base font-bold text-white shadow-md transition hover:bg-[#3046e8] disabled:opacity-60">{busy?'Sending…':'Get Free Demo'}</button></form><p className="mt-3 text-center text-xs text-slate-500"><ShieldCheck size={14} className="mr-1 inline text-[#3e55f5]"/>No spam. Our team will contact you.</p><div className="mt-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200"/><span>or</span><span className="h-px flex-1 bg-slate-200"/></div><a href="https://wa.me/917330744800?text=Hi%20Hostelrr%2C%20I%E2%80%99m%20interested%20in%20a%20free%20demo%20for%20my%20hostel.%20Please%20contact%20me." target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 text-base font-semibold text-emerald-600"><MessageCircle size={19}/>Message on WhatsApp</a></>}</div></section></div>;
}
