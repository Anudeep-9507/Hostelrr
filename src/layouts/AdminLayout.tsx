import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Building2, ChevronLeft, CircleDollarSign, CreditCard, LayoutDashboard, LogOut, Settings2, Shield, Users, ScrollText, ClipboardList } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { callAdmin } from '../lib/adminAPI';
import { Toaster } from 'sonner';

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Owners', icon: Users },
  { to: '/admin/hostels', label: 'Hostels', icon: Building2 },
  { to: '/admin/demo-requests', label: 'Demo requests', icon: ClipboardList },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CircleDollarSign },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/system', label: 'System', icon: Activity },
  { to: '/admin/audit-logs', label: 'Audit log', icon: ScrollText },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const logout = async () => { try { await callAdmin('admin_event', { event: 'admin_logout' }); } catch { /* Sign-out must still complete if audit logging is unavailable. */ } await supabase.auth.signOut(); navigate('/admin/login', { replace: true }); };
  return <div className="flex h-dvh overflow-hidden bg-[#f6f7fb] text-slate-900">
    <aside className="hidden w-[250px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
        <img
          src="https://res.cloudinary.com/dfkfysygf/image/upload/v1795005162/hostelrr_selected_logo_sgnck0.png" 
          alt="Hostelrr Logo" 
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
        />
        <div>
          <div className="brand-gradient text-[15px] font-extrabold tracking-tight">Hostelrr</div>
          <div className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Platform control</div>
        </div>
      </div>
      <div className="px-4 pt-6"><div className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[.18em] text-slate-400">Administration</div><nav className="space-y-1">{nav.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition ${isActive?'bg-gradient-to-r from-blue-50/90 to-indigo-50/30 text-blue-700 font-bold border border-blue-100/80 shadow-[0_1px_3px_rgba(21,93,252,0.08)]':'text-slate-500 font-medium hover:bg-slate-50 hover:text-slate-900 border border-transparent'}`}>{({isActive})=><>{isActive&&<span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"/>}<Icon size={17} className={isActive?'text-blue-600 stroke-[2.25]':'text-slate-400'}/>{label}</>}</NavLink>)}</nav></div>
      <div className="mt-auto space-y-1 border-t border-slate-100 p-4"><NavLink to="/admin/admins" className={({isActive})=>`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition ${isActive?'bg-gradient-to-r from-blue-50/90 to-indigo-50/30 text-blue-700 font-bold border border-blue-100/80 shadow-[0_1px_3px_rgba(21,93,252,0.08)]':'text-slate-500 font-medium hover:bg-slate-50 border border-transparent'}`}>{({isActive})=><>{isActive&&<span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"/>}<Shield size={17} className={isActive?'text-blue-600 stroke-[2.25]':'text-slate-400'}/> Administrator</>}</NavLink><NavLink to="/admin/settings" className={({isActive})=>`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition ${isActive?'bg-gradient-to-r from-blue-50/90 to-indigo-50/30 text-blue-700 font-bold border border-blue-100/80 shadow-[0_1px_3px_rgba(21,93,252,0.08)]':'text-slate-500 font-medium hover:bg-slate-50 border border-transparent'}`}>{({isActive})=><>{isActive&&<span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"/>}<Settings2 size={17} className={isActive?'text-blue-600 stroke-[2.25]':'text-slate-400'}/> Platform settings</>}</NavLink><button onClick={()=>void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900"><LogOut size={17}/> Sign out</button></div>
      <div className="mx-4 mb-4 rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Production project</div><div className="mt-1 truncate pl-4 text-[10px] text-slate-400">hostelrr-prod · ap-south-1</div></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden"><header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-7"><div className="flex items-center gap-3"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 lg:hidden"><img src="https://res.cloudinary.com/dfkfysygf/image/upload/v1795005162/hostelrr_selected_logo_sgnck0.png" alt="Hostelrr Logo" className="h-5 w-5 rounded object-cover" /></span><div className="text-[13px] text-slate-400"><span className="brand-gradient font-bold">Hostelrr</span> <span className="px-1 text-slate-300">/</span><span className="font-semibold text-slate-700">Super Admin</span></div></div><div className="flex items-center gap-3"><span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 sm:inline-flex">● Admin session active</span><button onClick={()=>void logout()} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 lg:hidden" aria-label="Sign out"><LogOut size={16}/></button><div className="grid h-9 w-9 place-items-center rounded-full bg-[#25253c] text-xs font-bold text-white">SA</div></div></header><nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">{nav.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold ${isActive?'bg-indigo-50 text-indigo-700':'text-slate-500'}`}><Icon size={14}/>{label}</NavLink>)}</nav><main className="min-h-0 flex-1 overflow-auto"><Outlet/></main><Toaster position="top-right" richColors expand visibleToasts={9} closeButton /></div>
  </div>;
}
