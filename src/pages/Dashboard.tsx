import React, { useState } from 'react';import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from '../routes/routes';
import { FLAGS } from '../core/env';
import { BedDouble, Users, AlertCircle, IndianRupee, PieChart, CheckCircle, Clock, LogOut, X, Info, Phone, ChevronRight, ChevronDown, UserPlus } from 'lucide-react';
import { cn, formatDate, getNamesFromIds } from '../lib/utils';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AnimatePresence, motion } from 'motion/react';
import EmptyState from '../components/EmptyState';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

function KpiCard({ title, value, icon: Icon, trend, className, cardBg = "bg-white", onClick, trendColor, style }: any) {
  return (
    <div 
      onClick={onClick}
      style={style}
      className={cn(
        "rounded-2xl p-3.5 sm:p-4 md:p-5 border shadow-sm flex flex-col justify-between h-full min-h-[108px] sm:min-h-[120px] md:min-h-[140px] transition-all relative overflow-hidden min-w-0", 
        cardBg,
        !cardBg.includes('border-') && "border-gray-100",
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]" : ""
      )}
    >
      <div className="flex justify-between items-start gap-3 relative z-10 mb-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-gray-500 font-medium text-[11px] sm:text-sm leading-tight pr-2">{title}</span>
          {trend && (
            <p className={cn("text-[10px] sm:text-xs font-medium mt-1 min-w-0", trendColor || "text-gray-500")}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn("p-2 rounded-lg shrink-0", className)}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
      <div className="mt-auto w-full relative z-10">
        <h3 className="text-xl sm:text-2xl md:text-[28px] font-bold text-gray-900 tracking-tight leading-tight md:leading-none mb-1 break-words">{value}</h3>
      </div>
    </div>
  );
}

type TrendTone = 'good' | 'bad' | 'neutral';

function getTrendColor(tone: TrendTone) {
  if (tone === 'good') return 'text-emerald-600';
  if (tone === 'bad') return 'text-rose-600';
  return 'text-gray-500';
}

type DashboardActivity = {
  id: string | number;
  text?: string;
  time?: string;
  icon?: string;
  action?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
};

function humanizeActivityAction(action?: string) {
  if (!action) return 'Activity';

  const overrides: Record<string, string> = {
    resident_added: 'Resident added',
    payment_recorded: 'Payment recorded',
    deposit_paid: 'Security deposit paid',
    resident_vacated: 'Resident vacated',
    reminder_sent: 'Reminder sent',
    complaint_resolved: 'Complaint resolved',
    room_updated: 'Room updated',
    room_created: 'Room created',
    bed_moved: 'Bed moved',
  };

  if (overrides[action]) return overrides[action];

  return action
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatActivityValue(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(formatActivityValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getActivitySummary(activity: DashboardActivity) {
  if (activity.text) return activity.text;

  const actionLabel = humanizeActivityAction(activity.action);
  const entityLabel = activity.entity_type
    ? activity.entity_type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
    : '';

  if (entityLabel) return `${actionLabel} · ${entityLabel}`;
  return actionLabel;
}

function getActivityContext(activity: DashboardActivity) {
  const bits: string[] = [];

  if (activity.action) bits.push(activity.action.replace(/_/g, ' '));
  if (activity.entity_type) bits.push(activity.entity_type.replace(/_/g, ' '));
  if (activity.entity_id) bits.push(`ID ${activity.entity_id.slice(0, 8)}`);

  return bits.join(' · ');
}

function getActivityDetails(activity: DashboardActivity) {
  const metadata = activity.metadata || {};
  const preferredKeys = ['name', 'resident', 'amount', 'method', 'room', 'bed', 'phone', 'reason', 'notes', 'reviewNotes', 'status'];
  const usedKeys = new Set<string>();
  const details: Array<{ label: string; value: string }> = [];

  preferredKeys.forEach((key) => {
    const value = formatActivityValue(metadata[key]);
    if (value) {
      usedKeys.add(key);
      details.push({
        label: key === 'reviewNotes' ? 'Review' : key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()),
        value: key === 'amount' && !value.startsWith('₹') ? `₹${value}` : value,
      });
    }
  });

  Object.entries(metadata).forEach(([key, rawValue]) => {
    if (usedKeys.has(key)) return;
    const value = formatActivityValue(rawValue);
    if (!value) return;
    details.push({
      label: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()),
      value: key.toLowerCase().includes('amount') && !value.startsWith('₹') ? `₹${value}` : value,
    });
  });

  return details.slice(0, 4);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { floors, residents, pastResidents, activities, joinRequests, rejectJoinRequest, markAsPaid, setActiveBuildingFilter, setActivePaymentsFilter, hostelProfile, sharingRentMap, syncStateWithDb, dashboardStats } = useApp();
  const [requestSearch, setRequestSearch] = useState('');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityModalOpenedFromMobile, setActivityModalOpenedFromMobile] = useState(false);
  const [isRevenueInfoModalOpen, setIsRevenueInfoModalOpen] = useState(false);
  const [seenActivityIds, setSeenActivityIds] = useState<Set<string | number>>(new Set());
  const [hasLoadedSeenActivityIds, setHasLoadedSeenActivityIds] = useState(false);

  const getSeenActivityStorageKey = () => `hostelrr_seen_activity_ids:${hostelProfile?.id || 'default'}`;

  const syncSeenActivityIds = (activityIds: Set<string | number>) => {
    setSeenActivityIds(activityIds);
    try {
      localStorage.setItem(getSeenActivityStorageKey(), JSON.stringify([...activityIds]));
    } catch {
      // Ignore storage errors.
    }

    window.dispatchEvent(new CustomEvent('activity-seen-updated'));
  };

  React.useEffect(() => {
    setHasLoadedSeenActivityIds(false);

    try {
      const rawValue = localStorage.getItem(getSeenActivityStorageKey());
      if (!rawValue) {
        setSeenActivityIds(new Set());
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      if (Array.isArray(parsedValue)) {
        setSeenActivityIds(new Set(parsedValue));
      }
    } catch {
      setSeenActivityIds(new Set());
    } finally {
      setHasLoadedSeenActivityIds(true);
    }
  }, [hostelProfile?.id]);

  // Open activity modal if navigated from mobile Activity button
  React.useEffect(() => {
    if ((location.state as any)?.showActivity) {
      setIsActivityModalOpen(true);
      setActivityModalOpenedFromMobile(true);
      // Consume route state once so modal does not reopen on later dashboard updates
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [activities, location.pathname, location.state, navigate]);

  const handleOpenActivityModal = () => {
    setIsActivityModalOpen(true);
    setActivityModalOpenedFromMobile(false);
    // Mark all current activities as seen when manually opening modal
    if (activities && activities.length > 0) {
      syncSeenActivityIds(new Set(activities.map(a => a.id)));
    }
  };

  const handleCloseActivityModal = () => {
    setIsActivityModalOpen(false);

    if (activityModalOpenedFromMobile && activities && activities.length > 0) {
      syncSeenActivityIds(new Set(activities.map(a => a.id)));
    }

    setActivityModalOpenedFromMobile(false);
  };

  // Auto-sync join requests every 10 seconds to catch new submissions
  React.useEffect(() => {
    const interval = setInterval(syncStateWithDb, 10000); // Poll every 10 seconds
    
    // Also sync when page regains focus
    const handleFocus = () => syncStateWithDb();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncStateWithDb]);

  const totalBeds = Number(dashboardStats?.total_beds || hostelProfile?.total_beds || 0);
  const occupiedBeds = Number(dashboardStats?.occupied_beds || 0);
  const vacantBeds = Number(dashboardStats?.vacant_beds || 0);
  const reservedBeds = Number(dashboardStats?.reserved_beds || 0);
  const activeResidents = residents.filter(r => r.status !== 'reserved');
  // List of residents with outstanding dues (UI list only). KPI numbers come from `dashboardStats`.
  const dueResidents = activeResidents.filter(r => (r.dueAmount || 0) > 0);
  const totalDueAmount = Number(dashboardStats?.pending_amount || 0);
  const thisMonthRevenue = Number(dashboardStats?.collected_this_month || 0);
  const expectedMonthlyRevenue = Number(dashboardStats?.expected_monthly_revenue || 0);
  const now = new Date();

  // Calculate vacating alerts (within 7 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const vacatingThisWeek = residents.filter(r => {
    if (!r.vacatingDate) return false;
    const vacateDate = new Date(r.vacatingDate);
    return vacateDate >= today && vacateDate <= sevenDaysFromNow;
  });

  const vacatingAlerts = vacatingThisWeek.length > 0 ? [{
    id: 'vacating-alert',
    text: `${vacatingThisWeek.length} resident${vacatingThisWeek.length === 1 ? '' : 's'} vacating this week`,
    time: 'Alert',
    icon: 'AlertCircle'
  }] : [];

  const handleNavigateBuilding = (filter: any) => {
    setActiveBuildingFilter(filter);
    navigate(ROUTES.rooms.path);
  };

  const handleNavigatePayments = (filter: any) => {
    setActivePaymentsFilter(filter);
    navigate(ROUTES.payments.path);
  };

  const defaultSecurityDeposit = Number(hostelProfile?.security_deposit || 0);
  const occupiedResidentsCount = occupiedBeds;
  const expectedTotalSecurityDeposit = occupiedResidentsCount * defaultSecurityDeposit;
  const finalExpectedRevenue = expectedMonthlyRevenue + expectedTotalSecurityDeposit;

  const pieData = totalBeds === 0 ? [
    { name: 'Empty', value: 1, color: '#e5e7eb' }
  ] : [
    { name: 'Occupied', value: occupiedBeds, color: '#22c55e' }, // green-500
    { name: 'Vacant', value: vacantBeds, color: '#ef4444' }, // red-500
    { name: 'Reserved', value: reservedBeds, color: '#3b82f6' }, // blue-500
  ];
  
  const legendData = [
    { name: 'Occupied', value: occupiedBeds, color: '#22c55e' },
    { name: 'Vacant', value: vacantBeds, color: '#ef4444' },
    { name: 'Reserved', value: reservedBeds, color: '#3b82f6' },
  ];

  const newResidentsThisMonth = activeResidents.filter(r => {
    if (!r.joinDate) return false;
    const d = new Date(r.joinDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const activityFeed: DashboardActivity[] = [...vacatingAlerts, ...activities];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 md:space-y-6 p-3 sm:p-4 md:p-8 overflow-x-hidden">
      <div className="mb-5 md:mb-8 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-1 leading-tight">Welcome back, {hostelProfile?.ownerName?.split(' ')[0] || "Owner"}</h1>
        <p className="text-sm sm:text-base text-gray-500">Here's what's happening at <span className="font-semibold text-gray-900">{hostelProfile?.hostelName || "your hostel"}</span> today.</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <KpiCard title="Total Beds" value={totalBeds} icon={BedDouble} className="bg-white text-gray-600" cardBg="bg-gray-50 border-gray-200" onClick={() => handleNavigateBuilding('all')} trendColor="text-gray-500" />
        <KpiCard title="Occupied Beds" value={occupiedBeds} icon={Users} trend={newResidentsThisMonth > 0 ? `+${newResidentsThisMonth} this month` : "No new joins this month"} className="bg-white text-green-600" cardBg="bg-green-50 border-green-200" onClick={() => handleNavigateBuilding('occupied')} trendColor="text-green-600" />
        <KpiCard title="Vacant Beds" value={vacantBeds} icon={PieChart} className="bg-white text-red-600" cardBg="bg-red-50 border-red-200" onClick={() => handleNavigateBuilding('vacant')} trendColor="text-red-600" />
        <KpiCard title="Pending Payments" value={`₹${totalDueAmount.toLocaleString('en-IN')}`} icon={AlertCircle} className="bg-white text-orange-600" cardBg="bg-orange-50 border-orange-200" onClick={() => handleNavigatePayments('Unpaid')} trendColor="text-orange-600" />
        <div className="col-span-2 lg:col-span-1">
          <KpiCard
            title="This Month's Rent"
            value={thisMonthRevenue > 0 ? `₹${thisMonthRevenue.toLocaleString('en-IN')}` : '₹0'}
            icon={IndianRupee}
            trend={
              <div className="space-y-1">
                <div className="flex min-w-0 items-center gap-1">
                  <span>Expected: ₹{expectedMonthlyRevenue.toLocaleString('en-IN')}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRevenueInfoModalOpen(true);
                      }}
                      className="w-5 h-5 md:w-4 md:h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-all shadow-sm active:scale-90 shrink-0"
                      aria-label="Open expected rent breakdown"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
              </div>
            }
            className="bg-white text-emerald-600"
            cardBg="bg-emerald-50 border-emerald-200"
            onClick={() => handleNavigatePayments('Paid')}
            trendColor="text-emerald-600"
          />
        </div>
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => navigate(ROUTES.monthlyOverview.path)}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98]"
        >
          <PieChart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
          <span>Monthly Overview</span>
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
        </button>
      </div>

      <AnimatePresence>
        {isRevenueInfoModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsRevenueInfoModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100"
            >
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white relative">
                <button
                  onClick={() => setIsRevenueInfoModalOpen(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/90 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                    <PieChart className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold">Rent Projections</h3>
                </div>
                <p className="text-blue-100 text-sm">Monthly expected rent overview</p>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-2xl bg-gray-50 border border-gray-100 group hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-tight">Monthly Rent</p>
                        <p className="text-sm font-medium text-gray-400">Fixed monthly income</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900">₹{expectedMonthlyRevenue.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-2xl bg-gray-50 border border-gray-100 group hover:border-indigo-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-tight">Security Deposits</p>
                        <p className="text-sm font-medium text-gray-400">{occupiedResidentsCount} active residents</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900">₹{expectedTotalSecurityDeposit.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-1">
                      <span className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Total Expected</span>
                      <span className="text-2xl font-black text-emerald-700">₹{finalExpectedRevenue.toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-xs text-emerald-600/80 font-medium">Sum of live rent and security deposit</p>
                  </div>
                </div>

                <button 
                  onClick={() => setIsRevenueInfoModalOpen(false)}
                  className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all active:scale-[0.98] shadow-lg shadow-gray-200"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 min-w-0">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-5 md:space-y-6 min-w-0">
          
          {/* Occupancy Overview */}
          <div className={cn("bg-white rounded-2xl p-4 md:p-6 border shadow-sm flex flex-col md:flex-row gap-5 md:gap-6 items-center min-w-0", totalBeds === 0 ? "border-gray-200 bg-gray-50" : "border-gray-100")}>
            <div className={cn("w-full max-w-[12rem] h-44 sm:h-48 md:w-48 md:h-48 flex-shrink-0", totalBeds === 0 && "opacity-60")}>
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div className={cn("flex-1 w-full space-y-4 min-w-0", totalBeds === 0 && "opacity-60")}>
              <h3 className="text-lg font-bold text-gray-900">Occupancy Overview</h3>
              <div className="space-y-3">
                {legendData.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }}></div>
                        <span className="text-gray-600 font-medium">{d.name}</span>
                      </div>
                      <span className="font-bold text-gray-900 whitespace-nowrap">{d.value} Beds</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${totalBeds === 0 ? 0 : (d.value / totalBeds) * 100}%`, backgroundColor: d.color }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Due Payments */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center gap-3 bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Pending Dues ({dashboardStats?.pending_count ?? dueResidents.length})</h3>
              <button 
                onClick={() => handleNavigatePayments('Unpaid')}
                className="min-h-10 px-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
              </button>
            </div>
            <div className="relative">
              <div className="divide-y divide-gray-100">
              {dueResidents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No pending dues!</div>
              ) : (
                dueResidents.slice(0,3).map(r => (
                  <div key={r.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                        <p className="text-xs text-gray-500">Room {getNamesFromIds(floors, r.roomId, r.bedId).roomName} • {getNamesFromIds(floors, r.roomId, r.bedId).bedName}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4 sm:text-right">
                      <div className="min-w-0">
                        <p className="font-bold text-red-600">₹{r.dueAmount}</p>
                        <p className="text-xs text-gray-500">Due {r.dueDate ? formatDate(r.dueDate) : 'Unknown'}</p>
                      </div>
                      <button 
                          onClick={() => {
                          const msg = `Hi ${r.name}, this is a reminder that your rent of Rs. *${r.dueAmount}* is pending. Please pay at your earliest convenience.\n\nThank you,\nPowered by Hostelrr`;
                          window.open(`https://wa.me/91${(r.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="min-h-10 bg-[#25D366] hover:bg-[#20BE5B] text-white px-3 py-2 sm:py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-1.5 shrink-0" title="Send WhatsApp Reminder"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        <span className="sm:hidden">Remind</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
              </div>

              {dueResidents.length > 3 && (
                <div className="absolute left-0 right-0 bottom-0 pointer-events-none">
                  <div className="w-full h-20 bg-gradient-to-t from-white to-transparent z-0"></div>
                  <button
                    onClick={() => handleNavigatePayments('Unpaid')}
                    className="pointer-events-auto absolute bottom-3 left-1/2 transform -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-white"
                    aria-label="View more pending dues"
                  >
                    More
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-5 md:space-y-6 min-w-0">
          
          {/* Join Requests */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 md:p-5 border-b border-gray-100 bg-blue-50/50 flex flex-col gap-4">
              <div className="flex justify-between items-center gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-gray-900 truncate">New Join Requests</h3>
                </div>
                {joinRequests.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">{joinRequests.length}</span>
                )}
              </div>
              {joinRequests.length > 0 && (
                <input 
                  type="text"
                  placeholder="Search requests..."
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                />
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {joinRequests.length === 0 ? (
                <div className="py-8 flex items-center justify-center">
                  <EmptyState 
                    icon={Users}
                    title="No new requests"
                    subtitle="Share your QR code to get more join requests."
                  />
                </div>
              ) : (
                (() => {
                  const filtered = joinRequests.filter(req => req.name.toLowerCase().includes(requestSearch.toLowerCase()) || req.phone.includes(requestSearch));
                  if (filtered.length === 0) {
                    return <div className="p-6 text-center text-gray-500 text-sm">No exact matches found</div>;
                  }
                  return filtered.map(req => (
                  <div key={req.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start gap-3 mb-2">
                       <div className="min-w-0">
                         <p className="font-semibold text-gray-900 leading-tight truncate">{req.name}</p>
                         <p className="text-sm text-gray-500 mt-1">{req.phone}</p>
                         {(req.occupation || req.preferredRoom) && (
                           <div className="flex flex-wrap gap-2 mt-2">
                             {req.occupation && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">{req.occupation}</span>}
                             {req.preferredRoom && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Room: {req.preferredRoom}</span>}
                           </div>
                         )}
                         {(req.emergencyContact || req.aadharNumber) && (
                           <div className="flex flex-wrap gap-2 mt-1">
                             {req.emergencyContact && <span className="text-[10px] text-gray-500">Emg: {req.emergencyContact}</span>}
                             {req.aadharNumber && <span className="text-[10px] text-gray-500">Aadhar: {req.aadharNumber}</span>}
                           </div>
                         )}

                         {(req.photoUrl || req.aadharDocumentUrl) && (
                           <div className="flex flex-wrap gap-2 mt-2">
                             {req.photoUrl && (
                               <a
                                 href={req.photoUrl}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full"
                               >
                                 View Photo
                               </a>
                             )}
                             {req.aadharDocumentUrl && (
                               <a
                                 href={req.aadharDocumentUrl}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full"
                               >
                                 View Aadhar
                               </a>
                             )}
                           </div>
                         )}
                       </div>
                       <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{req.requestDate}</span>
                    </div>
                    {/* Removed notes */}
                    <div className="flex flex-col gap-2 mt-3">
                       <button 
                         onClick={() => {
                           window.dispatchEvent(new CustomEvent('open-add-resident-modal', { detail: { ...req, source: 'joinRequest', stayTime: req.stayDuration, emergencyPhone: req.emergencyContact, aadhar: req.aadharNumber } }));
                         }}
                         className="w-full min-h-11 bg-[#1D4ED8] hover:bg-[#1e40af] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-sm"
                       >
                         Check & Add
                       </button>
                       <div className="grid grid-cols-2 gap-2 sm:flex">
                         <a href={`tel:${req.phone}`} className="flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-colors shadow-sm sm:flex-1">
                           <Phone className="w-3.5 h-3.5" /> Call
                         </a>
                         <a 
                           href={`https://wa.me/${(req.phone || '').replace(/[^0-9]/g, '').startsWith('91') && (req.phone || '').replace(/[^0-9]/g, '').length === 12 ? (req.phone || '').replace(/[^0-9]/g, '') : ((req.phone || '').replace(/[^0-9]/g, '').length === 10 ? '91' + (req.phone || '').replace(/[^0-9]/g, '') : (req.phone || '').replace(/[^0-9]/g, ''))}`} 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           className="flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-xl text-xs font-bold transition-colors shadow-sm sm:flex-1"
                         >
                           <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                         </a>
                         <button 
                           onClick={() => rejectJoinRequest(req.id)}
                           className="col-span-2 flex min-h-10 items-center justify-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl text-xs font-bold transition-colors sm:col-span-1"
                         >
                           <X className="w-3.5 h-3.5" /> Reject
                         </button>
                       </div>
                    </div>
                  </div>
                ));
              })() )
            }
            </div>
          </div>

          {/* Activity — desktop only */}
          <div className="hidden md:flex bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-col">
            <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center gap-3 bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Activity</h3>
              <button 
                onClick={handleOpenActivityModal}
                className="min-h-10 px-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
              </button>
            </div>
            <div className="p-2 space-y-1 relative">
              {vacatingAlerts.length === 0 && activities.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No recent activity</div>
              ) : (
                ([...vacatingAlerts, ...activities]).slice(0, 3).map((a, i) => (
                  <div key={a.id} className={cn("flex items-start gap-3 sm:gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors", seenActivityIds.has(a.id) ? "" : "bg-blue-50/50 border border-blue-100/50")}>
                    <div className={cn("flex items-center justify-center w-10 h-10 rounded-full shrink-0", a.icon === 'AlertCircle' ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600")}>
                      {a.icon === 'UserPlus' && <Users className="w-5 h-5" />}
                      {a.icon === 'IndianRupee' && <IndianRupee className="w-5 h-5" />}
                      {a.icon === 'LogOut' && <LogOut className="w-5 h-5" />}
                      {a.icon === 'CheckCircle' && <CheckCircle className="w-5 h-5" />}
                      {a.icon === 'AlertCircle' && <AlertCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex min-w-0 flex-col flex-1 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">{a.text}</span>
                        {!seenActivityIds.has(a.id) && (
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider leading-none">New</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 mt-0.5">{a.time}</span>
                    </div>
                  </div>
                ))
              )}

              {[...vacatingAlerts, ...activities].length > 3 && (
                <div className="absolute left-0 right-0 bottom-0 pointer-events-none">
                  <div className="w-full h-20 bg-gradient-to-t from-white to-transparent z-0"></div>
                  <button
                    onClick={handleOpenActivityModal}
                    className="pointer-events-auto absolute bottom-3 left-1/2 transform -translate-x-1/2 z-10 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-white"
                    aria-label="View more activity"
                  >
                    More
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <AnimatePresence>
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
            <div 
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
              onClick={handleCloseActivityModal}
            ></div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col relative z-10"
            >
              <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center gap-3 bg-gray-50/50">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Activity Log</h3>
                  <p className="text-sm text-gray-500">All recent activities in your hostel</p>
                </div>
                <button 
                  onClick={handleCloseActivityModal}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 relative">
                {vacatingAlerts.length === 0 && activities.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">No activity history found.</div>
                ) : (
                  [...vacatingAlerts, ...activities].map((a, i) => (
                    <div key={a.id} className={cn("flex items-start gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-gray-50 rounded-xl transition-colors border group", seenActivityIds.has(a.id) ? "border-transparent hover:border-gray-100" : "border-blue-100/50 bg-blue-50/50")}>
                      <div className={cn("flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full shrink-0 group-hover:scale-110 transition-transform", a.icon === 'AlertCircle' ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600")}>
                        {a.icon === 'UserPlus' && <Users className="w-5 h-5 sm:w-6 sm:h-6" />}
                        {a.icon === 'IndianRupee' && <IndianRupee className="w-5 h-5 sm:w-6 sm:h-6" />}
                        {a.icon === 'LogOut' && <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />}
                        {a.icon === 'CheckCircle' && <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
                        {a.icon === 'AlertCircle' && <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
                      </div>
                      <div className="flex min-w-0 flex-col flex-1 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm sm:text-base text-gray-900">{a.text}</span>
                          {!seenActivityIds.has(a.id) && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider leading-none">New</span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{a.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
