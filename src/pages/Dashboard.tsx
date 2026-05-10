import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROUTES } from '../routes/routes';
import { BedDouble, Users, AlertCircle, IndianRupee, PieChart, CheckCircle, Clock, LogOut, X, Info, Phone, ChevronRight } from 'lucide-react';
import { cn, formatDate, getNamesFromIds } from '../lib/utils';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AnimatePresence, motion } from 'motion/react';
import EmptyState from '../components/EmptyState';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

function KpiCard({ title, value, icon: Icon, trend, className, cardBg = "bg-white", onClick, trendColor }: any) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "rounded-2xl p-5 border shadow-sm flex flex-col justify-between h-full min-h-[140px] transition-all relative overflow-hidden", 
        cardBg,
        !cardBg.includes('border-') && "border-gray-100",
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]" : ""
      )}
    >
      <div className="flex justify-between items-start relative z-10 mb-2">
        <div className="flex flex-col">
          <span className="text-gray-500 font-medium text-sm leading-tight pr-2">{title}</span>
          {trend && (
            <p className={cn("text-xs font-medium mt-1", trendColor || "text-gray-500")}>
              {trend}
            </p>
          )}
        </div>
        <div className={cn("p-2 rounded-lg shrink-0", className)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-auto w-full relative z-10">
        <h3 className="text-[28px] font-bold text-gray-900 tracking-tight leading-none mb-1.5">{value}</h3>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { floors, residents, activities, joinRequests, rejectJoinRequest, markAsPaid, setActiveBuildingFilter, setActivePaymentsFilter, hostelProfile, sharingRentMap, syncStateWithDb } = useApp();
  const [requestSearch, setRequestSearch] = useState('');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isRevenueInfoModalOpen, setIsRevenueInfoModalOpen] = useState(false);

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

  // Pending = total owed by all residents with unpaid/partial cycles
  const dueResidents = residents.filter(r => r.paymentStatus === 'due' || r.paymentStatus === 'late' || r.paymentStatus === 'partially_paid');
  const totalDueAmount = dueResidents.reduce((acc, curr) => acc + curr.dueAmount, 0);
  
  // Real monthly revenue — sum of all payment history amounts from paid residents this calendar month
  const now = new Date();
  const thisMonthRevenue = residents.reduce((total, r) => {
    const historyRevenue = (r.paymentHistory || []).reduce((sum, h) => {
      if (h.status === 'paid' || h.status === 'partial') {
        const d = new Date(h.date);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          return sum + h.amount;
        }
      }
      return sum;
    }, 0);

    let depositRevenue = 0;
    if (r.securityDeposit && r.isDepositPaid) {
      const d = new Date(r.joinDate);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        depositRevenue = r.securityDeposit;
      }
    }

    return total + historyRevenue + depositRevenue;
  }, 0);

  // Expected = sum of monthlyRent for all currently OCCUPIED residents only
  // (resident.monthlyRent is set when resident is added and stored in DB)
  const expectedMonthlyRevenue = residents.reduce((total, r) => {
    return total + (r.monthlyRent || 0);
  }, 0);

  const defaultSecurityDeposit = Number(hostelProfile?.security_deposit || 0);
  const occupiedResidentsCount = residents.length;
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

  const handleNavigateBuilding = (filter: any) => {
    setActiveBuildingFilter(filter);
    navigate(ROUTES.rooms.path);
  };

  const handleNavigatePayments = (filter: any) => {
    setActivePaymentsFilter(filter);
    navigate(ROUTES.payments.path);
  };

  const newResidentsThisMonth = residents.filter(r => {
    if (!r.joinDate) return false;
    const d = new Date(r.joinDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Welcome back, {hostelProfile?.ownerName?.split(' ')[0] || "Owner"}</h1>
        <p className="text-gray-500">Here's what's happening at your hostel today.</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Beds" value={totalBeds} icon={BedDouble} className="bg-white text-gray-600" cardBg="bg-gray-50 border-gray-200" onClick={() => handleNavigateBuilding('all')} trendColor="text-gray-500" />
        <KpiCard title="Occupied Beds" value={occupiedBeds} icon={Users} trend={newResidentsThisMonth > 0 ? `+${newResidentsThisMonth} this month` : "No new joins this month"} className="bg-white text-green-600" cardBg="bg-green-50 border-green-200" onClick={() => handleNavigateBuilding('occupied')} trendColor="text-green-600" />
        <KpiCard title="Vacant Beds" value={vacantBeds} icon={PieChart} className="bg-white text-red-600" cardBg="bg-red-50 border-red-200" onClick={() => handleNavigateBuilding('vacant')} trendColor="text-red-600" />
        <KpiCard title="Pending Payments" value={`₹${totalDueAmount.toLocaleString('en-IN')}`} icon={AlertCircle} className="bg-white text-orange-600" cardBg="bg-orange-50 border-orange-200" onClick={() => handleNavigatePayments('Unpaid')} trendColor="text-orange-600" />
        <KpiCard
          title="This Month Revenue"
          value={thisMonthRevenue > 0 ? `₹${thisMonthRevenue.toLocaleString('en-IN')}` : '₹0'}
          icon={IndianRupee}
          trend={
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span>Expected: ₹{expectedMonthlyRevenue.toLocaleString('en-IN')}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRevenueInfoModalOpen(true);
                    }}
                    className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-all shadow-sm active:scale-90"
                    aria-label="Open expected revenue breakdown"
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

      <AnimatePresence>
        {isRevenueInfoModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsRevenueInfoModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-100"
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
                  <h3 className="text-lg font-bold">Revenue Projections</h3>
                </div>
                <p className="text-blue-100 text-sm">Monthly expected earnings overview</p>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 border border-gray-100 group hover:border-blue-200 transition-colors">
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

                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 border border-gray-100 group hover:border-indigo-200 transition-colors">
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
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Total Expected</span>
                      <span className="text-2xl font-black text-emerald-700">₹{finalExpectedRevenue.toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-xs text-emerald-600/80 font-medium">Sum of all rent and security deposits</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Occupancy Overview */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-6 items-center">
            <div className="w-48 h-48 flex-shrink-0">
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
            <div className="flex-1 w-full space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Occupancy Overview</h3>
              <div className="space-y-3">
                {legendData.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                        <span className="text-gray-600 font-medium">{d.name}</span>
                      </div>
                      <span className="font-bold text-gray-900">{d.value} Beds</span>
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
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Pending Dues</h3>
              <button 
                onClick={() => handleNavigatePayments('Pending')}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {dueResidents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No pending dues!</div>
              ) : (
                dueResidents.map(r => (
                  <div key={r.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{r.name}</p>
                        <p className="text-xs text-gray-500">Room {getNamesFromIds(floors, r.roomId, r.bedId).roomName} • Bed {getNamesFromIds(floors, r.roomId, r.bedId).bedName}</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <p className="font-bold text-red-600">₹{r.dueAmount}</p>
                        <p className="text-xs text-gray-500">Due {r.dueDate ? formatDate(r.dueDate) : 'Unknown'}</p>
                      </div>
                      <button 
                        onClick={() => {
                          const msg = `Hi ${r.name}, this is a reminder that your rent of Rs. *${r.dueAmount}* is pending. Please pay at your earliest convenience.\n\nThank you\uD83D\uDE01`;
                          window.open(`https://wa.me/91${(r.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="bg-[#25D366] hover:bg-[#20BE5B] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-1.5" title="Send WhatsApp Reminder"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-6">
          
          {/* Join Requests */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 bg-blue-50/50 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-gray-900">New Join Requests</h3>
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
                    <div className="flex justify-between items-start mb-2">
                       <div>
                         <p className="font-semibold text-gray-900 leading-tight">{req.name}</p>
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
                       <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2">{req.requestDate}</span>
                    </div>
                    {/* Removed notes */}
                    <div className="flex flex-col gap-2 mt-3">
                       <button 
                         onClick={() => {
                           window.dispatchEvent(new CustomEvent('open-add-resident-modal', { detail: { ...req, source: 'joinRequest', stayTime: req.stayDuration, emergencyPhone: req.emergencyContact, aadhar: req.aadharNumber } }));
                         }}
                         className="w-full bg-[#1D4ED8] hover:bg-[#1e40af] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-sm"
                       >
                         Review & Assign
                       </button>
                       <div className="flex gap-2">
                         <a href={`tel:${req.phone}`} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-colors shadow-sm">
                           <Phone className="w-3.5 h-3.5" /> Call
                         </a>
                         <a 
                           href={`https://wa.me/${(req.phone || '').replace(/[^0-9]/g, '').startsWith('91') && (req.phone || '').replace(/[^0-9]/g, '').length === 12 ? (req.phone || '').replace(/[^0-9]/g, '') : ((req.phone || '').replace(/[^0-9]/g, '').length === 10 ? '91' + (req.phone || '').replace(/[^0-9]/g, '') : (req.phone || '').replace(/[^0-9]/g, ''))}`} 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                         >
                           <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                         </a>
                         <button 
                           onClick={() => rejectJoinRequest(req.id)}
                           className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl text-xs font-bold transition-colors"
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

          {/* Activity */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Activity</h3>
              <button 
                onClick={() => setIsActivityModalOpen(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View All
              </button>
            </div>
            <div className="p-2 space-y-1">
              {activities.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No recent activity</div>
              ) : (
                activities.slice(0, 5).map((a, i) => (
                  <div key={a.id} className="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600 shrink-0">
                      {a.icon === 'UserPlus' && <Users className="w-5 h-5" />}
                      {a.icon === 'IndianRupee' && <IndianRupee className="w-5 h-5" />}
                      {a.icon === 'LogOut' && <LogOut className="w-5 h-5" />}
                      {a.icon === 'CheckCircle' && <CheckCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col flex-1 pt-0.5">
                      <span className="font-medium text-sm text-gray-900">{a.text}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{a.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      <AnimatePresence>
        {isActivityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
              onClick={() => setIsActivityModalOpen(false)}
            ></div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col relative z-10"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Activity Log</h3>
                  <p className="text-sm text-gray-500">All recent activities in your hostel</p>
                </div>
                <button 
                  onClick={() => setIsActivityModalOpen(false)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
                {activities.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">No activity history found.</div>
                ) : (
                  activities.map((a, i) => (
                    <div key={a.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 group">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 shrink-0 group-hover:scale-110 transition-transform">
                        {a.icon === 'UserPlus' && <Users className="w-6 h-6" />}
                        {a.icon === 'IndianRupee' && <IndianRupee className="w-6 h-6" />}
                        {a.icon === 'LogOut' && <LogOut className="w-6 h-6" />}
                        {a.icon === 'CheckCircle' && <CheckCircle className="w-6 h-6" />}
                      </div>
                      <div className="flex flex-col flex-1 pt-1">
                        <span className="font-medium text-base text-gray-900">{a.text}</span>
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
