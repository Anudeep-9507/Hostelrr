import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from '../routes/routes';
import { BedDouble, Users, AlertCircle, IndianRupee, PieChart, CheckCircle, Clock, LogOut, UserPlus, Shield, ChevronLeft } from 'lucide-react';
import { cn, formatDate, getNamesFromIds } from '../lib/utils';

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
  return `${date.getFullYear()}-${date.getMonth()}`;
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
  const { floors, residents, pastResidents, activities, joinRequests, rejectJoinRequest, markAsPaid, setActiveBuildingFilter, setActivePaymentsFilter, hostelProfile } = useApp();
  const [liveNow, setLiveNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
  const activeResidents = residents.filter(r => r.status !== 'reserved');

  const now = liveNow;
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

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

    const collectCurrent = totalCollectedByMonth(currentMonthKey);
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
    const occupancyCurrent = totalBeds === 0 ? 0 : (occupiedBeds / totalBeds) * 100;

    // NEW: Collection Efficiency for current month
    // Formula: (collected_amount / expected_amount) * 100
    // where expected_amount = sum of all current active billing cycles
    // and collected_amount = sum of payments received
    const collectionEfficiency = (() => {
      const currentMonthCollected = collectCurrent;
      
      // Expected: total amount from all active cycles for current residents
      // Use paymentHistory as proxy for active cycles in current month
      let currentMonthExpected = 0;
      activeResidents.forEach(resident => {
        if (!resident.dueAmount || !['due', 'late', 'partially_paid', 'paid'].includes(resident.paymentStatus)) {
          // Calculate expected from monthly rent
          currentMonthExpected += resident.monthlyRent || 0;
        } else {
          // If has due/late/partial, it means there's an active cycle
          // We count the due amount + collected amount = expected amount
          const residualDue = resident.dueAmount || 0;
          const collected = (resident.paymentHistory || [])
            .filter(p => {
              const dateKey = getMonthKeyForDate(p.date);
              return dateKey === currentMonthKey && isSuccessfulPayment(p.status);
            })
            .reduce((sum, p) => sum + p.amount, 0);
          currentMonthExpected += Math.max(residualDue + collected, resident.monthlyRent || 0);
        }
      });

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
  }, [activeResidents, pastResidents, totalBeds, occupiedBeds, currentMonthStart, previousMonthStart, previousMonthEnd]);

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
  const totalExpectedDeposit = activeResidents.reduce((sum, resident) => {
    const expectedDeposit = resident.securityDeposit ?? defaultSecurityDeposit;
    return sum + (expectedDeposit || 0);
  }, 0);

  const depositsCollectedThisMonth = activeResidents.reduce((sum, r) => {
    if (!r.isDepositPaid) return sum;
    const paymentDate = parseDate(r.depositPaidDate || r.joinDate);
    if (!paymentDate) return sum;
    if (paymentDate.getFullYear() === now.getFullYear() && paymentDate.getMonth() === now.getMonth()) {
      return sum + ((r.securityDeposit || 0));
    }
    return sum;
  }, 0);

  // Placeholder for deposits refunded - no refund tracking in current schema
  const depositPendingCount = activeResidents.filter(resident => {
    const expectedDeposit = resident.securityDeposit ?? defaultSecurityDeposit;
    return expectedDeposit > 0 && !resident.isDepositPaid;
  }).length;

  const tabItems = [
    { id: 'all', label: 'All' },
    { id: 'payments', label: 'Payments' },
    { id: 'occupancy', label: 'Occupancy' },
    { id: 'deposits', label: 'Deposits' },
  ] as const;

  type TabId = (typeof tabItems)[number]['id'];

  const [activeTab, setActiveTab] = React.useState<TabId>('all');

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

  const monthlyOverviewCards: OverviewCard[] = [
    {
      title: 'Total Collected This Month',
      value: `₹${monthlyStats.collectCurrent.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      trend: revenueTrend.label,
      trendColor: getTrendColor(revenueTrend.tone),
      onClick: () => handleNavigatePayments('Paid'),
      categories: ['all', 'payments'],
      tone: 'emerald',
    },
    {
      title: 'Outstanding Dues',
      value: `₹${monthlyStats.outstandingCurrent.toLocaleString('en-IN')}`,
      icon: AlertCircle,
      trend: duesTrend.label,
      trendColor: getTrendColor(duesTrend.tone),
      onClick: () => handleNavigatePayments('Unpaid'),
      categories: ['all', 'payments'],
      tone: 'amber',
    },
    {
      title: 'Occupancy Rate',
      value: `${Math.round(monthlyStats.occupancyCurrent)}%`,
      icon: BedDouble,
      trend: occupancyTrend.label,
      trendColor: getTrendColor(occupancyTrend.tone),
      onClick: () => handleNavigateBuilding('occupied'),
      categories: ['all', 'occupancy'],
      tone: 'sky',
    },
    {
      title: 'Late Payments',
      value: `${monthlyStats.lateCurrent}`,
      icon: Clock,
      trend: lateTrend.label,
      trendColor: getTrendColor(lateTrend.tone),
      onClick: () => handleNavigatePayments('Late'),
      categories: ['all', 'payments'],
      tone: 'rose',
    },
    {
      title: 'Active Residents',
      value: `${occupiedBeds}`,
      icon: Users,
      trend: 'Live occupied beds',
      trendColor: 'text-emerald-600',
      categories: ['all', 'occupancy'],
      tone: 'emerald',
    },
    {
      title: 'Empty Beds',
      value: `${vacantBeds}`,
      icon: PieChart,
      trend: 'Available beds right now',
      trendColor: 'text-slate-500',
      onClick: () => handleNavigateBuilding('vacant'),
      categories: ['all', 'occupancy'],
      tone: 'slate',
    },
    {
      title: 'New Residents This Month',
        value: `${activeResidents.filter(r => {
        const joinDate = parseDate(r.joinDate);
        return joinDate && joinDate.getFullYear() === now.getFullYear() && joinDate.getMonth() === now.getMonth();
      }).length}`,
      icon: UserPlus,
      trend: 'Started this month',
      trendColor: 'text-sky-600',
      categories: ['all'],
      tone: 'sky',
    },
    {
      title: 'Vacated Residents This Month',
      value: `${pastResidents.filter(p => {
        const vacateDate = parseDate(p.vacateDate);
        return vacateDate && vacateDate.getFullYear() === now.getFullYear() && vacateDate.getMonth() === now.getMonth();
      }).length}`,
      icon: LogOut,
      trend: 'Left this month',
      trendColor: 'text-violet-600',
      categories: ['all'],
      tone: 'violet',
    },
    {
      title: 'Beds Becoming Vacant',
        value: `${activeResidents.filter(r => {
        const vacateDate = parseDate(r.vacatingDate);
        return vacateDate && vacateDate.getFullYear() === now.getFullYear() && vacateDate.getMonth() === now.getMonth();
      }).length}`,
      icon: BedDouble,
      trend: 'Planning for vacancies this month',
      trendColor: 'text-indigo-600',
      categories: ['all', 'occupancy'],
      tone: 'indigo',
    },
    {
      title: 'Collection Efficiency',
      value: `${monthlyStats.collectionEfficiency}%`,
      icon: PieChart,
      trend: 'Rent collected vs expected',
      trendColor: monthlyStats.collectionEfficiency >= 80 ? 'text-emerald-600' : 
                  monthlyStats.collectionEfficiency >= 50 ? 'text-amber-600' : 'text-rose-600',
      categories: ['all', 'payments'],
      tone: monthlyStats.collectionEfficiency >= 80 ? 'emerald' : monthlyStats.collectionEfficiency >= 50 ? 'amber' : 'rose',
    },
    {
      title: 'Total Expected Deposit',
      value: `₹${totalExpectedDeposit.toLocaleString('en-IN')}`,
      icon: Shield,
      trend: 'Expected from all active residents',
      trendColor: 'text-teal-600',
      categories: ['all', 'deposits'],
      tone: 'teal',
    },
    {
      title: 'Deposits Collected This Month',
      value: `₹${depositsCollectedThisMonth.toLocaleString('en-IN')}`,
      icon: Shield,
      trend: 'From new residents this month',
      trendColor: 'text-emerald-600',
      categories: ['all', 'deposits'],
      tone: 'emerald',
    },
    {
      title: 'Deposits Pending',
      value: `${depositPendingCount}`,
      icon: Shield,
      trend: 'Live unpaid deposits',
      trendColor: 'text-amber-600',
      categories: ['all', 'deposits'],
      tone: 'amber',
    },
  ];

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
            <p className="text-sm sm:text-base text-gray-500">Live operational metrics for your hostel, updating every minute.</p>
          </div>
        </div>

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
            trend={card.trend}
            trendColor={card.trendColor}
            className={styles.iconClassName}
            cardBg={styles.cardBg}
            onClick={card.onClick}
          />
            );
          })()
        ))}
      </div>
    </div>
  );
}