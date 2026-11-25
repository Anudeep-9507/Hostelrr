import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from '../routes/routes';
import { BedDouble, Users, AlertCircle, IndianRupee, PieChart, CheckCircle, Clock, LogOut, UserPlus, Shield, ChevronLeft } from 'lucide-react';
import { cn, formatDate, getNamesFromIds, getTodayIST, isSecurityDepositPayment, isResidentReserved } from '../lib/utils';
import { getDailyOverviewSnapshots, getMonthlyOverviewSnapshots, saveDailyOverviewSnapshot, saveMonthlyOverviewSnapshot, type DailyOverviewSnapshot, type MonthlyOverviewSnapshot } from '../lib/supabaseAPI';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type TrendSeries = { key: string; label: string; color: string; format?: 'money' | 'percent' };

function TrendChart({ title, subtitle, data, series, emptyText }: { title: string; subtitle: string; data: Array<Record<string, any>>; series: TrendSeries[]; emptyText: string }) {
  const formatValue = (value: number, format?: TrendSeries['format']) => {
    if (format === 'money') return `₹${Number(value).toLocaleString('en-IN')}`;
    if (format === 'percent') return `${Number(value).toFixed(0)}%`;
    return Number(value).toLocaleString('en-IN');
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <header className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
      </header>
      {data.length > 0 ? <>
        <div className="h-64 px-4 pt-4" role="img" aria-label={`${title} trend: ${subtitle}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -12, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="#edf0f5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip wrapperStyle={{ outline: 'none' }} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.10)' }} formatter={(value, name) => {
                const item = series.find(entry => entry.label === name);
                return [formatValue(Number(value), item?.format), name];
              }} />
              {series.map(item => <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2.75} strokeLinecap="round" dot={{ r: 3, fill: item.color, strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-6 pb-4 pt-2">
          {series.map(item => <span key={item.key} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-500"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
        </div>
        {data.length === 1 && <p className="px-6 pb-4 text-[10px] text-gray-400">Live snapshot shown. Trend line will form as more snapshots are captured.</p>}
      </> : <p className="grid h-64 place-items-center px-5 text-center text-xs text-gray-500">{emptyText}</p>}
    </section>
  );
}

function KpiCard({ title, value, icon: Icon, trend, className, cardBg = "bg-white", onClick, trendColor }: any) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl p-4 md:p-5 border shadow-sm flex flex-col justify-between h-full min-h-[124px] md:min-h-[140px] transition-all relative overflow-hidden min-w-0",
        cardBg,
        !cardBg.includes('border-') && "border-gray-100",
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]" : ""
      )}
    >
      <div className="flex justify-between items-start gap-3 relative z-10 mb-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-gray-500 font-medium text-sm leading-tight pr-2">{title}</span>
          {trend && (
            <p className={cn("text-xs font-medium mt-1 min-w-0", trendColor || "text-gray-500")}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn("p-2 rounded-lg shrink-0", className)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-auto w-full relative z-10">
        <h3 className="text-2xl md:text-[28px] font-bold text-gray-900 tracking-tight leading-tight md:leading-none mb-1.5 break-words">{value}</h3>
      </div>
    </div>
  );
}

type TrendTone = 'good' | 'bad' | 'neutral';

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function isSuccessfulPayment(status?: string) {
  return !!status && ['paid', 'partial', 'partially_paid'].includes(status.toLowerCase());
}

function percentChange(current: number, previous: number): { label: string; tone: TrendTone } {
  if (previous === 0) {
    return { label: 'No prior month data', tone: 'neutral' };
  }

  const rawChange = ((current - previous) / previous) * 100;
  const rounded = Math.round(rawChange);
  if (rounded === 0) {
    return { label: 'Same as last month', tone: 'neutral' };
  }

  return {
    label: `${rounded > 0 ? '+' : ''}${rounded}% from last month`,
    tone: rounded > 0 ? 'good' : 'bad',
  };
}

function getTrendText(current: number, previous: number, betterIfHigher = true): { label: string; tone: TrendTone } {
  const result = percentChange(current, previous);
  if (result.tone === 'neutral') return { label: result.label, tone: 'neutral' };
  const isGood = betterIfHigher ? current > previous : current < previous;
  return {
    label: result.label,
    tone: isGood ? 'good' : 'bad',
  };
}

function getTrendColor(tone: TrendTone) {
  if (tone === 'good') return 'text-emerald-600';
  if (tone === 'bad') return 'text-rose-600';
  return 'text-gray-500';
}

type CardTone = 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'teal' | 'indigo';

function getCardStyles(tone: CardTone) {
  const styles: Record<CardTone, { cardBg: string; iconClassName: string }> = {
    slate: { cardBg: 'bg-slate-50 border-slate-200', iconClassName: 'bg-slate-600 text-white' },
    emerald: { cardBg: 'bg-emerald-50 border-emerald-200', iconClassName: 'bg-emerald-600 text-white' },
    amber: { cardBg: 'bg-amber-50 border-amber-200', iconClassName: 'bg-amber-600 text-white' },
    rose: { cardBg: 'bg-rose-50 border-rose-200', iconClassName: 'bg-rose-600 text-white' },
    sky: { cardBg: 'bg-sky-50 border-sky-200', iconClassName: 'bg-sky-600 text-white' },
    violet: { cardBg: 'bg-violet-50 border-violet-200', iconClassName: 'bg-violet-600 text-white' },
    teal: { cardBg: 'bg-teal-50 border-teal-200', iconClassName: 'bg-teal-600 text-white' },
    indigo: { cardBg: 'bg-indigo-50 border-indigo-200', iconClassName: 'bg-indigo-600 text-white' },
  };

  return styles[tone];
}

export default function MonthlyOverview() {
  const navigate = useNavigate();
  const { floors, residents, pastResidents, activities, joinRequests, rejectJoinRequest, markAsPaid, setActiveBuildingFilter, setActivePaymentsFilter, hostelProfile, dashboardStats, isDemoMode } = useApp();
  const [liveNow, setLiveNow] = React.useState(() => new Date());
  const currentMonthKeyIST = getMonthKey(liveNow);
  const [snapshots, setSnapshots] = React.useState<MonthlyOverviewSnapshot[]>([]);
  const [dailySnapshots, setDailySnapshots] = React.useState<DailyOverviewSnapshot[]>([]);
  const [selectedMonth, setSelectedMonth] = React.useState(currentMonthKeyIST);
  const [trendMonth, setTrendMonth] = React.useState(currentMonthKeyIST);
  const [trendYear, setTrendYear] = React.useState(Number(currentMonthKeyIST.slice(0, 4)));
  const [trendPeriod, setTrendPeriod] = React.useState<'daily' | 'monthly' | 'yearly'>('daily');
  const currentDateIST = getTodayIST(liveNow);

  React.useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!hostelProfile?.id || isDemoMode) return;
    let active = true;
    void getMonthlyOverviewSnapshots(hostelProfile.id)
      .then(rows => { if (active) setSnapshots(rows); })
      .catch(error => console.error('Could not load monthly overview snapshots:', error));
    return () => { active = false; };
  }, [hostelProfile?.id, isDemoMode]);

  React.useEffect(() => setSelectedMonth(currentMonthKeyIST), [currentMonthKeyIST]);
  React.useEffect(() => setTrendMonth(currentMonthKeyIST), [currentMonthKeyIST]);
  React.useEffect(() => setTrendYear(Number(currentMonthKeyIST.slice(0, 4))), [currentMonthKeyIST]);

  React.useEffect(() => {
    if (!hostelProfile?.id || isDemoMode) return;
    let active = true;
    void getDailyOverviewSnapshots(hostelProfile.id, trendMonth)
      .then(rows => { if (active) setDailySnapshots(rows); })
      .catch(error => console.error('Could not load daily overview snapshots:', error));
    return () => { active = false; };
  }, [hostelProfile?.id, isDemoMode, trendMonth]);

  // Metrics Logic
  let occupiedBeds = 0;
  let reservedBeds = 0;
  let configuredBedsCount = 0;

  floors.forEach(f => {
    f.rooms.forEach(r => {
      configuredBedsCount += r.beds.length;
      r.beds.forEach(b => {
        if (b.status === 'occupied' || b.status === 'payment_due') occupiedBeds++;
        else if (b.status === 'reserved') reservedBeds++;
      });
    });
  });

  const totalBeds = Math.max(hostelProfile?.total_beds || 0, configuredBedsCount);
  const vacantBeds = configuredBedsCount - occupiedBeds - reservedBeds;
  const activeResidents = React.useMemo(() => residents.filter(r => !isResidentReserved(r, floors)), [residents, floors]);

  const monthParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(liveNow);
  const monthValues = Object.fromEntries(monthParts.map(part => [part.type, part.value]));
  const currentYear = Number(monthValues.year);
  const currentMonthIndex = Number(monthValues.month) - 1;
  const currentMonthStart = new Date(Date.UTC(currentYear, currentMonthIndex, 1));
  const previousMonthStart = new Date(Date.UTC(currentYear, currentMonthIndex - 1, 1));
  // UTC instant corresponding to 23:59:59.999 IST on the previous month end.
  const previousMonthEnd = new Date(Date.UTC(currentYear, currentMonthIndex, 0, 18, 29, 59, 999));

  const monthlyStats = React.useMemo(() => {
    const currentMonthKey = getMonthKey(currentMonthStart);
    const previousMonthKey = getMonthKey(previousMonthStart);

    const getMonthKeyForDate = (value?: string) => {
      const date = parseDate(value);
      return date ? getMonthKey(date) : null;
    };

    const totalCollectedByMonth = (monthKey: string) => {
      return activeResidents.reduce((total, resident) => {
        return total + (resident.paymentHistory || []).reduce((sum, payment) => {
          if (isSecurityDepositPayment(payment)) return sum;
          if (isSuccessfulPayment(payment.status)) {
            const dateKey = getMonthKeyForDate(payment.date);
            if (dateKey === monthKey) {
              return sum + payment.amount;
            }
          }
          return sum;
        }, 0);
      }, 0);
    };

    const collectCurrent = Number(dashboardStats?.collected_this_month ?? totalCollectedByMonth(currentMonthKey));
    const collectPrevious = totalCollectedByMonth(previousMonthKey);

    // FIX: Outstanding dues = ALL unpaid balances (rent only), regardless of month
    // This includes carry-forward dues, old late balances, partial balances, etc.
    // Source of truth: dueAmount > 0, NOT payment status (deposit status is separate)
    const outstandingTotal = activeResidents.reduce((sum, resident) => {
      if (!resident.dueAmount || resident.dueAmount <= 0) return sum;
      return sum + resident.dueAmount;
    }, 0);

    // For trend comparison, calculate previous month's total outstanding at that time
    // (approximation: count residents who had dues in previous month by checking dueDate)
    const outstandingPreviousApprox = activeResidents.reduce((sum, resident) => {
      if (!resident.dueAmount || resident.dueAmount <= 0) return sum;
      const dateKey = getMonthKeyForDate(resident.dueDate);
      if (dateKey === previousMonthKey) {
        return sum + resident.dueAmount;
      }
      return sum;
    }, 0);

    // FIX: Late payments = count of ALL overdue cycles, regardless of month
    const lateCurrent = activeResidents.reduce((count, resident) => {
      return resident.paymentStatus === 'late' ? count + 1 : count;
    }, 0);

    // For trend comparison, use previous month's data as approximation
    const latePreviousApprox = activeResidents.reduce((count, resident) => {
      if (resident.paymentStatus !== 'late') return count;
      const dateKey = getMonthKeyForDate(resident.dueDate);
      if (dateKey === previousMonthKey) return count + 1;
      return count;
    }, 0);

    const activeAtMonthEnd = (endDate: Date) => {
      const activeCurrent = activeResidents.filter(resident => {
        const joinDate = parseDate(resident.joinDate);
        return joinDate && joinDate <= endDate;
      }).length;

      const activePast = pastResidents.filter(past => {
        const joinDate = parseDate(past.joinDate);
        const vacateDate = parseDate(past.vacateDate);
        return joinDate && vacateDate && joinDate <= endDate && vacateDate > endDate;
      }).length;

      return activeCurrent + activePast;
    };

    const occupancyPrevious = totalBeds === 0 ? 0 : (activeAtMonthEnd(previousMonthEnd) / totalBeds) * 100;
    const occupancyCurrent = Number(dashboardStats?.occupancy_rate ?? (totalBeds === 0 ? 0 : (occupiedBeds / totalBeds) * 100));

    // NEW: Collection Efficiency for current month
    // Formula: (collected_amount / expected_amount) * 100
    // where expected_amount = sum of all current active billing cycles
    // and collected_amount = sum of payments received
    const collectionEfficiency = (() => {
      const currentMonthCollected = collectCurrent;
      
      const currentMonthExpected = activeResidents.reduce((sum, resident) => sum + (resident.monthlyRent || 0), 0);
      if (currentMonthExpected <= 0) return 0;
      const efficiency = Math.round((currentMonthCollected / currentMonthExpected) * 100);
      return Math.min(efficiency, 100); // Cap at 100%
    })();

    return {
      collectCurrent,
      collectPrevious,
      outstandingCurrent: outstandingTotal,
      outstandingPrevious: outstandingPreviousApprox,
      occupancyCurrent,
      occupancyPrevious,
      lateCurrent,
      latePrevious: latePreviousApprox,
      collectionEfficiency,
    };
  }, [activeResidents, pastResidents, totalBeds, occupiedBeds, currentMonthStart, previousMonthStart, previousMonthEnd, dashboardStats]);

  const occupiedBedsCount = Number(dashboardStats?.occupied_beds ?? occupiedBeds);
  const vacantBedsCount = Number(dashboardStats?.vacant_beds ?? vacantBeds);

  const revenueTrend = getTrendText(monthlyStats.collectCurrent, monthlyStats.collectPrevious, true);
  const duesTrend = getTrendText(monthlyStats.outstandingCurrent, monthlyStats.outstandingPrevious, false);
  const occupancyTrend = getTrendText(monthlyStats.occupancyCurrent, monthlyStats.occupancyPrevious, true);
  const lateTrend = getTrendText(monthlyStats.lateCurrent, monthlyStats.latePrevious, false);

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
  const totalExpectedDeposit = occupiedBedsCount * defaultSecurityDeposit;

  const depositsCollectedThisMonth = activeResidents.reduce((sum, r) => {
    if (!r.isDepositPaid) return sum;
    const paymentDate = parseDate(r.depositPaidDate || r.joinDate);
    if (!paymentDate) return sum;
    if (getMonthKey(paymentDate) === currentMonthKeyIST) {
      return sum + ((r.securityDeposit || 0));
    }
    return sum;
  }, 0);
  const depositPendingCount = activeResidents.filter(resident => {
    const expectedDeposit = resident.securityDeposit ?? defaultSecurityDeposit;
    return expectedDeposit > 0 && !resident.isDepositPaid;
  }).length;

  const currentMonthMetrics = React.useMemo(() => ({
    collected: monthlyStats.collectCurrent,
    outstanding: monthlyStats.outstandingCurrent,
    occupancy: monthlyStats.occupancyCurrent,
    late: monthlyStats.lateCurrent,
    activeBeds: occupiedBedsCount,
    vacantBeds: vacantBedsCount,
    newResidents: activeResidents.filter(r => { const date = parseDate(r.joinDate); return date && getMonthKey(date) === currentMonthKeyIST; }).length,
    vacatedResidents: pastResidents.filter(r => { const date = parseDate(r.vacateDate); return date && getMonthKey(date) === currentMonthKeyIST; }).length,
    becomingVacant: activeResidents.filter(r => { const date = parseDate(r.vacatingDate); return date && getMonthKey(date) === currentMonthKeyIST; }).length,
    collectionEfficiency: monthlyStats.collectionEfficiency,
    expectedDeposit: totalExpectedDeposit,
    depositsCollected: depositsCollectedThisMonth,
    depositsPending: depositPendingCount,
  }), [monthlyStats, occupiedBedsCount, vacantBedsCount, activeResidents, pastResidents, currentMonthKeyIST, totalExpectedDeposit, depositsCollectedThisMonth, depositPendingCount]);

  React.useEffect(() => {
    const hostelId = hostelProfile?.id;
    if (!hostelId || isDemoMode || !currentMonthKeyIST) return;
    let active = true;
    void saveMonthlyOverviewSnapshot(hostelId, `${currentMonthKeyIST}-01`, currentMonthMetrics)
      .then(saved => {
        if (active) setSnapshots(current => [saved, ...current.filter(row => row.month_start !== saved.month_start)]
          .sort((a, b) => b.month_start.localeCompare(a.month_start)));
      })
      .catch(error => console.error('Could not save monthly overview snapshot:', error));
    return () => { active = false; };
  }, [hostelProfile?.id, isDemoMode, currentMonthKeyIST, currentMonthMetrics]);

  React.useEffect(() => {
    const hostelId = hostelProfile?.id;
    if (!hostelId || isDemoMode || !currentDateIST || trendMonth !== currentMonthKeyIST) return;
    let active = true;
    void saveDailyOverviewSnapshot(hostelId, currentDateIST, currentMonthMetrics)
      .then(saved => {
        if (active && trendMonth === currentMonthKeyIST) {
          setDailySnapshots(current => [...current.filter(row => row.snapshot_date !== saved.snapshot_date), saved]
            .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)));
        }
      })
      .catch(error => console.error('Could not save daily overview snapshot:', error));
    return () => { active = false; };
  }, [hostelProfile?.id, isDemoMode, currentDateIST, currentMonthKeyIST, currentMonthMetrics, trendMonth]);

  const selectedSnapshot = selectedMonth === currentMonthKeyIST
    ? null
    : snapshots.find(snapshot => snapshot.month_start.slice(0, 7) === selectedMonth);
  const shownMetrics = selectedSnapshot?.metrics || currentMonthMetrics;
  const chartData = React.useMemo(() => {
    const monthlyByMonth = new Map(snapshots.map(snapshot => [snapshot.month_start.slice(0, 7), snapshot.metrics]));
    if (trendYear === Number(currentMonthKeyIST.slice(0, 4))) monthlyByMonth.set(currentMonthKeyIST, currentMonthMetrics);

    if (trendPeriod === 'daily') {
      const byDate = new Map(dailySnapshots.map(snapshot => [snapshot.snapshot_date, snapshot.metrics]));
      if (trendMonth === currentMonthKeyIST) byDate.set(currentDateIST, currentMonthMetrics);
      return [...byDate.entries()]
        .filter(([date]) => date.slice(0, 7) === trendMonth && (trendMonth !== currentMonthKeyIST || date <= currentDateIST))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, metrics]) => ({
          period: date,
          label: String(Number(date.slice(8, 10))),
          ...metrics,
        }));
    }

    if (trendPeriod === 'monthly') {
      return [...monthlyByMonth.entries()]
        .filter(([month]) => Number(month.slice(0, 4)) === trendYear)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, metrics]) => ({
          period: month,
          label: new Date(`${month}-15T12:00:00`).toLocaleDateString('en-IN', { month: 'short' }),
          ...metrics,
        }));
    }

    const additive = ['collected', 'newResidents', 'vacatedResidents', 'becomingVacant', 'depositsCollected'];
    const stateAtYearEnd = ['outstanding', 'occupancy', 'late', 'activeBeds', 'vacantBeds', 'collectionEfficiency', 'expectedDeposit', 'depositsPending'];
    const byYear = new Map<number, Record<string, number>>();
    [...monthlyByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([month, metrics]) => {
      const year = Number(month.slice(0, 4));
      if (year > trendYear) return;
      const totals = byYear.get(year) || Object.fromEntries(additive.map(key => [key, 0]));
      additive.forEach(key => { totals[key] = (totals[key] || 0) + Number(metrics[key] || 0); });
      stateAtYearEnd.forEach(key => { totals[key] = Number(metrics[key] || 0); });
      byYear.set(year, totals);
    });
    return [...byYear.entries()].slice(-8).map(([year, metrics]) => ({ period: String(year), label: String(year), ...metrics }));
  }, [snapshots, dailySnapshots, trendPeriod, trendMonth, trendYear, currentMonthKeyIST, currentDateIST, currentMonthMetrics]);

  const trendYears = [...new Set([Number(currentMonthKeyIST.slice(0, 4)), ...snapshots.map(snapshot => Number(snapshot.month_start.slice(0, 4)))])]
    .sort((a, b) => b - a);
  const trendMonths = [...new Set([currentMonthKeyIST, ...snapshots.map(snapshot => snapshot.month_start.slice(0, 7))])]
    .sort((a, b) => b.localeCompare(a));

  const tabItems = [
    { id: 'all', label: 'All' },
    { id: 'payments', label: 'Payments' },
    { id: 'occupancy', label: 'Occupancy' },
    { id: 'analysis', label: 'Analysis' },
    ...(collectsSecurityDeposit ? [{ id: 'deposits' as const, label: 'Deposits' }] : []),
  ] as const;

  type TabId = (typeof tabItems)[number]['id'];

  const [activeTab, setActiveTab] = React.useState<TabId>('all');
  React.useEffect(() => {
    if (!collectsSecurityDeposit && activeTab === 'deposits') setActiveTab('all');
  }, [activeTab, collectsSecurityDeposit]);

  const trendCharts: Array<{ title: string; series: TrendSeries[] }> = activeTab === 'payments'
    ? [
      { title: 'Collections and outstanding dues', series: [
        { key: 'collected', label: 'Collected', color: '#059669', format: 'money' },
        { key: 'outstanding', label: 'Outstanding', color: '#d97706', format: 'money' },
      ] },
      { title: 'Collection efficiency', series: [{ key: 'collectionEfficiency', label: 'Efficiency', color: '#4f46e5', format: 'percent' }] },
      { title: 'Late payments', series: [{ key: 'late', label: 'Late payments', color: '#e11d48' }] },
    ]
    : activeTab === 'occupancy'
      ? [
        { title: 'Occupancy rate', series: [{ key: 'occupancy', label: 'Occupied', color: '#0284c7', format: 'percent' }] },
        { title: 'Bed availability', series: [
          { key: 'activeBeds', label: 'Occupied beds', color: '#059669' },
          { key: 'vacantBeds', label: 'Empty beds', color: '#64748b' },
        ] },
      ]
      : activeTab === 'deposits'
        ? [{ title: 'Deposit collection', series: [
          { key: 'expectedDeposit', label: 'Expected', color: '#0f766e', format: 'money' },
          { key: 'depositsCollected', label: 'Collected this month', color: '#059669', format: 'money' },
        ] }]
        : activeTab === 'all' || activeTab === 'analysis'
          ? [
            { title: 'Collections and outstanding dues', series: [
              { key: 'collected', label: 'Collected', color: '#059669', format: 'money' },
              { key: 'outstanding', label: 'Outstanding', color: '#d97706', format: 'money' },
            ] },
            { title: 'Occupancy rate', series: [{ key: 'occupancy', label: 'Occupied', color: '#0284c7', format: 'percent' }] },
            { title: 'Resident movement', series: [
              { key: 'newResidents', label: 'New residents', color: '#4f46e5' },
              { key: 'vacatedResidents', label: 'Vacated residents', color: '#8b5cf6' },
            ] },
            ...(collectsSecurityDeposit ? [{ title: 'Deposit collection', series: [
              { key: 'expectedDeposit', label: 'Expected', color: '#0f766e', format: 'money' as const },
              { key: 'depositsCollected', label: 'Collected this month', color: '#059669', format: 'money' as const },
            ] }] : []),
          ]
          : [];

  type OverviewCard = {
    title: string;
    value: string;
    icon: typeof IndianRupee;
    trend: string;
    trendColor: string;
    onClick?: () => void;
    categories: TabId[];
    tone: CardTone;
  };

  const monthlyOverviewCards = ([
    {
      title: 'Total Collected This Month',
      value: `₹${Number(shownMetrics.collected || 0).toLocaleString('en-IN')}`,
      icon: IndianRupee,
      trend: revenueTrend.label,
      trendColor: getTrendColor(revenueTrend.tone),
      onClick: () => handleNavigatePayments('Paid'),
      categories: ['all', 'payments'],
      tone: 'emerald',
    },
    {
      title: 'Outstanding Dues',
      value: `₹${Number(shownMetrics.outstanding || 0).toLocaleString('en-IN')}`,
      icon: AlertCircle,
      trend: duesTrend.label,
      trendColor: getTrendColor(duesTrend.tone),
      onClick: () => handleNavigatePayments('Unpaid'),
      categories: ['all', 'payments'],
      tone: 'amber',
    },
    {
      title: 'Occupancy Rate',
      value: `${Math.round(Number(shownMetrics.occupancy || 0))}%`,
      icon: BedDouble,
      trend: occupancyTrend.label,
      trendColor: getTrendColor(occupancyTrend.tone),
      onClick: () => handleNavigateBuilding('occupied'),
      categories: ['all', 'occupancy'],
      tone: 'sky',
    },
    {
      title: 'Late Payments',
      value: `${Number(shownMetrics.late || 0)}`,
      icon: Clock,
      trend: lateTrend.label,
      trendColor: getTrendColor(lateTrend.tone),
      onClick: () => handleNavigatePayments('Late'),
      categories: ['all', 'payments'],
      tone: 'rose',
    },
    {
      title: 'Active Residents',
      value: `${Number(shownMetrics.activeBeds || 0)}`,
      icon: Users,
      trend: 'Live occupied beds',
      trendColor: 'text-emerald-600',
      categories: ['all', 'occupancy'],
      tone: 'emerald',
    },
    {
      title: 'Empty Beds',
      value: `${Number(shownMetrics.vacantBeds || 0)}`,
      icon: PieChart,
      trend: 'Available beds right now',
      trendColor: 'text-slate-500',
      onClick: () => handleNavigateBuilding('vacant'),
      categories: ['all', 'occupancy'],
      tone: 'slate',
    },
    {
      title: 'New Residents This Month',
      value: `${Number(shownMetrics.newResidents || 0)}`,
      icon: UserPlus,
      trend: 'Started this month',
      trendColor: 'text-sky-600',
      categories: ['all'],
      tone: 'sky',
    },
    {
      title: 'Vacated Residents This Month',
      value: `${Number(shownMetrics.vacatedResidents || 0)}`,
      icon: LogOut,
      trend: 'Left this month',
      trendColor: 'text-violet-600',
      categories: ['all'],
      tone: 'violet',
    },
    {
      title: 'Beds Becoming Vacant',
      value: `${Number(shownMetrics.becomingVacant || 0)}`,
      icon: BedDouble,
      trend: 'Planning for vacancies this month',
      trendColor: 'text-indigo-600',
      categories: ['all', 'occupancy'],
      tone: 'indigo',
    },
    {
      title: 'Collection Efficiency',
      value: `${Number(shownMetrics.collectionEfficiency || 0)}%`,
      icon: PieChart,
      trend: 'Rent collected vs expected',
      trendColor: Number(shownMetrics.collectionEfficiency || 0) >= 80 ? 'text-emerald-600' :
                  Number(shownMetrics.collectionEfficiency || 0) >= 50 ? 'text-amber-600' : 'text-rose-600',
      categories: ['all', 'payments'],
      tone: Number(shownMetrics.collectionEfficiency || 0) >= 80 ? 'emerald' : Number(shownMetrics.collectionEfficiency || 0) >= 50 ? 'amber' : 'rose',
    },
    {
      title: 'Total Expected Deposit',
      value: `₹${Number(shownMetrics.expectedDeposit || 0).toLocaleString('en-IN')}`,
      icon: Shield,
      trend: 'Expected from all active residents',
      trendColor: 'text-teal-600',
      categories: ['all', 'deposits'],
      tone: 'teal',
    },
    {
      title: 'Deposits Collected This Month',
      value: `₹${Number(shownMetrics.depositsCollected || 0).toLocaleString('en-IN')}`,
      icon: Shield,
      trend: 'From new residents this month',
      trendColor: 'text-emerald-600',
      categories: ['all', 'deposits'],
      tone: 'emerald',
    },
    {
      title: 'Deposits Pending',
      value: `${Number(shownMetrics.depositsPending || 0)}`,
      icon: Shield,
      trend: 'Live unpaid deposits',
      trendColor: 'text-amber-600',
      categories: ['all', 'deposits'],
      tone: 'amber',
    },
  ] as OverviewCard[]).filter(card => collectsSecurityDeposit || !card.title.toLowerCase().includes('deposit'));

  const filteredCards = React.useMemo(() => {
    if (activeTab === 'all') return monthlyOverviewCards;
    return monthlyOverviewCards.filter(card => card.categories.includes(activeTab));
  }, [activeTab, monthlyOverviewCards]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 md:space-y-6 p-3 sm:p-4 md:p-8 overflow-x-hidden">
      <div className="mb-5 md:mb-8 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight leading-tight">Monthly Overview</h1>
            <p className="text-sm sm:text-base text-gray-500">
              {selectedSnapshot ? `Saved snapshot · ${new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` : 'Live operational metrics for your hostel, updating every minute.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="overflow-x-auto pb-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 shadow-sm">
            {tabItems.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
            Overview month
            <select value={selectedMonth} onChange={event => {
              const month = event.target.value;
              setSelectedMonth(month);
              setTrendYear(Number(month.slice(0, 4)));
              if (trendPeriod === 'daily') setTrendMonth(month);
            }} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
              {[...new Set([currentMonthKeyIST, ...snapshots.map(snapshot => snapshot.month_start.slice(0, 7))])]
                .sort((a, b) => b.localeCompare(a))
                .map(month => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}{month === currentMonthKeyIST ? ' · Live' : ''}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        {filteredCards.map((card) => (
          (() => {
            const styles = getCardStyles(card.tone);
            return (
          <KpiCard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            trend={selectedSnapshot ? 'Saved monthly snapshot' : card.trend}
            trendColor={card.trendColor}
            className={styles.iconClassName}
            cardBg={styles.cardBg}
            onClick={card.onClick}
          />
            );
          })()
        ))}
      </div>

      <section className="space-y-3" aria-label="Metric trends">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{activeTab === 'analysis' ? 'Analysis' : 'Metric trends'}</h2>
            <p className="text-xs text-gray-500">
              {trendPeriod === 'daily' ? 'Live daily snapshots, from the first through selected month.' : trendPeriod === 'monthly' ? 'Compare saved monthly snapshots for selected year.' : 'Compare yearly totals and year-end values.'} Hover over a line for exact values.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1" aria-label="Chart interval">
              {(['daily', 'monthly', 'yearly'] as const).map(period => <button key={period} type="button" onClick={() => {
                setTrendPeriod(period);
                if (period !== 'daily') setTrendYear(Number(selectedMonth.slice(0, 4)));
              }} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold capitalize', trendPeriod === period ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100')}>{period}</button>)}
            </div>
            {trendPeriod === 'daily' ? (
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                Month
                <select value={trendMonth} onChange={event => {
                  const month = event.target.value;
                  setTrendMonth(month);
                  setSelectedMonth(month);
                }} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                  {trendMonths.map(month => <option key={month} value={month}>{new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}{month === currentMonthKeyIST ? ' · Live' : ''}</option>)}
                </select>
              </label>
            ) : (
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                {trendPeriod === 'yearly' ? 'Show through' : 'Year'}
                <select value={trendYear} onChange={event => setTrendYear(Number(event.target.value))} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                  {trendYears.map(year => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {trendCharts.map(chart => <TrendChart
            key={chart.title}
            title={chart.title}
            subtitle={trendPeriod === 'daily'
              ? `Daily values · ${new Date(`${trendMonth}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
              : trendPeriod === 'monthly' ? `Monthly values · ${trendYear}` : `Yearly values · through ${trendYear}`}
            data={chartData}
            series={chart.series}
            emptyText={trendPeriod === 'daily' ? 'No daily history for this month yet. Daily snapshots start when this overview is used.' : 'There is not enough saved history for this comparison yet.'}
          />)}
        </div>
      </section>
    </div>
  );
}
