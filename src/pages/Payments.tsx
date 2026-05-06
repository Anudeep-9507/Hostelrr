import React, { useState } from 'react';
import { useApp, PaymentsFilterType } from '../context/AppContext';
import DefaultAvatar from '../components/DefaultAvatar';
import { CheckCircle2, Wallet, Clock, AlertTriangle, Check, Send, X, Smartphone, Banknote, IndianRupee, AlertCircle } from 'lucide-react';
import { cn, formatDate, getNamesFromIds } from '../lib/utils';
import { Resident } from '../data/mock';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

export const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

export default function Payments({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const { floors, residents, markAsPaid, markReminderSent, activePaymentsFilter: filter, setActivePaymentsFilter: setFilter, setGlobalSelectedResidentId, hostelProfile, isDemoMode, sharingRentMap } = useApp();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [residentToMarkPaid, setResidentToMarkPaid] = useState<Resident | null>(null);
  const [paidUsing, setPaidUsing] = useState<'UPI' | 'Cash'>('UPI');
  const [isPartialPayment, setIsPartialPayment] = useState<boolean>(false);
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const getDayAndMonth = (dateString: string) => {
    return formatDate(dateString);
  };

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
    const rentAmount = resident.dueAmount > 0 ? resident.dueAmount : 7500;
    const dueDateDisplay = resident.dueDate ? getDayAndMonth(resident.dueDate) : 'Today';

    const message = `Hello ${resident.name}, your hostel rent of *₹${rentAmount}* for Room ${roomNum} is currently pending.\n\nDue Date: *${dueDateDisplay}*\n\nPlease make the payment soon.\n\nThank you,\n${hostelName}\nPowered by Hostelrr`;

    markReminderSent(resident.id);
    
    // Format phone to whatsapp URL format
    const waPhone = phoneDigits.startsWith('91') && phoneDigits.length === 12 ? phoneDigits : (phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits);
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    
    window.open(waUrl, '_blank');
  };

  const startSendingBulkReminders = () => {
    setIsBulkModalOpen(false);
    toast.info('Starting bulk reminders...', { duration: 3000 });
    
    dueResidents.forEach((res, index) => {
      // Small timeout to help browser open multiple tabs or at least not strictly block immediately
      setTimeout(() => {
        handleSendReminder(res);
      }, index * 800);
    });
  };

  const getMockHistory = (resident: Resident) => {
    const rentAmount = resident.dueAmount > 0 ? resident.dueAmount : 7500;
    const history = resident.paymentHistory ? [...resident.paymentHistory] : [];
    
    if (resident.securityDeposit && resident.isDepositPaid) {
      history.push({
        id: 'sec_dep',
        date: formatDate(resident.joinDate),
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
    return [...history, ...mock].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const dueResidents = residents.filter(r => r.paymentStatus === 'due' || r.paymentStatus === 'partially_paid');
  const paidResidents = residents.filter(r => r.paymentStatus === 'paid');

  const totalDueAmount = dueResidents.reduce((acc, curr) => acc + curr.dueAmount, 0);
  const newPaymentsSum = residents.reduce((acc, r) => acc + (r.paymentHistory || []).reduce((sum, h) => sum + h.amount, 0) + ((r.securityDeposit && r.isDepositPaid) ? r.securityDeposit : 0), 0);
  const totalCollected = newPaymentsSum;  // real sum of all payment history entries

  const expectedMonthlyRevenue = floors.reduce((total, floor) => {
    return total + floor.rooms.reduce((roomTotal, room) => {
      const sharing = room.beds.length;
      const defaultRent = sharingRentMap[sharing] || 0;
      const rentPerBed = room.baseRent || defaultRent;
      return roomTotal + (sharing * rentPerBed);
    }, 0);
  }, 0);

  const now = new Date();
  const thisMonthRevenue = residents.reduce((total, r) => {
    return total + (r.paymentHistory || []).reduce((sum, h) => {
      if (h.status === 'paid') {
        const d = new Date(h.date);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          return sum + h.amount;
        }
      }
      return sum;
    }, 0);
  }, 0);

  // Logic for subsets
  const pendingCount = dueResidents.filter(r => r.paymentStatus === 'due').length;
  const lateCount = dueResidents.filter(r => r.paymentStatus === 'late').length;
  const partiallyPaidCount = residents.filter(r => r.paymentStatus === 'partially_paid').length;
  const unpaidCount = dueResidents.length;
  const paidCount = paidResidents.length;
  const allCount = residents.length;
  
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

  const filteredResidents = residents.filter(r => {
    if (filter === 'All') return true;
    if (filter === 'Paid') return r.paymentStatus === 'paid';
    if (filter === 'Unpaid') return r.paymentStatus === 'due' || r.paymentStatus === 'late' || r.paymentStatus === 'partially_paid';
    if (filter === 'Pending') return r.paymentStatus === 'due';
    if (filter === 'Late') return r.paymentStatus === 'late';
    if (filter === 'Partially Paid') return r.paymentStatus === 'partially_paid';
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Payments</h1>
        {dueResidents.length > 0 && (
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="bg-[#25D366] hover:bg-[#22c35e] text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <WhatsAppIcon className="w-4 h-4" />
            Send All Pending Reminders
          </button>
        )}
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Pending Payments */}
        <div 
          onClick={() => setFilter('Unpaid')}
          className="bg-orange-50 rounded-2xl p-5 border border-orange-200 shadow-sm flex flex-col justify-between min-h-[140px] cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col">
              <span className="text-gray-500 font-medium text-sm leading-tight pr-2">Pending Payments</span>
            </div>
            <div className="p-2 rounded-lg shrink-0 bg-white text-orange-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-auto w-full">
            <h3 className="text-[28px] font-bold text-gray-900 tracking-tight leading-none mb-1.5">₹{(totalDueAmount === 0 && residents.length === 0) ? expectedMonthlyRevenue.toLocaleString('en-IN') : totalDueAmount.toLocaleString('en-IN')}</h3>
          </div>
        </div>

        {/* This Month Revenue */}
        <div 
          onClick={() => setFilter('Paid')}
          className="bg-green-50 rounded-2xl p-5 border border-green-200 shadow-sm flex flex-col justify-between min-h-[140px] cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col">
              <span className="text-gray-500 font-medium text-sm leading-tight pr-2">This Month Revenue</span>
              <p className="text-xs text-green-600 font-medium mt-1">Expected: ₹{expectedMonthlyRevenue.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-2 rounded-lg shrink-0 bg-white text-green-600">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-auto w-full">
            <h3 className="text-[28px] font-bold text-gray-900 tracking-tight leading-none mb-1.5">₹{thisMonthRevenue > 0 ? thisMonthRevenue.toLocaleString('en-IN') : '0'}</h3>
          </div>
        </div>

        {/* Due Today */}
        <div 
          onClick={() => setFilter('Pending')}
          className="bg-blue-50 rounded-2xl p-5 border border-blue-200 shadow-sm flex flex-col justify-between min-h-[140px] cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col">
              <span className="text-gray-500 font-medium text-sm leading-tight pr-2">Due Today</span>
              <p className="text-xs text-blue-600 font-medium mt-1">Filter pending</p>
            </div>
            <div className="p-2 rounded-lg shrink-0 bg-white text-blue-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-auto w-full">
            <h3 className="text-[28px] font-bold text-gray-900 tracking-tight leading-none mb-1.5">{dueTodayCount}</h3>
          </div>
        </div>

        {/* Late Payments */}
        <div 
          onClick={() => setFilter('Late')}
          className="bg-red-50 rounded-2xl p-5 border border-red-200 shadow-sm flex flex-col justify-between min-h-[140px] cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col">
              <span className="text-gray-500 font-medium text-sm leading-tight pr-2">Late Payments</span>
              <p className="text-xs text-red-600 font-medium mt-1">Filter late</p>
            </div>
            <div className="p-2 rounded-lg shrink-0 bg-white text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-auto w-full">
            <h3 className="text-[28px] font-bold text-gray-900 tracking-tight leading-none mb-1.5">{lateCount}</h3>
          </div>
        </div>
      </div>

      {/* Resident Payments List Container */}
      <div className="flex flex-col gap-4">
        
        {/* Toggle Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="bg-gray-100/80 p-1.5 rounded-[14px] flex gap-1.5 items-center w-max border border-gray-200/60 shadow-sm">
            {(['All', 'Paid', 'Unpaid'] as PaymentsFilterType[]).map((mode) => {
              const isUnpaidSelected = mode === 'Unpaid' && (filter === 'Unpaid' || filter === 'Pending' || filter === 'Late' || filter === 'Partially Paid');
              return (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={cn(
                  "px-5 py-2 rounded-xl text-[15px] font-semibold transition-all flex items-center gap-2.5",
                  (filter === mode || isUnpaidSelected) 
                    ? "bg-white text-blue-700 shadow-md ring-1 ring-black/5" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                )}
              >
                {mode}
                <span className={cn(
                  "px-2.5 py-0.5 rounded-lg text-xs font-black",
                  (filter === mode || isUnpaidSelected) ? "bg-blue-600 text-white shadow-sm" : "bg-gray-200/80 text-gray-700"
                )}>
                  {mode === 'All' ? allCount : mode === 'Paid' ? paidCount : unpaidCount}
                </span>
              </button>
            )})}
          </div>
          
          {(filter === 'Unpaid' || filter === 'Pending' || filter === 'Late' || filter === 'Partially Paid') && (
            <div className="flex gap-2 items-center bg-orange-50 p-1.5 rounded-[14px] border border-orange-100/60 shadow-sm w-max transition-all flex-wrap">
               <button
                  onClick={() => setFilter('Pending')}
                  className={cn(
                    "px-4 py-1.5 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2",
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
                    "px-4 py-1.5 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2",
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
                    "px-4 py-1.5 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2",
                    filter === 'Partially Paid' 
                      ? "bg-white text-purple-700 shadow-md ring-1 ring-black/5" 
                      : "text-purple-600 hover:bg-purple-100/50"
                  )}
                >
                  Partially Paid
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
          <div className="p-6 border-b border-gray-100 bg-white">
            <h3 className="text-xl font-bold text-gray-900">Resident Payments</h3>
          </div>
          
          <div className="divide-y divide-gray-100 flex-1">
            {filteredResidents.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No records found for this filter.</div>
            ) : (
              filteredResidents.map((r) => {
                const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, r.roomId, r.bedId);
                // Mock dynamic dates depending on status
                const displayDate = r.paymentStatus === 'paid'
                  ? `Due: ${r.dueDate ? formatDate(r.dueDate) : '05 Apr 2026'}`
                  : (r.paymentStatus === 'late' ? `Due: ${r.dueDate ? formatDate(r.dueDate) : '5 days ago'}` : 'Due: Today');
                const rentAmount = r.dueAmount > 0 ? r.dueAmount : 7500;

                return (
                  <div key={r.id} className="flex flex-col border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <div 
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer gap-4"
                    >
                      
                      {/* Left side -> Avatar + Details */}
                      <div className="flex items-center gap-4">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setGlobalSelectedResidentId(r.id);
                            if (setActiveTab) setActiveTab('residents');
                          }}
                          title="View Resident Profile"
                          className="w-12 h-12 bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm rounded-full flex items-center justify-center text-gray-400 shrink-0 hover:ring-blue-300 transition-colors cursor-pointer overflow-hidden"
                        >
                          {r.photoUrl ? (
                            <img src={r.photoUrl} alt={r.name} className="w-full h-full object-cover" />
                          ) : (
                            <DefaultAvatar className="w-full h-full" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-[15px]">{r.name}</div>
                          <div className="text-sm text-gray-400">Room {roomNum} · {bedLetter}</div>
                        </div>
                      </div>

                      {/* Right side -> Actions & Info */}
                      <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-end w-full sm:w-auto mt-3 sm:mt-0">
                        
                        <div className="w-[70px] shrink-0 flex justify-end">
                          {getStatusPill(r)}
                        </div>

                        <div className="text-right min-w-[90px] shrink-0">
                          <div className="font-bold text-gray-900 text-[15px]">₹{rentAmount.toLocaleString('en-IN')}</div>
                          <div className="text-xs text-gray-400 whitespace-nowrap">{displayDate}</div>
                        </div>

                        <div className="flex items-center gap-2.5 w-[220px] shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
                          {r.paymentStatus === 'paid' ? (
                            <span className="text-sm font-medium text-gray-500 flex items-center gap-1 h-[36px]">
                              Received <Check className="w-4 h-4 text-gray-400" />
                            </span>
                          ) : (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendReminder(r);
                                }}
                                className="bg-[#25D366] hover:bg-[#22c35e] text-white px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap border border-transparent"
                              >
                                <WhatsAppIcon className="w-3.5 h-3.5" /> Remind
                              </button>
                              
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setResidentToMarkPaid(r);
                                }}
                                title="Mark Paid"
                                className="text-[#059669] bg-white hover:bg-[#ECFDF5] border border-[#A7F3D0]/60 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5" /> Mark Paid
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {r.lastReminderSentAt && r.paymentStatus !== 'paid' && (
                      <div className="px-[84px] pb-3 -mt-2">
                        <p className="text-xs text-gray-400 font-medium">
                          Last reminder sent {formatDate(r.lastReminderSentAt)} at {new Date(r.lastReminderSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )}
                    
                    {/* Payment History Accordion */}
                    {expandedId === r.id && (
                      <div className="p-5 pt-0 pl-[84px] bg-transparent">
                        <div className="border border-gray-100 rounded-xl overflow-hidden bg-white/50">
                          <div className="bg-gray-50/80 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payment History</h4>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {getMockHistory(r).map(history => (
                              <div key={history.id} className={cn("px-4 py-3 flex items-center justify-between transition-colors border-l-4", history.status === 'partial' ? "border-l-purple-500 bg-purple-50 hover:bg-purple-100/50" : "border-l-transparent hover:bg-white")}>
                                <div className="flex items-center gap-3">
                                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", history.status === 'partial' ? "bg-purple-100 text-purple-600" : "bg-green-50 text-green-600")}>
                                    <Check className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">{history.title || 'Rent Payment'}</p>
                                    <p className="text-xs text-gray-500">Paid on {history.date}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-900">₹{history.amount.toLocaleString('en-IN')}</p>
                                  <p className={cn("text-xs font-medium capitalize flex items-center justify-end gap-1", history.status === 'partial' ? "text-purple-600" : "text-green-600")}>
                                    {history.status}
                                    {history.method && <span className={history.status === 'partial' ? "bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md text-[10px] ml-1" : "bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-[10px] ml-1"}>{history.method}</span>}
                                  </p>
                                </div>
                              </div>
                            ))}
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
      </div>

      <AnimatePresence>
        {isBulkModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col relative"
            >
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center mb-4">
                  <Send className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Send Bulk Reminders</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed">
                  Send reminders to all <strong>{dueResidents.length}</strong> pending residents one by one in WhatsApp?
                </p>
                <p className="text-xs text-gray-400 mt-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                  Note: This will open WhatsApp {dueResidents.length} times. Please make sure your browser allows popups, or tap "Send" individually if blocked.
                </p>
              </div>

              <div className="p-6 flex items-center justify-end gap-3">
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col relative"
            >
              <button 
                onClick={() => setResidentToMarkPaid(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Mark as Paid?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
                  Are you sure you want to mark <strong>{residentToMarkPaid.name}</strong> as paid for <strong>₹{(residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500).toLocaleString('en-IN')}</strong>? This will update their payment status to 'Paid' for the current cycle.
                </p>
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-gray-900 block mb-4">Paid Using</label>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setPaidUsing('UPI')}
                        className={cn(
                          "flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all",
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
                          "flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all",
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
                        <div className="flex gap-4">
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
                          Number(partialAmount) > (residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500)
                            ? "bg-red-50 border-red-100"
                            : "bg-blue-50 border-blue-100"
                        )}>
                          <span className={cn(
                            "text-sm font-medium",
                            Number(partialAmount) > (residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500) ? "text-red-800" : "text-blue-800"
                          )}>
                            {Number(partialAmount) > (residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500) ? "Status:" : "Remaining Amount:"}
                          </span>
                          <span className={cn(
                            "text-sm font-bold",
                            Number(partialAmount) > (residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500) ? "text-red-900" : "text-blue-900"
                          )}>
                            {Number(partialAmount) > (residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500) 
                              ? `Overpaid by ₹${(Number(partialAmount) - (residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500)).toLocaleString('en-IN')}`
                              : `₹${((residentToMarkPaid.dueAmount > 0 ? residentToMarkPaid.dueAmount : 7500) - Number(partialAmount)).toLocaleString('en-IN')}`
                            }
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              </div>

              <div className="p-6 flex items-center justify-end gap-3 mt-4">
                <button 
                  onClick={() => {
                    setResidentToMarkPaid(null);
                    setPaidUsing('UPI');
                    setIsPartialPayment(false);
                    setPartialAmount('');
                    setPaymentDate(new Date().toISOString().split('T')[0]);
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    const amountToPay = isPartialPayment && partialAmount ? Number(partialAmount) : undefined;
                    markAsPaid(residentToMarkPaid.id, paidUsing, amountToPay, isPartialPayment ? paymentDate : undefined);
                    setResidentToMarkPaid(null);
                    setPaidUsing('UPI'); // reset default
                    setIsPartialPayment(false); // reset default
                    setPartialAmount('');
                    setPaymentDate(new Date().toISOString().split('T')[0]);
                    toast.success(`${residentToMarkPaid.name} marked as ${isPartialPayment && partialAmount ? 'partially ' : ''}paid`);
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
                >
                  {isPartialPayment ? 'Confirm Partially Paid' : 'Confirm Paid'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
