import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes/routes';
import { FLAGS } from '../core/env';
import { useApp, PaymentsFilterType } from '../context/AppContext';
import DefaultAvatar from '../components/DefaultAvatar';
import { CheckCircle2, Wallet, Clock, AlertTriangle, Check, Send, X, Smartphone, Banknote, IndianRupee, AlertCircle, Info, PieChart, Users, ChevronRight, Search, Calendar, ArrowLeft, FileText } from 'lucide-react';
import { cn, formatDate, getNamesFromIds, getTodayIST, formatTimeIST, convertToIST, isSecurityDepositPayment, getResidentRentAmount } from '../lib/utils';
import { Resident } from '../data/mock';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import EmptyState from '../components/EmptyState';
import useAsyncAction from '../hooks/useAsyncAction';

export const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

export default function Payments() {
  const navigate = useNavigate();
  const location = useLocation();
  const { floors, residents, pastResidents, markAsPaid, markReminderSent, activePaymentsFilter: filter, setActivePaymentsFilter: setFilter, setGlobalSelectedResidentId, hostelProfile, isDemoMode, sharingRentMap } = useApp();
  const [showHistory, setShowHistory] = useState(false);
  const [historyTimeFilter, setHistoryTimeFilter] = useState<'All' | 'Today' | 'Monthly' | 'Yearly'>('All');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<'All' | 'Rent' | 'Security Deposits'>('All');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState(() => {
    const now = convertToIST(new Date());
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedHistoryYear, setSelectedHistoryYear] = useState(() => String(convertToIST(new Date()).getUTCFullYear()));

  const [isRevenueInfoModalOpen, setIsRevenueInfoModalOpen] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [residentToMarkPaid, setResidentToMarkPaid] = useState<Resident | null>(null);
  const [paidUsing, setPaidUsing] = useState<'UPI' | 'Cash'>('UPI');
  const [isPartialPayment, setIsPartialPayment] = useState<boolean>(false);
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(getTodayIST());
  const [bulkReminderFilter, setBulkReminderFilter] = useState<'All' | 'Pending' | 'Late' | 'Partial'>('All');

  React.useEffect(() => {
    setShowHistory((location.state as any)?.paymentsView === 'history');
  }, [location.state]);

  const { execute: executeMarkPaid, isLoading: isMarkingPaid } = useAsyncAction(async (id: string, method: 'UPI' | 'Cash', amount?: number, date?: string, name?: string, isPartial?: boolean) => {
    await markAsPaid(id, method, amount, date);
    toast.success(`${name} marked as ${isPartial && amount ? 'partially ' : ''}paid`);
    setResidentToMarkPaid(null);
    setPaidUsing('UPI'); // reset default
    setIsPartialPayment(false); // reset default
    setPartialAmount('');
  });

  const getDayAndMonth = (dateString: string) => {
    return formatDate(dateString);
  };

  const hasExplicitTimezone = (dateString: string) => /[zZ]|[+-]\d{2}:?\d{2}$/.test(dateString);

  const getTransactionDateForDisplay = (dateString: string) => {
    if (!dateString) return '';

    if (!hasExplicitTimezone(dateString)) {
      const simpleDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (simpleDateMatch) {
        return `${simpleDateMatch[3]}-${simpleDateMatch[2]}-${simpleDateMatch[1]}`;
      }
    }

    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;

    const dateIST = convertToIST(d);
    return `${String(dateIST.getUTCDate()).padStart(2, '0')}-${String(dateIST.getUTCMonth() + 1).padStart(2, '0')}-${dateIST.getUTCFullYear()}`;
  };

  const getTransactionDateForSort = (dateString: string) => {
    if (!dateString) return new Date(NaN);

    if (!hasExplicitTimezone(dateString)) {
      const simpleDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (simpleDateMatch) {
        return new Date(Date.UTC(Number(simpleDateMatch[1]), Number(simpleDateMatch[2]) - 1, Number(simpleDateMatch[3])));
      }
    }

    const d = new Date(dateString);
    return isNaN(d.getTime()) ? new Date(NaN) : convertToIST(d);
  };

  const getBedStatusForResident = (roomId?: string, bedId?: string) => {
    if (!roomId || !bedId) return 'unknown';

    for (const floor of floors) {
      const room = floor.rooms.find(r => r.id === roomId);
      if (!room) continue;

      const bed = room.beds.find(b => b.id === bedId);
      return bed?.status || 'unknown';
    }

    return 'unknown';
  };

  const isResidentVacated = (residentId: string) => {
    return pastResidents.some(pr => pr.id === residentId);
  };

  React.useEffect(() => {
    if (residentToMarkPaid) {
      setPaymentDate(getTodayIST());
    }
  }, [residentToMarkPaid]);

  const handleSendReminder = (resident: Resident) => {
    if (!resident.phone) {
      toast.error('Resident phone number not available');
      return;
    }
    
    // Validate phone number roughly (must contain digits)
    const phoneDigits = (resident.phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast.error('Invalid phone number');
      return;
    }

    const hostelName = hostelProfile?.hostelName || "My Hostel";
    const roomNum = getNamesFromIds(floors, resident.roomId, resident.bedId).roomName;
    const rentAmount = getResidentRentAmount(resident, floors);
    const dueDateDisplay = resident.dueDate ? getDayAndMonth(resident.dueDate) : 'Today';

    const message = `Hello ${resident.name}, your hostel rent of *₹${rentAmount}* for Room ${roomNum} is currently pending.\n\nDue Date: *${dueDateDisplay}*\n\nPlease make the payment soon and reply *PAID* once done.\n\nThank you,\n${hostelName}\nPowered by Hostelrr`;

    markReminderSent(resident.id);
    
    // Format phone to whatsapp URL format
    const waPhone = phoneDigits.startsWith('91') && phoneDigits.length === 12 ? phoneDigits : (phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits);
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    
    window.open(waUrl, '_blank');
    toast.success(`Opening WhatsApp for ${resident.name}`);
  };

  const startSendingBulkReminders = () => {
    setIsBulkModalOpen(false);
    
    const filteredToRemind = bulkReminderFilter === 'All' 
      ? dueResidents 
      : bulkReminderFilter === 'Pending' 
        ? dueResidents.filter(r => r.paymentStatus === 'due')
        : bulkReminderFilter === 'Late'
          ? dueResidents.filter(r => r.paymentStatus === 'late')
          : dueResidents.filter(r => r.paymentStatus === 'partially_paid');

    if (filteredToRemind.length === 0) {
      toast.error(`No residents found for ${bulkReminderFilter} category`);
      return;
    }

    toast.info(`Starting ${bulkReminderFilter} reminders (${filteredToRemind.length})...`, { duration: 3000 });
    
    filteredToRemind.forEach((res, index) => {
      // Small timeout to help browser open multiple tabs or at least not strictly block immediately
      setTimeout(() => {
        handleSendReminder(res);
      }, index * 800);
    });
  };

  const getMockHistory = (resident: Resident) => {
    const rentAmount = getResidentRentAmount(resident, floors);
    const history = resident.paymentHistory ? [...resident.paymentHistory] : [];
    
    if (resident.securityDeposit && resident.isDepositPaid) {
      history.push({
        id: 'sec_dep',
        date: resident.depositPaidDate || resident.joinDate,
        amount: resident.securityDeposit,
        status: 'paid',
        title: 'Security Deposit'
      });
    }

    const mock = isDemoMode ? [
      { id: 'm1', date: '05 Mar 2026', amount: rentAmount, status: 'paid' as string, method: undefined as string | undefined, title: 'Rent Payment' },
      { id: 'm2', date: '05 Feb 2026', amount: rentAmount, status: 'paid' as string, method: undefined as string | undefined, title: 'Rent Payment' },
      { id: 'm3', date: '05 Jan 2026', amount: rentAmount, status: 'paid' as string, method: undefined as string | undefined, title: 'Rent Payment' },
    ] : [];
    return [...history, ...mock].sort((a: any, b: any) => getTransactionDateForSort(b.date).getTime() - getTransactionDateForSort(a.date).getTime());
  };

  const activeResidents = residents.filter(r => r.status !== 'reserved');
  const dueResidents = activeResidents.filter(r => (r.dueAmount || 0) > 0);
  const paidResidents = activeResidents.filter(r => (r.dueAmount || 0) === 0);

  let occupiedBeds = 0;
  floors.forEach(floor => {
    floor.rooms.forEach(room => {
      room.beds.forEach(bed => {
        if (bed.status === 'occupied' || bed.status === 'payment_due') {
          occupiedBeds += 1;
        }
      });
    });
  });

  const totalDueAmount = dueResidents.reduce((acc, curr) => acc + curr.dueAmount, 0);

  // Expected monthly rent = sum of actual monthly_rent for all occupied residents
  const expectedMonthlyRevenue = activeResidents.reduce((total, r) => {
    return total + (r.monthlyRent || 0);
  }, 0);

  const defaultSecurityDeposit = Number(hostelProfile?.security_deposit || 0);
  const occupiedResidentsCount = occupiedBeds;
  const expectedTotalSecurityDeposit = occupiedResidentsCount * defaultSecurityDeposit;
  const finalExpectedRevenue = expectedMonthlyRevenue + expectedTotalSecurityDeposit;

  const now = new Date();
  const istNow = convertToIST(now);
  const thisMonthRevenue = activeResidents.reduce((total, r) => {
    const historyRevenue = (r.paymentHistory || []).reduce((sum, h) => {
      if (isSecurityDepositPayment(h)) return sum;
      if (h.status === 'paid' || h.status === 'partial') {
        const d = new Date(h.date);
        const dateIST = convertToIST(d);
        if (dateIST.getUTCFullYear() === istNow.getUTCFullYear() && dateIST.getUTCMonth() === istNow.getUTCMonth()) {
          return sum + h.amount;
        }
      }
      return sum;
    }, 0);

    return total + historyRevenue;
  }, 0);

  // Logic for subsets
  const pendingCount = dueResidents.filter(r => r.paymentStatus === 'due').length;
  const lateCount = dueResidents.filter(r => r.paymentStatus === 'late').length;
  const partiallyPaidCount = activeResidents.filter(r => r.paymentStatus === 'partially_paid').length;
  const unpaidCount = dueResidents.length;
  const paidCount = paidResidents.length;
  const allCount = activeResidents.length;

  const allPaymentsTransactions = useMemo(() => {
    const currentHistory = residents.flatMap(r => {
      const history = (r.paymentHistory || []).map(p => ({ ...p, residentName: r.name, residentId: r.id, roomId: r.roomId, bedId: r.bedId }));
      if (r.securityDeposit && r.isDepositPaid) {
        history.push({
          id: `sec_dep_${r.id}`,
          // keep raw ISO/timestamp for reliable parsing/sorting
          date: r.depositPaidDate || r.joinDate,
          amount: r.securityDeposit,
          status: 'paid',
          title: 'Security Deposit',
          residentName: r.name,
          residentId: r.id,
          roomId: r.roomId,
          bedId: r.bedId,
          method: 'UPI' // Default or unknown
        } as any);
      }
      return history;
    });
    
    const pastHistory = pastResidents.flatMap(r => {
      const history = (r.paymentHistory || []).map(p => ({ ...p, residentName: r.name, residentId: r.id, roomId: r.roomId, bedId: r.bedId }));
      // Past residents also had security deposits
      if ((r as any).securityDeposit && (r as any).isDepositPaid) {
        history.push({
          id: `sec_dep_${r.id}`,
          date: r.joinDate,
          amount: (r as any).securityDeposit,
          status: 'paid',
          title: 'Security Deposit',
          residentName: r.name,
          residentId: r.id,
          roomId: r.roomId,
          bedId: r.bedId,
          method: 'UPI'
        } as any);
      }
      return history;
    });
    
    return [...currentHistory, ...pastHistory].sort((a, b) => getTransactionDateForSort(b.date).getTime() - getTransactionDateForSort(a.date).getTime());
  }, [residents, pastResidents]);

  const historyMonthOptions = useMemo(() => {
    const months = new Map<string, Date>();

    allPaymentsTransactions.forEach((payment) => {
      const dateIST = getTransactionDateForSort(payment.date);
      if (Number.isNaN(dateIST.getTime())) return;
      const key = `${dateIST.getUTCFullYear()}-${String(dateIST.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!months.has(key)) {
        months.set(key, dateIST);
      }
    });

    return Array.from(months.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([value, date]) => ({
        value,
        label: new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(date),
      }));
  }, [allPaymentsTransactions]);

  const historyYearOptions = useMemo(() => {
    const years = new Set<string>();

    allPaymentsTransactions.forEach((payment) => {
      const dateIST = getTransactionDateForSort(payment.date);
      if (Number.isNaN(dateIST.getTime())) return;
      years.add(String(dateIST.getUTCFullYear()));
    });

    return Array.from(years)
      .sort((a, b) => Number(b) - Number(a))
      .map((value) => ({ value, label: value }));
  }, [allPaymentsTransactions]);

  const filteredHistoryTransactions = useMemo(() => {
    const today = getTodayIST();
    const normalizedQuery = historySearchQuery.trim().toLowerCase();

    let base = allPaymentsTransactions;

    if (historyPaymentFilter === 'Rent') {
      base = base.filter(payment => payment.title !== 'Security Deposit');
    } else if (historyPaymentFilter === 'Security Deposits') {
      base = base.filter(payment => payment.title === 'Security Deposit');
    }

    if (historyTimeFilter === 'Today') {
      base = base.filter(payment => {
        const dateIST = getTransactionDateForSort(payment.date);
        const dateStr = `${dateIST.getUTCFullYear()}-${String(dateIST.getUTCMonth() + 1).padStart(2, '0')}-${String(dateIST.getUTCDate()).padStart(2, '0')}`;
        return dateStr === today;
      });
    } else if (historyTimeFilter === 'Monthly') {
      base = base.filter(payment => {
        const dateIST = getTransactionDateForSort(payment.date);
        const key = `${dateIST.getUTCFullYear()}-${String(dateIST.getUTCMonth() + 1).padStart(2, '0')}`;
        return key === selectedHistoryMonth;
      });
    } else if (historyTimeFilter === 'Yearly') {
      base = base.filter(payment => {
        const dateIST = getTransactionDateForSort(payment.date);
        return String(dateIST.getUTCFullYear()) === selectedHistoryYear;
      });
    }

    if (normalizedQuery) {
      base = base.filter(payment => {
        const roomName = getNamesFromIds(floors, payment.roomId, payment.bedId).roomName;
        const searchHaystack = [payment.residentName, roomName, `room ${roomName}`, payment.roomId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchHaystack.includes(normalizedQuery);
      });
    }

    return base.sort((a, b) => getTransactionDateForSort(b.date).getTime() - getTransactionDateForSort(a.date).getTime());
  }, [allPaymentsTransactions, floors, historyPaymentFilter, historySearchQuery, historyTimeFilter, selectedHistoryMonth, selectedHistoryYear]);

  const totalHistoryAmount = filteredHistoryTransactions.reduce((acc, p) => acc + p.amount, 0);
  const isSecurityDepositHistory = historyPaymentFilter === 'Security Deposits';

  const historyTimeLabel = historyTimeFilter === 'All'
    ? 'All'
    : historyTimeFilter === 'Today'
      ? 'Today'
      : historyTimeFilter === 'Monthly'
        ? historyMonthOptions.find(option => option.value === selectedHistoryMonth)?.label || 'Month'
        : historyYearOptions.find(option => option.value === selectedHistoryYear)?.label || 'Year';
  
  // KPI counts
  const dueTodayCount = pendingCount;

  const getStatusPill = (resident: Resident) => {
    if (resident.paymentStatus === 'paid') {
      return <span className="bg-[#28A745] text-white px-3 py-1 text-xs font-bold rounded-full">Paid</span>;
    }
    if (resident.paymentStatus === 'partially_paid') {
      return <span className="bg-[#6f42c1] text-white px-3 py-1 text-xs font-bold rounded-full">Partially</span>;
    }
    if (resident.paymentStatus === 'late') {
      return <span className="bg-[#DC3545] text-white px-3 py-1 text-xs font-bold rounded-full">Late</span>;
    }
    return <span className="bg-[#F89C1E] text-white px-3 py-1 text-xs font-bold rounded-full text-gray-900">Pending</span>;
  };

  const filteredResidents = activeResidents.filter(r => {
    if (filter === 'All') return true;
    if (filter === 'Paid') return r.paymentStatus === 'paid';
    if (filter === 'Unpaid') return r.paymentStatus === 'due' || r.paymentStatus === 'late' || r.paymentStatus === 'partially_paid';
    if (filter === 'Pending') return r.paymentStatus === 'due';
    if (filter === 'Late') return r.paymentStatus === 'late';
    if (filter === 'Partially Paid') return r.paymentStatus === 'partially_paid';
    return true;
  });

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-5 md:space-y-8 overflow-x-hidden">
      <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Payments</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setShowHistory(prev => !prev)}
            className="hidden md:inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            {showHistory ? 'Back to Payments' : 'Payment History'}
          </button>
          {!showHistory && dueResidents.length > 0 && (
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="hidden md:inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#22c35e] text-white font-bold transition-colors shadow-sm"
            >
              <WhatsAppIcon className="w-4 h-4" />
              Remind All
            </button>
          )}
        </div>
      </div>

      {!showHistory && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <div onClick={() => setFilter('Unpaid')} className="bg-orange-50 rounded-2xl p-3.5 sm:p-4 md:p-5 border border-orange-200 shadow-sm flex flex-col justify-between min-h-[104px] sm:min-h-[120px] md:min-h-[140px] cursor-pointer hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
              <span className="text-gray-500 font-medium text-[11px] sm:text-sm">Pending Payments</span>
              <div className="p-2 rounded-lg bg-white text-orange-600 shadow-sm"><AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            </div>
            <h3 className="text-xl sm:text-2xl md:text-[28px] font-bold text-gray-900">₹{totalDueAmount.toLocaleString('en-IN')}</h3>
          </div>

          <div onClick={() => setFilter('Paid')} className="bg-green-50 rounded-2xl p-3.5 sm:p-4 md:p-5 border border-green-200 shadow-sm flex flex-col justify-between min-h-[104px] sm:min-h-[120px] md:min-h-[140px] cursor-pointer hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-gray-500 font-medium text-[11px] sm:text-sm">This Month's Rent</span>
                <div className="text-[10px] sm:text-xs text-green-600 font-medium mt-1 space-y-1">
                  <div className="flex items-center gap-1">
                    <span>Exp: ₹{expectedMonthlyRevenue.toLocaleString('en-IN')}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRevenueInfoModalOpen(true);
                      }}
                      className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-all shadow-sm active:scale-90"
                      aria-label="Open expected rent breakdown"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white text-green-600 shadow-sm"><IndianRupee className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            </div>
            <h3 className="text-xl sm:text-2xl md:text-[28px] font-bold text-gray-900">₹{thisMonthRevenue.toLocaleString('en-IN')}</h3>
          </div>

          <div onClick={() => setFilter('Pending')} className="bg-blue-50 rounded-2xl p-3.5 sm:p-4 md:p-5 border border-blue-200 shadow-sm flex flex-col justify-between min-h-[104px] sm:min-h-[120px] md:min-h-[140px] cursor-pointer hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
              <span className="text-gray-500 font-medium text-[11px] sm:text-sm">Due Today</span>
              <div className="p-2 rounded-lg bg-white text-blue-600 shadow-sm"><Clock className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            </div>
            <h3 className="text-xl sm:text-2xl md:text-[28px] font-bold text-gray-900">{dueTodayCount}</h3>
          </div>

          <div onClick={() => setFilter('Late')} className="bg-red-50 rounded-2xl p-3.5 sm:p-4 md:p-5 border border-red-200 shadow-sm flex flex-col justify-between min-h-[104px] sm:min-h-[120px] md:min-h-[140px] cursor-pointer hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
              <span className="text-gray-500 font-medium text-[11px] sm:text-sm">Late Payments</span>
              <div className="p-2 rounded-lg bg-white text-red-600 shadow-sm"><AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            </div>
            <h3 className="text-xl sm:text-2xl md:text-[28px] font-bold text-gray-900">{lateCount}</h3>
          </div>
        </div>
      )}

      {!showHistory && dueResidents.length > 0 && (
        <button
          onClick={() => setIsBulkModalOpen(true)}
          className="md:hidden w-full min-h-11 justify-center bg-[#25D366] hover:bg-[#22c35e] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <WhatsAppIcon className="w-4 h-4" />
          Remind All
        </button>
      )}


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

      <div className="flex flex-col gap-4">
        {!showHistory ? (
          <>
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              <div className="bg-gray-100/80 p-1.5 rounded-[14px] flex flex-nowrap gap-1.5 items-center w-full sm:w-max border border-gray-200/60 shadow-sm overflow-x-auto no-scrollbar">
                {(['All', 'Paid', 'Unpaid'] as PaymentsFilterType[]).map((mode) => {
                  const isUnpaidSelected = mode === 'Unpaid' && (filter === 'Unpaid' || filter === 'Pending' || filter === 'Late' || filter === 'Partially Paid');
                  return (
                    <button
                      key={mode}
                      onClick={() => setFilter(mode)}
                      className={cn(
                        "shrink-0 px-4 sm:px-5 py-2 rounded-xl text-sm sm:text-[15px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap",
                        (filter === mode || isUnpaidSelected) ? "bg-white text-blue-700 shadow-md ring-1 ring-black/5" : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                      )}
                    >
                      {mode}
                      <span className={cn("px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-black", (filter === mode || isUnpaidSelected) ? "bg-blue-600 text-white" : "bg-gray-200/80 text-gray-700")}>
                        {mode === 'All' ? allCount : mode === 'Paid' ? paidCount : unpaidCount}
                      </span>
                    </button>
                  );
                })}
              </div>

            {(filter === 'Unpaid' || filter === 'Pending' || filter === 'Late' || filter === 'Partially Paid') && (
              <div className="flex flex-nowrap gap-2 items-center bg-orange-50 p-1.5 rounded-[14px] border border-orange-100/60 shadow-sm w-full sm:w-max transition-all overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setFilter('Pending')}
                  className={cn(
                    "shrink-0 px-3 sm:px-4 py-1.5 rounded-xl text-[13px] sm:text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap",
                    filter === 'Pending' 
                      ? "bg-white text-orange-700 shadow-md ring-1 ring-black/5" 
                      : "text-orange-600 hover:bg-orange-100/50"
                  )}
                >
                  Pending
                  <span className={cn(
                    "px-2 py-0.5 rounded-lg text-[10px] font-black",
                    filter === 'Pending' ? "bg-orange-600 text-white" : "bg-orange-200 text-orange-700"
                  )}>
                    {pendingCount}
                  </span>
                </button>
                <button
                  onClick={() => setFilter('Late')}
                  className={cn(
                    "shrink-0 px-3 sm:px-4 py-1.5 rounded-xl text-[13px] sm:text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap",
                    filter === 'Late' 
                      ? "bg-white text-red-700 shadow-md ring-1 ring-black/5" 
                      : "text-red-600 hover:bg-red-50"
                  )}
                >
                  Late
                  <span className={cn(
                    "px-2 py-0.5 rounded-lg text-[10px] font-black",
                    filter === 'Late' ? "bg-red-600 text-white" : "bg-red-200 text-red-700"
                  )}>
                    {lateCount}
                  </span>
                </button>
                <button
                  onClick={() => setFilter('Partially Paid')}
                  className={cn(
                    "shrink-0 px-3 sm:px-4 py-1.5 rounded-xl text-[13px] sm:text-[14px] font-semibold transition-all flex items-center gap-2 whitespace-nowrap",
                    filter === 'Partially Paid' 
                      ? "bg-white text-purple-700 shadow-md ring-1 ring-black/5" 
                      : "text-purple-600 hover:bg-purple-100/50"
                  )}
                >
                  Partial
                  <span className={cn(
                    "px-2 py-0.5 rounded-lg text-[10px] font-black",
                    filter === 'Partially Paid' ? "bg-purple-600 text-white" : "bg-purple-200 text-purple-700"
                  )}>
                    {partiallyPaidCount}
                  </span>
                </button>
              </div>
            )}
          </div>


            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 sm:p-6 border-b border-gray-100 bg-white">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Resident Payments</h3>
              </div>
              <div className="divide-y divide-gray-100 flex-1">
                {filteredResidents.length === 0 ? (
                  <div className="py-8">
                    <EmptyState 
                      icon={Users}
                      title="No records found"
                      subtitle="There are no residents matching your current filter."
                    />
                  </div>
                ) : (
                  filteredResidents.map((r) => {
                    const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, r.roomId, r.bedId);
                    const bedStatus = getBedStatusForResident(r.roomId, r.bedId);
                    const displayDate = r.paymentStatus === 'paid' 
                      ? `Next Due: ${formatDate(r.dueDate || r.joinDate || getTodayIST())}` 
                      : (r.paymentStatus === 'late' 
                        ? `Due: ${formatDate(r.dueDate || getTodayIST())}` 
                        : `Due: ${formatDate(r.dueDate || getTodayIST())}`);
                    const rentAmount = getResidentRentAmount(r, floors);

                    return (
                      <div key={r.id} className="flex flex-col border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <div onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between cursor-pointer gap-4">
                          <div className="flex items-center gap-4">
                            <div onClick={(e) => { e.stopPropagation(); setGlobalSelectedResidentId(r.id); navigate(ROUTES.residents.path); }} className="w-12 h-12 bg-gray-50 border ring-1 ring-gray-200 shadow-sm rounded-full flex items-center justify-center text-gray-400 shrink-0 hover:ring-blue-300 overflow-hidden">
                              {r.photoUrl ? <img src={r.photoUrl} className="w-full h-full object-cover" /> : <DefaultAvatar className="w-full h-full" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-bold text-gray-900 text-[15px] truncate">{r.name}</div>
                                {bedStatus === 'reserved' && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider leading-none">Reserved</span>
                                )}
                              </div>
                              <div className="text-sm text-gray-400">Room {roomNum} · {bedLetter}</div>
                            </div>
                            <div className="lg:hidden flex items-center gap-2">
                               <div className="text-right">
                                  <div className="font-bold text-gray-900 text-[15px]">₹{rentAmount.toLocaleString('en-IN')}</div>
                                  <div className="text-[10px] text-gray-400 whitespace-nowrap">{displayDate.split(': ')[1]}</div>
                               </div>
                               {getStatusPill(r)}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 justify-between lg:justify-end w-full lg:w-auto">
                            <div className="hidden lg:block w-[80px] shrink-0 text-center">{getStatusPill(r)}</div>
                            <div className="hidden lg:block text-right min-w-[120px] shrink-0">
                              <div className="font-bold text-gray-900 text-[15px]">₹{rentAmount.toLocaleString('en-IN')}</div>
                              <div className="text-xs text-gray-400 whitespace-nowrap">{displayDate}</div>
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto lg:w-[220px] shrink-0 justify-stretch sm:justify-end" onClick={(e) => e.stopPropagation()}>
                              {r.paymentStatus === 'paid' ? (
                                <div className="w-full text-center lg:text-right">
                                  <span className="text-sm font-medium text-gray-500 inline-flex items-center gap-1 h-[36px]">Received <Check className="w-4 h-4 text-emerald-500" /></span>
                                </div>
                              ) : (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); handleSendReminder(r); }} className="min-h-9 sm:min-h-10 flex-1 sm:flex-none bg-[#25D366] hover:bg-[#22c35e] text-white px-3 sm:px-4 py-1 sm:py-1.5 rounded-xl sm:rounded-full text-[11px] sm:text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"><WhatsAppIcon className="w-3.5 h-3.5" /> Remind</button>
                                  <button onClick={(e) => { e.stopPropagation(); setResidentToMarkPaid(r); setPaymentDate(getTodayIST()); }} className="min-h-9 sm:min-h-10 flex-1 sm:flex-none text-[#059669] bg-white border border-[#A7F3D0]/60 px-3 py-1 sm:py-1.5 rounded-xl sm:rounded-full text-[11px] sm:text-[12px] font-semibold hover:bg-[#ECFDF5] transition-all flex items-center justify-center gap-1.5 shadow-sm"><CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid</button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        {expandedId === r.id && (
                          <div className="p-4 sm:p-5 pt-0 lg:pl-[84px] bg-transparent">
                            <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white/50">
                              <div className="bg-gray-50/80 px-4 py-2 border-b border-gray-100"><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent History</h4></div>
                              <div className="divide-y divide-gray-100">
                                {getMockHistory(r).length === 0 ? (
                                  <div className="px-4 py-6 text-center text-sm text-gray-400">No payment history yet</div>
                                ) : (
                                  getMockHistory(r).map(h => (
                                    <div key={h.id} className={cn("px-4 py-3 flex items-center justify-between transition-colors border-l-4", h.status === 'partial' ? "border-l-purple-500 bg-purple-50" : "border-l-transparent hover:bg-white")}>
                                      <div className="flex items-center gap-3">
                                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", h.status === 'partial' ? "bg-purple-100 text-purple-600" : "bg-green-50 text-green-600")}><Check className="w-4 h-4" /></div>
                                        <div><p className="text-sm font-semibold text-gray-900">{h.title || 'Rent Payment'}</p><p className="text-xs text-gray-500">{getTransactionDateForDisplay(h.date)}</p></div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-bold text-gray-900">₹{h.amount.toLocaleString('en-IN')}</p>
                                        <p className={cn("text-xs font-medium capitalize", h.status === 'partial' ? "text-purple-600" : "text-green-600")}>{h.status} {h.method && <span className="bg-gray-100 px-1 py-0.5 rounded text-[9px] ml-1">{h.method}</span>}</p>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </>
        ) : (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start gap-4">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Transaction History</h3>
                

                <div className="mt-3 w-full max-w-full overflow-x-auto overscroll-x-contain touch-pan-x scroll-smooth no-scrollbar">
                  <div className="flex w-max flex-nowrap bg-white p-1 rounded-xl border border-gray-200 gap-1">
                  {([
                    { value: 'All' as const, label: 'All Payments', icon: Wallet },
                    { value: 'Rent' as const, label: 'Rent Payments', icon: Wallet },
                    { value: 'Security Deposits' as const, label: 'Security Deposits', icon: Banknote },
                  ]).map(option => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setHistoryPaymentFilter(option.value)}
                        className={cn(
                            "shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                          historyPaymentFilter === option.value ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                    </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 w-full md:w-auto ml-auto">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-end">
                  <div className="relative w-full lg:w-[260px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Search name or room"
                      className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>

                  <div className="relative w-full sm:w-max">
                    <select
                      value={historyTimeFilter}
                      onChange={(e) => setHistoryTimeFilter(e.target.value as 'All' | 'Today' | 'Monthly' | 'Yearly')}
                      className="appearance-none h-11 min-w-[140px] rounded-xl border border-gray-200 bg-white pl-4 pr-12 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    >
                      <option value="All">All</option>
                      <option value="Today">Today</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Yearly">Yearly</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>

                  <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 whitespace-nowrap">
                    <div>Total: ₹{totalHistoryAmount.toLocaleString('en-IN')}</div>
                    {isSecurityDepositHistory && (
                      <div className="mt-1 pt-1 border-t border-gray-100 text-[11px] font-medium text-gray-500">
                        Expected: ₹{expectedTotalSecurityDeposit.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-end">
                  {historyTimeFilter === 'Monthly' && (
                    <div className="relative">
                      <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <select
                        value={selectedHistoryMonth}
                        onChange={(e) => setSelectedHistoryMonth(e.target.value)}
                        className="appearance-none h-11 min-w-[170px] rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      >
                        {historyMonthOptions.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {historyTimeFilter === 'Yearly' && (
                    <div className="relative">
                      <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <select
                        value={selectedHistoryYear}
                        onChange={(e) => setSelectedHistoryYear(e.target.value)}
                        className="appearance-none h-11 min-w-[140px] rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      >
                        {historyYearOptions.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              {/* Desktop Table */}
              <table className="hidden md:table w-full text-left">
                <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Resident</th>
                    <th className="px-6 py-4">Room</th>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistoryTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12">
                        <EmptyState 
                          icon={Clock}
                          title="No transactions found"
                          subtitle={historySearchQuery ? 'No payment history matches search and filters.' : 'No payment history matches selected filters.'}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryTransactions.map((payment, idx) => {
                      const { roomName } = getNamesFromIds(floors, payment.roomId, payment.bedId);
                        const bedStatus = getBedStatusForResident(payment.roomId, payment.bedId);
                      const formattedDate = getTransactionDateForDisplay(payment.date);
                      const formattedTime = formatTimeIST(payment.date);
                      const vacated = isResidentVacated(payment.residentId);

                      return (
                        <tr key={`${payment.id}-${idx}`} className={cn(
                          "hover:bg-gray-50/50 transition-colors border-l-4",
                          vacated ? "border-l-red-600 bg-red-50" : (payment.status === 'partial' ? "border-l-purple-600 bg-purple-50" : "border-l-transparent")
                        )}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-600">{formattedDate}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                                {payment.residentName}
                                {vacated && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider leading-none">Vacated</span>
                                )}
                                {bedStatus === 'reserved' && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider leading-none">Reserved</span>
                                )}
                              </span>
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{payment.title || 'Rent Payment'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Room {roomName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-blue-600 uppercase tracking-tight">{formattedTime}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 w-max",
                              payment.method === 'Cash' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {payment.method === 'Cash' ? <Banknote className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                              {payment.method || 'UPI'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <span className="text-sm font-black text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {filteredHistoryTransactions.length === 0 ? (
                  <div className="p-8">
                    <EmptyState 
                      icon={Clock}
                      title="No transactions found"
                      subtitle={historySearchQuery ? 'No payment history matches search and filters.' : 'No payment history matches selected filters.'}
                    />
                  </div>
                ) : (
                  filteredHistoryTransactions.map((payment, idx) => {
                    const { roomName } = getNamesFromIds(floors, payment.roomId, payment.bedId);
                    const formattedDate = getTransactionDateForDisplay(payment.date);
                    const formattedTime = formatTimeIST(payment.date);
                    const vacated = isResidentVacated(payment.residentId);

                    return (
                      <div key={`${payment.id}-${idx}`} className={cn(
                        "p-4 flex flex-col gap-3 transition-colors border-l-4",
                        vacated ? "border-l-red-600 bg-red-50" : (payment.status === 'partial' ? "border-l-purple-600 bg-purple-50" : "border-l-transparent")
                      )}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900">{payment.residentName}</p>
                              {vacated && (
                                <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 text-[9px] font-bold uppercase tracking-wider leading-none">Vacated</span>
                              )}
                            </div>
                            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-1">{payment.title || 'Rent Payment'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-gray-900">₹{payment.amount.toLocaleString('en-IN')}</p>
                            <div className={cn(
                              "inline-flex px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider items-center gap-1 mt-1",
                              payment.method === 'Cash' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {payment.method === 'Cash' ? <Banknote className="w-2.5 h-2.5" /> : <Smartphone className="w-2.5 h-2.5" />}
                              {payment.method || 'UPI'}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
                          <div className="flex items-center gap-2">
                             <span>Room {roomName}</span>
                             <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                             <span className="text-blue-600">{formattedTime}</span>
                          </div>
                          <span>{formattedDate}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        )}
      </div>

      <AnimatePresence>
        {isBulkModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto flex flex-col relative"
            >
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-5 sm:p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center mb-4">
                  <Send className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Send Bulk Reminders</h3>
                
                <div className="my-5 space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">Reminder Category</label>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { id: 'All', label: 'All Unpaid', count: dueResidents.length, activeClass: "bg-blue-50 border-blue-200", textClass: "text-blue-700", badgeClass: "bg-blue-600 text-white" },
                      { id: 'Pending', label: 'Pending Today', count: dueResidents.filter(r => r.paymentStatus === 'due').length, activeClass: "bg-orange-50 border-orange-200", textClass: "text-orange-700", badgeClass: "bg-orange-600 text-white" },
                      { id: 'Late', label: 'Late Payments', count: dueResidents.filter(r => r.paymentStatus === 'late').length, activeClass: "bg-red-50 border-red-200", textClass: "text-red-700", badgeClass: "bg-red-600 text-white" },
                      { id: 'Partial', label: 'Partially Paid', count: dueResidents.filter(r => r.paymentStatus === 'partially_paid').length, activeClass: "bg-purple-50 border-purple-200", textClass: "text-purple-700", badgeClass: "bg-purple-600 text-white" }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setBulkReminderFilter(opt.id as any)}
                        className={cn(
                          "w-full p-3.5 rounded-xl border transition-all flex items-center justify-between text-left",
                          bulkReminderFilter === opt.id 
                            ? `${opt.activeClass} shadow-sm border-2` 
                            : "bg-white border-gray-100 hover:border-gray-300 text-gray-600"
                        )}
                      >
                        <span className={cn(
                          "text-[15px] font-bold",
                          bulkReminderFilter === opt.id ? opt.textClass : "text-gray-700"
                        )}>
                          {opt.label}
                        </span>
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-black min-w-[28px] text-center",
                          bulkReminderFilter === opt.id ? opt.badgeClass : "bg-gray-100 text-gray-400"
                        )}>
                          {opt.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-gray-800 text-[15px] font-medium leading-relaxed">
                  Send WhatsApp reminders to filtered residents one by one?
                </p>
                <p className="text-[12px] text-gray-600 font-medium mt-3 bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-gray-500" />
                  Note: This will open WhatsApp for each resident. Please ensure popups are allowed.
                </p>
              </div>

              <div className="p-5 sm:p-6 flex items-center justify-end gap-3 pb-8 sm:pb-6">
                <button 
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={startSendingBulkReminders}
                  className="px-6 py-2.5 text-[15px] font-bold text-white bg-[#25D366] hover:bg-[#22c35e] rounded-xl transition-colors shadow-sm flex items-center gap-2"
                >
                  Start Sending
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {residentToMarkPaid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto flex flex-col relative"
            >
              <button 
                onClick={() => setResidentToMarkPaid(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-5 sm:p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Mark as Paid?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
                  Update payment status for <strong>{residentToMarkPaid.name}</strong> for the current cycle.
                </p>

                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6 flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Amount to Collect</span>
                  <span className="text-2xl sm:text-3xl font-black text-blue-700">₹{getResidentRentAmount(residentToMarkPaid, floors).toLocaleString('en-IN')}</span>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-gray-900 block mb-4">Paid Using</label>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setPaidUsing('UPI')}
                        className={cn(
                          "flex-1 flex flex-col items-center gap-3 p-4 sm:p-5 rounded-2xl border-2 transition-all",
                          paidUsing === 'UPI' 
                            ? "border-green-600 bg-green-50 text-green-700 shadow-sm" 
                            : "border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <Smartphone className={cn("w-6 h-6", paidUsing === 'UPI' ? "text-green-600" : "text-gray-400")} />
                        <span className="font-bold text-sm">UPI</span>
                      </button>
                      <button
                        onClick={() => setPaidUsing('Cash')}
                        className={cn(
                          "flex-1 flex flex-col items-center gap-3 p-4 sm:p-5 rounded-2xl border-2 transition-all",
                          paidUsing === 'Cash' 
                            ? "border-green-600 bg-green-50 text-green-700 shadow-sm" 
                            : "border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <IndianRupee className={cn("w-6 h-6", paidUsing === 'Cash' ? "text-green-600" : "text-gray-400")} />
                        <span className="font-bold text-sm">Cash</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-1">
                    <label className="text-sm font-medium text-gray-900">Partial Payment</label>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="partialPayment"
                          checked={isPartialPayment === true}
                          onChange={() => setIsPartialPayment(true)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="partialPayment"
                          checked={isPartialPayment === false}
                          onChange={() => setIsPartialPayment(false)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">No</span>
                      </label>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isPartialPayment && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium text-gray-900 block">Pay Amount</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
                              <input 
                                type="number" 
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                placeholder="Enter amount"
                                className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                              />
                            </div>
                          </div>
                          <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium text-gray-900 block">Date</label>
                            <input 
                              type="date" 
                              value={paymentDate}
                              onChange={(e) => setPaymentDate(e.target.value)}
                              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                            />
                          </div>
                        </div>
                        
                        <div className={cn(
                          "p-3 rounded-xl border flex items-center justify-between",
                          Number(partialAmount) > getResidentRentAmount(residentToMarkPaid, floors)
                            ? "bg-red-50 border-red-100"
                            : "bg-blue-50 border-blue-100"
                        )}>
                          <span className={cn(
                            "text-sm font-medium",
                            Number(partialAmount) > getResidentRentAmount(residentToMarkPaid, floors) ? "text-red-800" : "text-blue-800"
                          )}>
                            {Number(partialAmount) > getResidentRentAmount(residentToMarkPaid, floors) ? "Status:" : "Remaining:"}
                          </span>
                          <span className={cn(
                            "text-sm font-bold text-right",
                            Number(partialAmount) > getResidentRentAmount(residentToMarkPaid, floors) ? "text-red-900" : "text-blue-900"
                          )}>
                            {Number(partialAmount) > getResidentRentAmount(residentToMarkPaid, floors)
                              ? `Overpaid by ₹${(Number(partialAmount) - getResidentRentAmount(residentToMarkPaid, floors)).toLocaleString('en-IN')}`
                              : `₹${(getResidentRentAmount(residentToMarkPaid, floors) - Number(partialAmount)).toLocaleString('en-IN')}`
                            }
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              </div>

              <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-4 pb-8 sm:pb-6">
                <button 
                  onClick={() => {
                    setResidentToMarkPaid(null);
                    setPaidUsing('UPI');
                    setIsPartialPayment(false);
                    setPartialAmount('');
                    setPaymentDate(getTodayIST());
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    const amountToPay = isPartialPayment && partialAmount ? Number(partialAmount) : undefined;
                    executeMarkPaid(residentToMarkPaid.id, paidUsing, amountToPay, isPartialPayment ? paymentDate : undefined, residentToMarkPaid.name, isPartialPayment);
                  }}
                  disabled={isMarkingPaid}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isMarkingPaid ? 'Confirming...' : (isPartialPayment ? 'Confirm Partial' : 'Confirm Paid')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
