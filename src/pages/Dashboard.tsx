import React, { useState } from 'react';import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from '../routes/routes';
import { FLAGS } from '../core/env';
import { BedDouble, Users, AlertCircle, IndianRupee, PieChart, CheckCircle, Clock, LogOut, X, Info, Phone, ChevronRight, ChevronDown, UserPlus } from 'lucide-react';
import { addDaysToDateOnly, cn, formatDate, getAllPendingPaymentAmount, getNamesFromIds, getResidentDueDisplayAmount, getTodayIST, getWhatsAppUrl, isResidentReserved } from '../lib/utils';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AnimatePresence, motion } from 'motion/react';
import EmptyState from '../components/EmptyState';
import { PrivatePhotoLink } from '../components/PrivatePhoto';
import { toast } from 'sonner';
import { buildRentReminderMessage } from '../lib/reminderTemplate';
import { CurrencyNumberFlow } from '../components/ui/number-flow';
import ResidentAvatar from '../components/ResidentAvatar';

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
        "rounded-[1.35rem] p-3.5 sm:p-4 md:p-5 border-[1.5px] shadow-[0_8px_24px_rgb(15_23_42/4%)] flex flex-col justify-between h-full min-h-[108px] sm:min-h-[120px] md:min-h-[140px] transition-all relative overflow-hidden min-w-0",
        cardBg,
        !cardBg.includes('border-') && "border-gray-200",
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]" : ""
      )}
    >
      <div className="flex justify-between items-start gap-3 relative z-10 mb-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-gray-500 font-medium text-[11px] sm:text-sm leading-tight pr-2">{title}</span>
          {trend && (
            <div className={cn("text-[10px] sm:text-xs font-medium mt-1 min-w-0", trendColor || "text-gray-500")}>
              {trend}
            </div>
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
  details?: string[];
  notificationType?: 'payments' | 'rooms';
};

type NotificationType = 'all' | 'payments' | 'rooms';

function getNotificationType(activity: DashboardActivity): NotificationType {
  if (activity.notificationType) return activity.notificationType;

  const searchableText = [
    activity.action,
    activity.entity_type,
    activity.text,
  ].filter(Boolean).join(' ').toLowerCase();

  if (searchableText.includes('payment') || searchableText.includes('deposit') || searchableText.includes('rent')) {
    return 'payments';
  }

  if (
    searchableText.includes('room') ||
    searchableText.includes('bed') ||
    searchableText.includes('vacat') ||
    searchableText.includes('resident')
  ) {
    return 'rooms';
  }

  return 'all';
}

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
  const { floors, residents, pastResidents, activities, joinRequests, rejectJoinRequest, markAsPaid, setActiveBuildingFilter, setActivePaymentsFilter, hostelProfile, sharingRentMap, dashboardStats, isDataLoading } = useApp();
  const [requestSearch, setRequestSearch] = useState('');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityModalOpenedFromMobile, setActivityModalOpenedFromMobile] = useState(false);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [isRevenueInfoModalOpen, setIsRevenueInfoModalOpen] = useState(false);
  const [seenActivityIds, setSeenActivityIds] = useState<Set<string | number>>(new Set());
  const [hasLoadedSeenActivityIds, setHasLoadedSeenActivityIds] = useState(false);
  const [seenJoinRequestIds, setSeenJoinRequestIds] = useState<Set<string>>(new Set());
  const [hasLoadedSeenJoinRequestIds, setHasLoadedSeenJoinRequestIds] = useState(false);
  const lastAutoOpenedRequestIdRef = React.useRef<string | null>(null);
  const [notificationType, setNotificationType] = useState<NotificationType>('all');

  const getSeenActivityStorageKey = () => `hostelrr_seen_activity_ids:${hostelProfile?.id || 'default'}`;
  const getSeenJoinRequestStorageKey = () => `hostelrr_seen_join_request_ids:${hostelProfile?.id || 'default'}`;

  const syncSeenActivityIds = (activityIds: Set<string | number>) => {
    setSeenActivityIds(activityIds);
    try {
      localStorage.setItem(getSeenActivityStorageKey(), JSON.stringify([...activityIds]));
    } catch {
      // Ignore storage errors.
    }

    window.dispatchEvent(new CustomEvent('activity-seen-updated'));
  };

  const syncSeenJoinRequestIds = (ids: Set<string>) => {
    setSeenJoinRequestIds(ids);
    try {
      localStorage.setItem(getSeenJoinRequestStorageKey(), JSON.stringify([...ids]));
    } catch {
      // Ignore storage errors.
    }
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

  React.useEffect(() => {
    setHasLoadedSeenJoinRequestIds(false);

    try {
      const rawValue = localStorage.getItem(getSeenJoinRequestStorageKey());
      if (!rawValue) {
        setSeenJoinRequestIds(new Set());
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      if (Array.isArray(parsedValue)) {
        setSeenJoinRequestIds(new Set(parsedValue));
      }
    } catch {
      setSeenJoinRequestIds(new Set());
    } finally {
      setHasLoadedSeenJoinRequestIds(true);
    }
  }, [hostelProfile?.id]);

  // Automatically pop up join requests modal when new unseen request arrives
  React.useEffect(() => {
    if (isDataLoading || !hasLoadedSeenJoinRequestIds || !hostelProfile?.id) {
      return;
    }

    const pendingRequests = joinRequests.filter(req => req.status === 'pending');
    if (pendingRequests.length === 0) return;

    const unseenRequests = pendingRequests.filter(req => !seenJoinRequestIds.has(req.id));
    if (unseenRequests.length > 0) {
      const newestUnseenId = unseenRequests[0].id;
      if (lastAutoOpenedRequestIdRef.current !== newestUnseenId) {
        lastAutoOpenedRequestIdRef.current = newestUnseenId;
        setIsJoinRequestsModalOpen(true);
      }
    }
  }, [isDataLoading, hasLoadedSeenJoinRequestIds, hostelProfile?.id, joinRequests, seenJoinRequestIds]);

  // Open activity modal if navigated from mobile Activity button
  React.useEffect(() => {
    if ((location.state as any)?.showActivity) {
      setIsActivityModalOpen(true);
      setActivityModalOpenedFromMobile(true);
      // Consume route state once so modal does not reopen on later dashboard updates
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [activities, location.pathname, location.state, navigate]);

  React.useEffect(() => {
    if ((location.state as any)?.showJoinRequests) {
      handleOpenJoinRequestsModal();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const handleOpenJoinRequestsModal = () => {
    setIsJoinRequestsModalOpen(true);
  };

  const handleCloseJoinRequestsModal = () => {
    setIsJoinRequestsModalOpen(false);
    if (joinRequests && joinRequests.length > 0) {
      const nextSeen = new Set(seenJoinRequestIds);
      joinRequests.filter(r => r.status === 'pending').forEach(r => nextSeen.add(r.id));
      syncSeenJoinRequestIds(nextSeen);
    }
  };

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

  const totalBeds = Number(dashboardStats?.total_beds || hostelProfile?.total_beds || 0);
  const occupiedBeds = Number(dashboardStats?.occupied_beds || 0);
  const vacantBeds = Number(dashboardStats?.vacant_beds || 0);
  const reservedBeds = Number(dashboardStats?.reserved_beds || 0);
  const reservedResidents = residents.filter(resident => isResidentReserved(resident, floors));
  const reservedResidentsCount = reservedResidents.length;
  const activeResidents = residents.filter(r => !isResidentReserved(r, floors));
  // Pending Today: the same resident criteria used by Payments filter.
  const dueResidents = activeResidents.filter(r =>
    (r.dueAmount || 0) > 0 &&
    (
      r.pendingDueToday === true ||
      (r.pendingDueToday == null && r.paymentStatus === 'due' && r.dueDate === getTodayIST())
    )
  );
  const totalDueAmount = getAllPendingPaymentAmount(residents, floors);
  const thisMonthRevenue = Number(dashboardStats?.collected_this_month || 0);
  const expectedMonthlyRevenue = activeResidents.reduce((total, resident) => total + (resident.monthlyRent || 0), 0);
  const today = getTodayIST();
  const currentMonth = today.slice(0, 7);

  // Calculate vacating alerts (within 7 days)
  const sevenDaysFromNow = addDaysToDateOnly(today, 7);

  const vacatingThisWeek = residents.filter(r => {
    if (!r.vacatingDate) return false;
    return r.vacatingDate >= today && r.vacatingDate <= sevenDaysFromNow;
  });

  const vacatingAlerts = vacatingThisWeek.length > 0 ? [{
    id: 'vacating-alert',
    text: `${vacatingThisWeek.length} resident${vacatingThisWeek.length === 1 ? '' : 's'} vacating this week`,
    time: 'Alert',
    icon: 'AlertCircle',
    notificationType: 'rooms' as const,
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
  const collectsSecurityDeposit = Boolean(hostelProfile?.collectSecurityDeposit ?? defaultSecurityDeposit > 0);
  const occupiedResidentsCount = occupiedBeds;
  const expectedTotalSecurityDeposit = occupiedResidentsCount * defaultSecurityDeposit;
  const finalExpectedRevenue = expectedMonthlyRevenue + (collectsSecurityDeposit ? expectedTotalSecurityDeposit : 0);

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
    return r.joinDate.slice(0, 7) === currentMonth;
  }).length;

  const activityFeed: DashboardActivity[] = [...vacatingAlerts, ...activities];
  const filteredActivityFeed = activityFeed.filter((activity) =>
    (collectsSecurityDeposit || activity.action !== 'deposit_paid') &&
    (notificationType === 'all' || getNotificationType(activity) === notificationType)
  );
  const notificationTabs: Array<{ value: NotificationType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: 'all', label: 'All', icon: Users },
    { value: 'payments', label: 'Payments', icon: IndianRupee },
    { value: 'rooms', label: 'Rooms', icon: BedDouble },
  ];
  const filteredJoinRequests = joinRequests.filter(req =>
    req.name.toLowerCase().includes(requestSearch.toLowerCase()) || req.phone.includes(requestSearch)
  );
  const sortedJoinRequests = [...filteredJoinRequests].sort((a, b) => {
    const aNew = !seenJoinRequestIds.has(a.id);
    const bNew = !seenJoinRequestIds.has(b.id);
    if (aNew && !bNew) return -1;
    if (!aNew && bNew) return 1;
    return 0;
  });

  return (
    <div className="w-full max-w-[1360px] mx-auto space-y-6 md:space-y-8 p-4 sm:p-5 md:p-9 overflow-x-hidden">
      <div className="mb-5 md:mb-8 min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-[-0.04em] mb-2 leading-tight">Welcome back, {hostelProfile?.ownerName?.split(' ')[0] || "Owner"}</h1>
        <p className="max-w-[65ch] text-sm sm:text-base text-slate-500">Here's what's happening at <span className="font-bold text-slate-800">{hostelProfile?.hostelName || "your hostel"}</span> today.</p>
      </div>

      {reservedResidentsCount > 0 && (
        <div className="-mt-3 mb-1 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-600 shadow-sm">
              <BedDouble className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {reservedResidentsCount} reserved resident{reservedResidentsCount === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-xs font-medium text-blue-700/80">
                Beds awaiting move-in confirmation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`${ROUTES.residents.path}?filter=reserved`, { state: { showReserved: true } })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            View reserved
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-5">
        <KpiCard title="Total Beds" value={totalBeds} icon={BedDouble} className="bg-white text-gray-600" cardBg="bg-gray-50 border-gray-200" onClick={() => handleNavigateBuilding('all')} trendColor="text-gray-500" />
        <KpiCard title="Occupied Beds" value={occupiedBeds} icon={Users} trend={newResidentsThisMonth > 0 ? `+${newResidentsThisMonth} this month` : "No new joins this month"} className="bg-white text-green-500" cardBg="bg-green-50 border-green-300" onClick={() => handleNavigateBuilding('occupied')} trendColor="text-green-600" />
        <KpiCard title="Vacant Beds" value={vacantBeds} icon={PieChart} className="bg-white text-red-500" cardBg="bg-red-50 border-red-300" onClick={() => handleNavigateBuilding('vacant')} trendColor="text-red-600" />
        <KpiCard title="All Pending Payments" value={<CurrencyNumberFlow value={totalDueAmount} />} icon={AlertCircle} className="bg-white text-orange-500" cardBg="bg-orange-50 border-orange-300" onClick={() => handleNavigatePayments('Unpaid')} trendColor="text-orange-600" />
        <div className="col-span-2 lg:col-span-1">
          <KpiCard
            title="This Month's Rent"
            value={<CurrencyNumberFlow value={thisMonthRevenue} />}
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
            className="bg-white text-emerald-500"
            cardBg="bg-emerald-50 border-emerald-300"
            onClick={() => handleNavigatePayments('Paid')}
            trendColor="text-emerald-600"
          />
        </div>
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

                  {collectsSecurityDeposit && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-2xl bg-gray-50 border border-gray-100 group hover:border-indigo-200 transition-colors">
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
                  </div>}
                </div>

                <div className="pt-2">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-1">
                      <span className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Total Expected</span>
                      <span className="text-2xl font-black text-emerald-700">₹{finalExpectedRevenue.toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-xs text-emerald-600/80 font-medium">{collectsSecurityDeposit ? 'Sum of live rent and security deposit' : 'Expected monthly rent'}</p>
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-900">Occupancy Overview</h3>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.monthlyOverview.path)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.98]"
                >
                  <PieChart className="h-3.5 w-3.5 text-gray-500" />
                  <span>Monthly Overview</span>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
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

          {/* Pending Today - payments table UI */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">Pending Today ({dueResidents.length})</h3>
              <button
                onClick={() => handleNavigatePayments('Pending')}
                className="min-h-10 px-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
              </button>
            </div>

            {dueResidents.length === 0 ? (
              <EmptyState icon={Users} title="No pending payments today" subtitle="No residents are due today." />
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="w-[29%] px-6 py-4 text-xs font-extrabold uppercase tracking-[0.12em]">Resident</th>
                        <th className="w-[12%] px-4 py-4 text-xs font-extrabold uppercase tracking-[0.12em]">Room</th>
                        <th className="w-[14%] px-4 py-4 text-xs font-extrabold uppercase tracking-[0.12em]">Status</th>
                        <th className="w-[18%] px-4 py-4 text-xs font-extrabold uppercase tracking-[0.12em]">Rent / Due</th>
                        <th className="w-[27%] px-6 py-4 text-right text-xs font-extrabold uppercase tracking-[0.12em]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dueResidents.map((r, index) => {
                        const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, r.roomId, r.bedId);
                        const rentAmount = getResidentDueDisplayAmount(r, floors);
                        const statusClass = r.paymentStatus === 'late'
                          ? 'bg-red-100 text-red-700'
                          : r.paymentStatus === 'partially_paid'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-orange-100 text-orange-700';
                        const statusLabel = r.paymentStatus === 'late'
                          ? 'Late'
                          : r.paymentStatus === 'partially_paid'
                            ? 'Partially'
                            : 'Pending';
                        const sendReminder = () => {
                          const msg = buildRentReminderMessage(hostelProfile?.reminderTemplate, {
                            name: r.name,
                            amount: r.dueAmount,
                            room: roomNum,
                            dueDate: r.dueDate ? formatDate(r.dueDate) : 'Today',
                            hostelName: hostelProfile?.hostelName || 'My Hostel',
                          });
                          const waUrl = getWhatsAppUrl(r.phone, msg);
                          if (!waUrl) {
                            toast.error('Invalid Indian mobile number');
                            return;
                          }
                          if (!window.open(waUrl, '_blank')) {
                            toast.error('Your browser blocked the WhatsApp tab. Allow pop-ups for Hostelrr and try again.');
                          }
                        };

                        return (
                          <tr
                            key={r.id}
                            className={cn(
                              "border-t border-slate-200 transition-colors hover:bg-slate-200",
                              index % 2 === 0 ? "bg-white" : "bg-slate-100"
                            )}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <ResidentAvatar resident={r} floors={floors} className="h-11 w-11" dotClassName="h-3 w-3" />
                                <div className="min-w-0">
                                  <span className="truncate text-[15px] font-bold text-slate-900">{r.name}</span>
                                  <span className="mt-0.5 block text-xs font-medium text-slate-500">Bed {bedLetter}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-700">{roomNum}</td>
                            <td className="px-4 py-4">
                              <span className={cn("rounded-full px-3 py-1 text-xs font-bold", statusClass)}>{statusLabel}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-[15px] font-black tabular-nums text-slate-900">₹{rentAmount.toLocaleString('en-IN')}</div>
                              <div className="mt-0.5 text-xs font-medium text-slate-500">Due {formatDate(r.dueDate || getTodayIST())}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={sendReminder} className="h-10 rounded-full bg-[#28a745] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#218838] flex items-center gap-1.5">
                                  <WhatsAppIcon className="h-3.5 w-3.5" /> Remind
                                </button>
                                <button
                                  onClick={() => {
                                    void markAsPaid(r.id, 'UPI', undefined, getTodayIST());
                                    toast.success(`${r.name} marked as paid`);
                                  }}
                                  className="h-10 rounded-full border border-emerald-200 bg-white px-4 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Mark paid
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-200 md:hidden">
                  {dueResidents.map((r, index) => {
                    const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, r.roomId, r.bedId);
                    const rentAmount = getResidentDueDisplayAmount(r, floors);
                    return (
                      <div key={r.id} className={cn("p-4", index % 2 === 0 ? "bg-white" : "bg-slate-100")}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ResidentAvatar resident={r} floors={floors} className="h-11 w-11" dotClassName="h-3 w-3" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{r.name}</p>
                              <p className="text-xs font-medium text-slate-500">Room {roomNum} · Bed {bedLetter}</p>
                            </div>
                          </div>
                          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">Pending</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-black tabular-nums text-slate-900">₹{rentAmount.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-slate-500">Due {formatDate(r.dueDate || getTodayIST())}</p>
                          </div>
                          <button
                            onClick={() => handleNavigatePayments('Pending')}
                            className="h-9 rounded-full border border-blue-200 px-3 text-xs font-bold text-blue-700"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-5 md:space-y-0 md:flex md:flex-col md:gap-6 min-w-0">

          {/* Join Requests */}
          <div className={cn(
            "bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col md:order-2",
            joinRequests.length > 0 && "md:order-1"
          )}>
            <div className="p-4 md:p-5 border-b border-gray-100 bg-blue-50/50 flex flex-col gap-4">
              <div className="flex justify-between items-center gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-gray-900 truncate">New Join Requests</h3>
                  {joinRequests.length > 0 && (
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">{joinRequests.length}</span>
                  )}
                </div>
                {joinRequests.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenJoinRequestsModal}
                    className="min-h-10 px-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    View All
                  </button>
                )}
              </div>
              {joinRequests.length > 0 && (
                <input
                  type="search"
                  aria-label="Search join requests"
                  placeholder="Search requests..."
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [&::-webkit-search-cancel-button]:hidden"
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
                  if (filteredJoinRequests.length === 0) {
                    return <div className="p-6 text-center text-gray-500 text-sm">No exact matches found</div>;
                  }
                  return sortedJoinRequests.slice(0, 1).map(req => {
                    const isNew = !seenJoinRequestIds.has(req.id);
                    return (
                    <div key={req.id} className={cn("p-4 transition-colors rounded-xl", isNew ? "bg-blue-50/50 border border-blue-100/50" : "hover:bg-gray-50")}>
                      <div className="flex justify-between items-start gap-3 mb-2">
                         <div className="min-w-0">
                           <div className="flex items-center gap-2 flex-wrap">
                             <p className="font-semibold text-gray-900 leading-tight truncate">{req.name}</p>
                             {isNew && (
                               <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider leading-none">New</span>
                             )}
                           </div>
                           <p className="text-sm text-gray-500 mt-1">{req.phone}</p>
                         {(req.occupation || req.preferredRoom || req.preferredSharing) && (
                           <div className="flex flex-wrap gap-2 mt-2">
                             {req.occupation && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">{req.occupation}</span>}
                             {req.preferredRoom && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Room: {req.preferredRoom}</span>}
                             {req.preferredSharing && <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">Sharing: {req.preferredSharing}</span>}
                           </div>
                         )}
                         {(req.photoPath || req.photoUrl) && (
                           <div className="flex flex-wrap gap-2 mt-2">
                             <PrivatePhotoLink
                               kind="join-request"
                               id={req.id}
                               photoPath={req.photoPath}
                               fallbackSrc={req.photoUrl}
                               className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full"
                             >
                               View Photo
                             </PrivatePhotoLink>
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
                         <a href={`tel:${req.phone}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 sm:flex-1">
                           <Phone className="h-4 w-4" /> Call
                         </a>
                         <a
                           href={`https://wa.me/${(req.phone || '').replace(/[^0-9]/g, '').startsWith('91') && (req.phone || '').replace(/[^0-9]/g, '').length === 12 ? (req.phone || '').replace(/[^0-9]/g, '') : ((req.phone || '').replace(/[^0-9]/g, '').length === 10 ? '91' + (req.phone || '').replace(/[^0-9]/g, '') : (req.phone || '').replace(/[^0-9]/g, ''))}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 bg-[#28a745] hover:bg-[#218838] text-white rounded-xl text-xs font-bold transition-colors shadow-sm sm:flex-1"
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
                );
              });
            })() )
          }
          </div>
          {filteredJoinRequests.length > 1 && (
            <div className="relative -mt-20 pointer-events-none">
              <div className="h-20 bg-gradient-to-t from-white to-transparent"></div>
              <button
                type="button"
                onClick={handleOpenJoinRequestsModal}
                className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-sm hover:bg-white"
                aria-label="View more join requests"
              >
                More
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
          </div>

          {/* Activity — desktop only */}
          <div className={cn(
            "hidden md:flex bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-col md:order-1",
            joinRequests.length > 0 && "md:order-2"
          )}>
            <div className="p-4 md:p-5 border-b border-gray-100 bg-gray-50/50 space-y-3">
              <div className="flex justify-between items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
              <button
                onClick={handleOpenActivityModal}
                className="min-h-10 px-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
              </button>
              </div>
              <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="Notification type">
                {notificationTabs.map((tab) => {
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={notificationType === tab.value}
                      onClick={() => setNotificationType(tab.value)}
                      className={cn(
                        "flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold transition-all",
                        notificationType === tab.value
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-2 space-y-1 relative">
              {filteredActivityFeed.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No {notificationType === 'all' ? 'recent' : notificationType} notifications</div>
              ) : (
                filteredActivityFeed.slice(0, 3).map((a) => (
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
                      {a.details?.length > 0 && (
                        <p className="mt-1 text-xs leading-4 text-gray-500">{a.details.join(' • ')}</p>
                      )}
                      <span className="text-xs text-gray-500 mt-0.5">{a.time}</span>
                    </div>
                  </div>
                ))
              )}

              {filteredActivityFeed.length > 3 && (
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
        {isJoinRequestsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={handleCloseJoinRequestsModal}
            ></div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-h-[85dvh] sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-gray-100 bg-blue-50/50 p-4 sm:p-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-900 sm:text-xl">New Join Requests</h3>
                    {joinRequests.filter(req => req.status === 'pending' && !seenJoinRequestIds.has(req.id)).length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider leading-none">
                        {joinRequests.filter(req => req.status === 'pending' && !seenJoinRequestIds.has(req.id)).length} New
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">Review all pending applications</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseJoinRequestsModal}
                  className="shrink-0 rounded-full p-2 text-gray-500 transition-colors hover:bg-blue-100"
                  aria-label="Close join requests"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                {sortedJoinRequests.map(req => {
                  const isNew = !seenJoinRequestIds.has(req.id);
                  return (
                  <div key={req.id} className={cn("rounded-2xl border p-4 transition-colors", isNew ? "border-blue-100/50 bg-blue-50/50" : "border-gray-100 hover:bg-gray-50")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="truncate font-semibold text-gray-900">{req.name}</p>
                          {isNew && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider leading-none">New</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{req.phone}</p>
                        {(req.occupation || req.preferredRoom || req.preferredSharing || req.stayDuration || req.areaAndCity) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {req.occupation && <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{req.occupation}</span>}
                            {req.preferredRoom && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">Room: {req.preferredRoom}</span>}
                            {req.preferredSharing && <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] text-purple-700">Sharing: {req.preferredSharing}</span>}
                            {req.stayDuration && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">Stay: {req.stayDuration} days</span>}
                            {req.areaAndCity && <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">{req.areaAndCity}</span>}
                          </div>
                        )}
                        {(req.photoPath || req.photoUrl) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <PrivatePhotoLink
                              kind="join-request"
                              id={req.id}
                              photoPath={req.photoPath}
                              fallbackSrc={req.photoUrl}
                              className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium"
                            >
                              View Photo
                            </PrivatePhotoLink>
                          </div>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-[10px] font-medium text-gray-400">{req.requestDate}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={() => {
                          handleCloseJoinRequestsModal();
                          window.dispatchEvent(new CustomEvent('open-add-resident-modal', { detail: { ...req, source: 'joinRequest', stayTime: req.stayDuration, emergencyPhone: req.emergencyContact, aadhar: req.aadharNumber } }));
                        }}
                        className="col-span-2 min-h-10 rounded-xl bg-[#1D4ED8] px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#1e40af] sm:col-span-1 sm:flex-1"
                      >
                        Check & Add
                      </button>
                      <a href={`tel:${req.phone}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 sm:flex-1">
                        <Phone className="h-4 w-4" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${(req.phone || '').replace(/[^0-9]/g, '').startsWith('91') && (req.phone || '').replace(/[^0-9]/g, '').length === 12 ? (req.phone || '').replace(/[^0-9]/g, '') : ((req.phone || '').replace(/[^0-9]/g, '').length === 10 ? '91' + (req.phone || '').replace(/[^0-9]/g, '') : (req.phone || '').replace(/[^0-9]/g, ''))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 bg-[#28a745] hover:bg-[#218838] text-white rounded-xl text-xs font-bold transition-colors shadow-sm sm:flex-1"
                      >
                        <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => rejectJoinRequest(req.id)}
                        className="col-span-2 flex min-h-10 items-center justify-center gap-1 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 shadow-sm transition-colors hover:bg-red-100 sm:col-span-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <div
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={handleCloseActivityModal}
            ></div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-2xl max-h-[100dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col relative z-10"
            >
              <div className="shrink-0 p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50 space-y-3">
                <div className="flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Notifications</h3>
                  <p className="text-sm text-gray-500">Recent activity in your hostel</p>
                </div>
                <button
                  onClick={handleCloseActivityModal}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
                </div>
                <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="Notification type">
                  {notificationTabs.map((tab) => {
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        role="tab"
                        aria-selected={notificationType === tab.value}
                        onClick={() => setNotificationType(tab.value)}
                        className={cn(
                          "flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-bold transition-all",
                          notificationType === tab.value
                            ? "bg-slate-900 text-white shadow-sm"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <TabIcon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[env(safe-area-inset-bottom)] sm:p-4 space-y-2 relative">
                {filteredActivityFeed.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">No {notificationType === 'all' ? 'notification history' : `${notificationType} notifications`} found.</div>
                ) : (
                  filteredActivityFeed.map((a) => (
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
                        {a.details?.length > 0 && (
                          <p className="mt-1 text-xs leading-5 text-gray-500">{a.details.join(' • ')}</p>
                        )}
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
