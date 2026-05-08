import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import DefaultAvatar from '../components/DefaultAvatar';
import { Plus, Phone, X, History, ArrowLeft, Calendar, LogOut, UserPlus, IndianRupee, FileText, CheckCircle2, Edit, User, Smartphone, Banknote, Upload, Image as ImageIcon } from 'lucide-react';
import { cn, formatDate, getNamesFromIds, getTodayIST, convertToIST, getCurrentTimeIST } from '../lib/utils';
import { Resident, PastResident, MockPastResidents } from '../data/mock';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { uploadResidentDocuments } from '../lib/supabaseAPI';

type ViewMode = 'all' | 'floor' | 'room';

export const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

export default function Residents() {
  const { residents, pastResidents, floors, hostelProfile, globalSelectedResidentId, setGlobalSelectedResidentId, vacateResident, addResident, editResident, isDemoMode } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [currentSort, setCurrentSort] = useState('recent');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | PastResident | null>(null);
  const [profileTab, setProfileTab] = useState<'info' | 'payment'>('info');
  const [residentToVacate, setResidentToVacate] = useState<Resident | null>(null);
  const [residentToEdit, setResidentToEdit] = useState<Resident | null>(null);
  const [residentEditFiles, setResidentEditFiles] = useState<{ photo?: File; aadhar?: File; hostelForm?: File }>({});
  const [isEditingFiles, setIsEditingFiles] = useState(false);
  const [isUploadingProfileDoc, setIsUploadingProfileDoc] = useState(false);
  const [residentToMarkDepositPaid, setResidentToMarkDepositPaid] = useState<Resident | null>(null);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<'UPI' | 'Cash'>('UPI');
  const [depositPaymentDate, setDepositPaymentDate] = useState<string>(getTodayIST());

  React.useEffect(() => {
    if (residentToMarkDepositPaid) {
      setDepositPaymentDate(getTodayIST());
    }
  }, [residentToMarkDepositPaid]);

  React.useEffect(() => {
    if (globalSelectedResidentId) {
      const found = residents.find(r => r.id === globalSelectedResidentId);
      if (found) {
        setSelectedResident(found);
      }
      setGlobalSelectedResidentId(null);
    }
  }, [globalSelectedResidentId, residents, setGlobalSelectedResidentId]);

  // Keep selectedResident synced with any changes in the residents array
  React.useEffect(() => {
    if (selectedResident && 'paymentStatus' in selectedResident) {
      const updated = residents.find(r => r.id === selectedResident.id);
      if (updated) {
        setSelectedResident(updated);
      }
    }
  }, [residents]); // We only want to trigger when residents array changes

  // When view mode changes, reset sort appropriately
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'all') setCurrentSort('recent');
    else if (mode === 'floor') setCurrentSort('floor_asc');
    else if (mode === 'room') setCurrentSort('room_asc');
  };

  const handleProfileDocumentUpload = async (
    type: 'aadhar' | 'hostelForm' | 'photo',
    file?: File
  ) => {
    if (!file || !selectedResident || !('paymentStatus' in selectedResident)) return;
    if (!hostelProfile?.id) {
      toast.error('Hostel profile not found. Please refresh and try again.');
      return;
    }

    setIsUploadingProfileDoc(true);
    try {
      const uploadParams: any = {};
      if (type === 'aadhar') uploadParams.aadhar = file;
      else if (type === 'hostelForm') uploadParams.hostelForm = file;
      else if (type === 'photo') uploadParams.photo = file;

      const uploaded = await uploadResidentDocuments(
        uploadParams,
        hostelProfile.id
      );

      editResident(selectedResident.id, {
        aadharPath: uploaded.aadharPath,
        hostelFormPath: uploaded.hostelFormPath,
        photoPath: uploaded.photoPath,
      });

      toast.success(`${type === 'photo' ? 'Photo' : (type === 'aadhar' ? 'Aadhar' : 'Hostel form')} uploaded successfully`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload');
    } finally {
      setIsUploadingProfileDoc(false);
    }
  };

  const downloadFileInstantly = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file');

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Download failed. Please try again.');
    }
  };

  const getMockHistory = (resident: Resident | PastResident) => {
    const r = resident as any;
    const rentAmount = r.dueAmount > 0 ? r.dueAmount : 7500;
    const history = r.paymentHistory ? [...r.paymentHistory] : [];
    
    if (r.securityDeposit && r.isDepositPaid) {
      history.push({
        id: 'sec_dep',
        // keep raw ISO/timestamp here for reliable sorting and parsing
        date: r.depositPaidDate ? r.depositPaidDate : r.joinDate,
        amount: r.securityDeposit,
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

  // Past residents logic (sorted by recents)
  const sortedPastResidents = [...pastResidents].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.vacateDate).getTime();
    const dateB = new Date(b.createdAt || b.vacateDate).getTime();
    return dateB - dateA;
  });

  let sortedResidents = [...residents];
  if (viewMode === 'all') {
    if (currentSort === 'recent') {
      sortedResidents.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.joinDate).getTime();
        const dateB = new Date(b.createdAt || b.joinDate).getTime();
        return dateB - dateA;
      });
    } else if (currentSort === 'name_asc') {
      sortedResidents.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentSort === 'name_desc') {
      sortedResidents.sort((a, b) => b.name.localeCompare(a.name));
    }
  }

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

  const renderPastCard = (resident: PastResident) => {
    const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, resident.roomId, resident.bedId);
    const joinDate = formatDate(resident.joinDate);
    const vacateDate = formatDate(resident.vacateDate);

    return (
      <div 
        key={resident.id} 
        onClick={() => setSelectedResident(resident)}
        className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col gap-4 opacity-75 hover:opacity-100 transition-all cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm rounded-full flex items-center justify-center text-gray-400 shrink-0 overflow-hidden">
              {resident.photoUrl ? (
                <img src={resident.photoUrl} alt={resident.name} className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatar className="w-full h-full" />
              )}
            </div>
            <div>
              <div className="font-bold text-gray-900 leading-tight">{resident.name}</div>
              <div className="text-sm text-gray-500 mt-1">Room {roomNum} · {bedLetter}</div>
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('open-add-resident-modal', { detail: {
                  id: resident.id,
                  name: resident.name,
                  phone: resident.phone,
                  emergencyPhone: (resident as any).emergencyPhone || '',
                  aadhar: (resident as any).aadhar || '',
                  // No roomId/bedId — let owner pick fresh vacant bed
                } }));
            }}
            className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors"
            title="Re-add Resident"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="text-sm text-gray-500 flex flex-col gap-2 border-b border-gray-100 pb-4 pt-2">
          <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {resident.phone}</div>
          <div className="flex flex-col gap-1.5 mt-1 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
            <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-gray-400" /> <span className="text-xs">Joined: {joinDate}</span></div>
            <div className="flex items-center gap-2"><LogOut className="w-3.5 h-3.5 text-gray-400" /> <span className="text-xs">Left: {vacateDate}</span></div>
          </div>
        </div>
        
        <div className="flex flex-col pt-1">
          <span className="text-xs text-gray-400 font-medium">Reason for leaving</span>
          <span className="text-sm font-medium text-gray-800">{resident.reason}</span>
        </div>
      </div>
    );
  };

  const renderCard = (resident: Resident) => {
    const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, resident.roomId, resident.bedId);
    const joinDate = formatDate(resident.joinDate);
    const rentAmount = resident.dueAmount > 0 ? resident.dueAmount : 7500; // Mock rent

    return (
      <div 
        key={resident.id} 
        onClick={() => setSelectedResident(resident)}
        className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm rounded-full flex items-center justify-center text-gray-400 shrink-0 overflow-hidden">
            {resident.photoUrl ? (
              <img src={resident.photoUrl} alt={resident.name} className="w-full h-full object-cover" />
            ) : (
              <DefaultAvatar className="w-full h-full" />
            )}
          </div>
          <div>
            <div className="font-bold text-gray-900 leading-tight">{resident.name}</div>
            <div className="text-sm text-gray-500 mt-1">Room {roomNum} · {bedLetter}</div>
          </div>
        </div>
        
        <div className="text-sm text-gray-500 flex flex-col gap-1.5 border-b border-gray-100 pb-4 pt-2">
          <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {resident.phone}</div>
          <div className="text-gray-400 pl-6">Joined {joinDate}</div>
        </div>
        
        <div className="flex items-center justify-between pt-1">
          <div className="font-bold text-gray-900">₹{rentAmount.toLocaleString('en-IN')}/mo</div>
          {getStatusPill(resident)}
        </div>
      </div>
    );
  };

  const renderGrid = (list: Resident[]) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {list.map(renderCard)}
      </div>
    );
  };

  const renderContent = () => {
    if (showHistory) {
      if (sortedPastResidents.length === 0) {
        return (
          <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed">
            <History className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            No history found.
          </div>
        );
      }
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedPastResidents.map(res => renderPastCard(res))}
        </div>
      );
    }

    if (sortedResidents.length === 0) {
      return <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 border-dashed">No residents found.</div>;
    }

    if (viewMode === 'all') {
      return renderGrid(sortedResidents);
    }

    if (viewMode === 'floor') {
      // Map rooms to floors based on floor.rooms
      const floorGroups: Record<string, Resident[]> = {};
      floors.forEach(f => {
        floorGroups[f.name] = [];
      });
      
      sortedResidents.forEach(res => {
        const floor = floors.find(f => f.rooms.some(r => r.id === res.roomId));
        if (floor) {
          floorGroups[floor.name].push(res);
        }
      });

      const sortedFloorNames = Object.keys(floorGroups).sort((a, b) => {
        if (currentSort === 'floor_asc') return a.localeCompare(b);
        if (currentSort === 'floor_desc') return b.localeCompare(a);
        return 0;
      });

      return (
        <div className="space-y-10">
          {sortedFloorNames.map((floorName) => {
            const resList = floorGroups[floorName];
            if (resList.length === 0) return null;
            
            const floorObj = floors.find(f => f.name === floorName);
            const totalBeds = floorObj?.rooms.reduce((acc, r) => acc + r.beds.length, 0) || 0;
            const allocatedCount = residents.filter(r => floorObj?.rooms.some(rm => rm.id === r.roomId)).length;

            return (
              <div key={floorName}>
                <div className="flex justify-between items-end mb-4 pb-2 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-800">{floorName}</h3>
                  <span className="text-sm font-medium text-gray-500">{allocatedCount}/{totalBeds} beds</span>
                </div>
                {(() => {
                  const roomGroups: Record<string, Resident[]> = {};
                  resList.forEach(r => {
                    const roomName = `Room ${getNamesFromIds(floors, r.roomId, undefined).roomName}`;
                    if (!roomGroups[roomName]) roomGroups[roomName] = [];
                    roomGroups[roomName].push(r);
                  });
                  return Object.entries(roomGroups).sort().map(([roomName, roomResidents]) => (
                    <div key={roomName} className="mb-8 last:mb-0">
                      <h4 className="text-md font-semibold text-gray-600 mb-3">{roomName}</h4>
                      {renderGrid(roomResidents)}
                    </div>
                  ));
                })()}
              </div>
            );
          })}
        </div>
      );
    }

    if (viewMode === 'room') {
      const roomGroups: Record<string, Resident[]> = {};
      sortedResidents.forEach(res => {
        const roomId = res.roomId || 'unknown';
        if (!roomGroups[roomId]) roomGroups[roomId] = [];
        roomGroups[roomId].push(res);
      });

      const sortedRoomIds = Object.keys(roomGroups).sort((a, b) => {
        const nameA = getNamesFromIds(floors, a, undefined).roomName;
        const nameB = getNamesFromIds(floors, b, undefined).roomName;
        if (currentSort === 'room_asc') return nameA.localeCompare(nameB);
        if (currentSort === 'room_desc') return nameB.localeCompare(nameA);
        return 0;
      });

      return (
        <div className="space-y-10">
          {sortedRoomIds.map((roomId) => {
            const resList = roomGroups[roomId];
            if (resList.length === 0) return null;
            
            const roomName = `Room ${getNamesFromIds(floors, roomId, undefined).roomName}`;
            let totalBeds = 0;
            let allocatedCount = 0;
            
            const targetRoom = floors.flatMap(f => f.rooms).find(r => r.id === roomId);
            if (targetRoom) {
              totalBeds = targetRoom.beds.length;
              allocatedCount = residents.filter(r => r.roomId === roomId).length;
            }

            return (
              <div key={roomId}>
                <div className="flex justify-between items-end mb-4 pb-2 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-800">{roomName}</h3>
                  <span className="text-sm font-medium text-gray-500">{allocatedCount}/{totalBeds} beds</span>
                </div>
                {renderGrid(resList)}
              </div>
            );
          })}
        </div>
      );
    }
  };

  const getSelectedBedStatus = () => {
    if (!selectedResident) return 'unknown';
    for (const floor of floors) {
      const room = floor.rooms.find(r => r.id === selectedResident.roomId);
      if (room) {
        const bed = room.beds.find(b => b.id === selectedResident.bedId);
        if (bed) return bed.status;
      }
    }
    return 'unknown';
  };
  const selectedBedStatus = getSelectedBedStatus();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto md:h-[calc(100vh-64px)] overflow-hidden flex flex-col relative w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Residents</h1>
          <p className="text-gray-500">Manage all your hostel residents.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2",
              showHistory 
                ? "bg-gray-800 hover:bg-gray-900 text-white" 
                : "bg-white border border-gray-200 hover:border-gray-300 text-gray-700"
            )}
          >
            {showHistory ? <ArrowLeft className="w-4 h-4" /> : <History className="w-4 h-4" />}
            {showHistory ? 'Back to Active' : 'History'}
          </button>
          
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('open-add-resident-modal'))}
            className="bg-[#1D4ED8] hover:bg-[#1e40af] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2 hover:shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Resident
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
        {/* Toggle Buttons */}
        <div className={cn("bg-gray-100/80 p-1.5 rounded-[14px] flex gap-1.5 items-center justify-start overflow-x-auto w-full sm:w-auto border border-gray-200/60 shadow-sm no-scrollbar", showHistory ? "invisible" : "visible")}>
          {(['all', 'floor', 'room'] as ViewMode[]).map((mode) => {
            let countNum = 0;
            if (mode === 'all') countNum = residents.length;
            if (mode === 'floor') countNum = floors.length;
            if (mode === 'room') countNum = floors.reduce((acc, f) => acc + f.rooms.length, 0);

            return (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                className={cn(
                  "px-5 py-2 rounded-xl text-[15px] font-semibold transition-all capitalize flex items-center gap-2.5 whitespace-nowrap",
                  viewMode === mode 
                    ? "bg-white text-blue-700 shadow-md ring-1 ring-black/5" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                )}
              >
                {mode === 'all' ? 'All' : `${mode} wise`}
                <span className={cn(
                  "px-2.5 py-0.5 rounded-lg text-xs font-black",
                  viewMode === mode ? "bg-blue-600 text-white shadow-sm" : "bg-gray-200/80 text-gray-700"
                )}>
                  {countNum}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort By Dropdown instead of Search */}
        {!showHistory && (
          <div className="relative w-full sm:w-auto mt-4 sm:mt-0">
            <select
              value={currentSort}
              onChange={(e) => setCurrentSort(e.target.value)}
              className="appearance-none w-full sm:w-48 bg-white border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-2.5 pr-10 text-sm font-medium outline-none transition-all cursor-pointer shadow-sm text-gray-700"
            >
              {viewMode === 'all' && (
                <>
                  <option value="recent">Sort by: Recent</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="name_desc">Name: Z to A</option>
                </>
              )}
              {viewMode === 'floor' && (
                <>
                  <option value="floor_asc">Floor: Low to High</option>
                  <option value="floor_desc">Floor: High to Low</option>
                </>
              )}
              {viewMode === 'room' && (
                <>
                  <option value="room_asc">Room: Low to High</option>
                  <option value="room_desc">Room: High to Low</option>
                </>
              )}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className={cn(
        "flex-1 overflow-y-auto pb-12 pr-2 custom-scrollbar transition-all duration-300"
      )}>
        {renderContent()}
      </div>

      {/* Side Drawer for Resident Details */}
      <AnimatePresence>
        {selectedResident && (
          <motion.div 
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-full sm:w-[400px] bg-white border-l border-gray-200 shadow-2xl h-[calc(100vh-64px)] fixed right-0 top-16 z-30 flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Resident Profile</h2>
                <p className="text-sm text-gray-500">Details & Documents</p>
              </div>
              <div className="flex items-center gap-1">
                {('paymentStatus' in selectedResident) && (
                  <button 
                    onClick={() => setResidentToEdit(selectedResident as Resident)}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-600"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedResident(null)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="w-16 h-16 rounded-full bg-gray-50 border-2 border-white ring-1 ring-gray-200 shadow-sm flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
                    {selectedResident.photoUrl ? (
                      <img src={selectedResident.photoUrl} alt={selectedResident.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <DefaultAvatar className="w-full h-full" />
                        <label className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <Plus className="w-6 h-6 text-white" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            disabled={isUploadingProfileDoc}
                            onChange={(e) => handleProfileDocumentUpload('photo', e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  {isUploadingProfileDoc && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {selectedResident.name}
                    {selectedBedStatus === 'reserved' && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs tracking-wider rounded-md">RESERVED</span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-500">Room {getNamesFromIds(floors, selectedResident.roomId, selectedResident.bedId).roomName} • Bed {getNamesFromIds(floors, selectedResident.roomId, selectedResident.bedId).bedName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <a href={`tel:${selectedResident.phone}`} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-colors border border-gray-200">
                  <Phone className="w-4 h-4" /> Call
                </a>
                <a href={`https://wa.me/${(selectedResident.phone || '').replace(/[^0-9]/g, '').startsWith('91') && (selectedResident.phone || '').replace(/[^0-9]/g, '').length === 12 ? (selectedResident.phone || '').replace(/[^0-9]/g, '') : ((selectedResident.phone || '').replace(/[^0-9]/g, '').length === 10 ? '91' + (selectedResident.phone || '').replace(/[^0-9]/g, '') : (selectedResident.phone || '').replace(/[^0-9]/g, ''))}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
                  <WhatsAppIcon className="w-5 h-5" /> WhatsApp
                </a>
              </div>

              {/* Status Section */}
              {('paymentStatus' in selectedResident) && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Status</h4>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <IndianRupee className="w-5 h-5 text-gray-400" />
                       <span className="font-medium text-sm text-gray-700">Dues</span>
                     </div>
                     {selectedResident.paymentStatus === 'due' ? (
                        <span className="text-sm font-bold text-red-600">₹{selectedResident.dueAmount}</span>
                      ) : (
                        <span className="text-sm font-bold text-green-600">Paid (₹{selectedResident.dueAmount > 0 ? selectedResident.dueAmount : 7500})</span>
                      )}
                  </div>
                </div>
              )}

              <div className="flex bg-gray-100/80 p-1 rounded-xl">
                <button
                  onClick={() => setProfileTab('info')}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                    profileTab === 'info' ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  Info
                </button>
                <button
                  onClick={() => setProfileTab('payment')}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                    profileTab === 'payment' ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900"
                  )}
                >
                  Payment History
                </button>
              </div>

              {profileTab === 'info' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><Phone className="w-4 h-4" /> Phone</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedResident.phone}</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><Calendar className="w-4 h-4" /> Joined</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatDate(selectedResident.joinDate)}
                      </span>
                    </div>
                    {('vacateDate' in selectedResident) && (
                      <>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 col-span-2">
                          <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><LogOut className="w-4 h-4" /> Vacated On</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {formatDate(selectedResident.vacateDate)}
                          </span>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 col-span-2">
                          <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><FileText className="w-4 h-4" /> Reason</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {selectedResident.reason || 'Not specified'}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><User className="w-4 h-4" /> Aadhar No.</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedResident.aadhar || 'Not provided'}</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><Phone className="w-4 h-4" /> Emergency</span>
                      <span className="text-sm font-semibold text-gray-900">{selectedResident.emergencyPhone || '+91 98765 00000'}</span>
                    </div>
                    {('dueAmount' in selectedResident) && (
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 col-span-2">
                        <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><IndianRupee className="w-4 h-4" /> Monthly Rent</span>
                        <span className="text-sm font-semibold text-gray-900">₹{selectedResident.dueAmount > 0 ? selectedResident.dueAmount : 7500}</span>
                      </div>
                    )}
                    {('securityDeposit' in selectedResident && selectedResident.securityDeposit) ? (
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 col-span-2">
                        <span className="flex items-center justify-between gap-2 text-xs text-gray-500 font-medium mb-1.5">
                          <span className="flex items-center gap-2"><IndianRupee className="w-4 h-4" /> Security Deposit (One-time)</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${'isDepositPaid' in selectedResident && selectedResident.isDepositPaid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {'isDepositPaid' in selectedResident && selectedResident.isDepositPaid ? 'Paid' : 'Unpaid'}
                          </span>
                        </span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm font-semibold text-gray-900">₹{selectedResident.securityDeposit}</span>
                          {('isDepositPaid' in selectedResident && !selectedResident.isDepositPaid) && 'dueAmount' in selectedResident && (
                            <button
                              onClick={() => { setResidentToMarkDepositPaid(selectedResident as Resident); setDepositPaymentMethod('UPI'); setDepositPaymentDate(getTodayIST()); }}
                              className="px-3 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-bold transition-colors uppercase tracking-wider"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Documents Section */}
                  <div className="space-y-3 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Documents</h4>
                      {'paymentStatus' in selectedResident && !selectedResident.documentsComplete && (
                        <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-md">Missing</span>
                      )}
                    </div>

                    {'paymentStatus' in selectedResident ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Aadhar Card</p>
                              <p className="text-xs text-gray-500">
                                {selectedResident.aadharDocumentUrl ? 'Uploaded' : 'Not uploaded'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedResident.aadharDocumentUrl ? (
                              <>
                                <a
                                  href={selectedResident.aadharDocumentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 text-sm font-medium"
                                >
                                  View
                                </a>
                                <button
                                  type="button"
                                  onClick={() => downloadFileInstantly(selectedResident.aadharDocumentUrl!, `${selectedResident.name}-aadhar`)}
                                  className="text-gray-700 text-sm font-medium"
                                >
                                  Download
                                </button>
                              </>
                            ) : (
                              <label className="text-sm font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer">
                                Upload
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  disabled={isUploadingProfileDoc}
                                  onChange={(e) => handleProfileDocumentUpload('aadhar', e.target.files?.[0])}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Hostel Form</p>
                              <p className="text-xs text-gray-500">
                                {selectedResident.hostelFormUrl ? 'Uploaded' : 'Not uploaded'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedResident.hostelFormUrl ? (
                              <>
                                <a
                                  href={selectedResident.hostelFormUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 text-sm font-medium"
                                >
                                  View
                                </a>
                                <button
                                  type="button"
                                  onClick={() => downloadFileInstantly(selectedResident.hostelFormUrl!, `${selectedResident.name}-hostel-form`)}
                                  className="text-gray-700 text-sm font-medium"
                                >
                                  Download
                                </button>
                              </>
                            ) : (
                              <label className="text-sm font-semibold bg-gray-100 text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                                Upload
                                <input
                                  type="file"
                                  accept="application/pdf,image/*"
                                  className="hidden"
                                  disabled={isUploadingProfileDoc}
                                  onChange={(e) => handleProfileDocumentUpload('hostelForm', e.target.files?.[0])}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {!selectedResident.aadharDocumentUrl && !selectedResident.hostelFormUrl && (
                          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                            <p className="text-sm text-gray-600 font-medium">No documents found</p>
                            <p className="text-xs text-gray-500">Upload Aadhar and Hostel Form to complete profile</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <p className="text-sm text-gray-600">Documents are available for active residents only.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {profileTab === 'payment' && (
                <div className="space-y-6">
                  {/* Payment History Section */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Payment History</h4>
                    <div className="space-y-2">
                      {getMockHistory(selectedResident as Resident).map(history => (
                        <div key={history.id} className={cn("flex items-center justify-between p-3 border rounded-xl transition-colors cursor-pointer group border-l-4", history.status === 'partial' ? "border-l-purple-500 bg-purple-50/50 hover:border-purple-300 border-gray-200" : "bg-white hover:border-blue-300 border-gray-200 border-l-transparent")}>
                          <div className="flex items-center gap-3">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", history.status === 'partial' ? "bg-purple-100 text-purple-600" : "bg-green-50 text-green-600")}>
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{history.title || 'Rent Payment'}</p>
                              <p className="text-xs text-gray-500">Paid on {formatDate(history.date)}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold text-gray-900">₹{history.amount.toLocaleString('en-IN')}</span>
                            <span className={cn("text-xs font-semibold flex items-center gap-1", history.status === 'partial' ? "text-purple-600" : "text-green-600")}>
                              {history.status === 'partial' ? 'Partial' : 'Successful'}
                              {history.method && <span className={history.status === 'partial' ? "bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md text-[10px]" : "bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-[10px]"}>{history.method}</span>}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Actions */}
              <div className="pt-2">
                {('paymentStatus' in selectedResident) ? (
                  <button 
                    onClick={() => {
                      setResidentToVacate(selectedResident as Resident);
                    }}
                    className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Vacate Resident
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setSelectedResident(null);
      window.dispatchEvent(new CustomEvent('open-add-resident-modal', { detail: {
        id: (selectedResident as PastResident).id,
        name: selectedResident.name,
        phone: selectedResident.phone,
        emergencyPhone: (selectedResident as any).emergencyPhone || '',
        aadhar: (selectedResident as any).aadhar || '',
        // No roomId/bedId — let owner pick fresh vacant bed
      } }));
                    }}
                    className="w-full bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" /> Re-add Resident
                  </button>
                )}
              </div>
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {residentToVacate && (
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
                onClick={() => setResidentToVacate(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <LogOut className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Vacate Resident?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed">
                  Are you sure you want to vacate <strong>{residentToVacate.name}</strong> from Room {getNamesFromIds(floors, residentToVacate.roomId, undefined).roomName}? This action will permanently remove them from the active residents list.
                </p>
              </div>

              <div className="p-6 flex items-center justify-end gap-3 mt-2">
                <button 
                  onClick={() => setResidentToVacate(null)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    vacateResident(residentToVacate.id);
                    setResidentToVacate(null);
                    setSelectedResident(null);
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
                >
                  Confirm Vacate
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {residentToEdit && (
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
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Edit Resident Profile</h3>
                <button 
                  onClick={() => {
                    setResidentToEdit(null);
                    setResidentEditFiles({});
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                
                setIsEditingFiles(true);
                try {
                  let uploadedPaths: any = {};
                  if (Object.keys(residentEditFiles).length > 0 && residentToEdit && hostelProfile?.id) {
                    uploadedPaths = await uploadResidentDocuments(residentEditFiles, hostelProfile.id);
                  }

                  editResident(residentToEdit!.id, {
                    name: formData.get('name'),
                    phone: formData.get('phone'),
                    aadhar: formData.get('aadhar'),
                    emergencyPhone: formData.get('emergencyPhone'),
                    monthlyRent: formData.get('monthlyRent') ? parseInt(formData.get('monthlyRent') as string, 10) : undefined,
                    photoPath: uploadedPaths.photoPath,
                    aadharPath: uploadedPaths.aadharPath,
                    hostelFormPath: uploadedPaths.hostelFormPath,
                  });
                  setResidentToEdit(null);
                  setResidentEditFiles({});
                  toast.success('Resident updated successfully');
                  if (selectedResident && selectedResident.id === residentToEdit!.id) {
                    setSelectedResident(prev => prev ? {
                      ...prev, 
                      name: formData.get('name') as string, 
                      phone: formData.get('phone') as string,
                      aadhar: formData.get('aadhar') as string,
                      emergencyPhone: formData.get('emergencyPhone') as string,
                      dueAmount: formData.get('monthlyRent') ? parseInt(formData.get('monthlyRent') as string, 10) : ('dueAmount' in prev ? prev.dueAmount : 0),
                    } as Resident : null);
                  }
                } catch (error: any) {
                  toast.error(error?.message || 'Failed to update resident');
                } finally {
                  setIsEditingFiles(false);
                }
              }} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" name="name" defaultValue={residentToEdit.name} required className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                </div>

                <div className="grid grid-cols-1 gap-4 pt-1">
                  {[
                    { label: 'Photo', key: 'photo', icon: ImageIcon, current: residentToEdit.photoUrl, accept: 'image/*' },
                    { label: 'Aadhar', key: 'aadhar', icon: FileText, current: (residentToEdit as Resident).aadharDocumentUrl, accept: 'image/*,application/pdf' },
                    { label: 'Hostel Form', key: 'hostelForm', icon: Upload, current: (residentToEdit as Resident).hostelFormUrl, accept: 'image/*,application/pdf' }
                  ].map((file) => (
                    <div key={file.key} className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-100 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-400">
                          <file.icon className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{file.label}</p>
                          {(file.current || residentEditFiles[file.key as keyof typeof residentEditFiles]) && (
                            <p className="text-[11px] text-green-600 font-bold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" /> {residentEditFiles[file.key as keyof typeof residentEditFiles] ? 'New file selected' : 'Uploaded'}
                            </p>
                          )}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 shadow-sm cursor-pointer transition-all hover:bg-gray-50">
                        {file.current || residentEditFiles[file.key as keyof typeof residentEditFiles] ? 'Replace' : 'Upload'}
                        <input 
                          type="file" 
                          accept={file.accept}
                          className="sr-only" 
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setResidentEditFiles(prev => ({ ...prev, [file.key]: e.target.files![0] }));
                            }
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Phone No. <span className="text-red-500">*</span></label>
                  <input type="tel" name="phone" defaultValue={residentToEdit.phone} required className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Aadhar No.</label>
                  <input type="text" name="aadhar" defaultValue={residentToEdit.aadhar || ''} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Emergency Contact</label>
                  <input type="tel" name="emergencyPhone" defaultValue={residentToEdit.emergencyPhone || ''} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Monthly Rent</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <IndianRupee className="h-4 w-4 text-gray-500" />
                    </div>
                    <input type="number" name="monthlyRent" defaultValue={(residentToEdit as any).monthlyRent ?? residentToEdit.dueAmount} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-9 pr-4 py-3 text-sm outline-none transition-all" />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white border-t border-gray-100 mt-2 -mx-6 px-6 pt-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setResidentToEdit(null);
                      setResidentEditFiles({});
                    }}
                    disabled={isEditingFiles}
                    className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isEditingFiles}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEditingFiles ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {residentToMarkDepositPaid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setResidentToMarkDepositPaid(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Mark Deposit as Paid?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
                  Are you sure you want to mark the security deposit for <strong>{residentToMarkDepositPaid.name}</strong> as paid (<strong>₹{residentToMarkDepositPaid.securityDeposit?.toLocaleString('en-IN')}</strong>)? This will update their profile and add a payment record.
                </p>
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-gray-900 block mb-4">Paid Using</label>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setDepositPaymentMethod('UPI')}
                        className={`flex-1 py-3 px-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                          depositPaymentMethod === 'UPI' 
                            ? 'border-blue-600 bg-blue-50 text-blue-700' 
                            : 'border-gray-100 hover:border-gray-200 text-gray-600'
                        }`}
                      >
                        <Smartphone className="w-6 h-6" />
                        <span className="text-sm font-semibold">UPI</span>
                      </button>
                      <button 
                        onClick={() => setDepositPaymentMethod('Cash')}
                        className={`flex-1 py-3 px-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                          depositPaymentMethod === 'Cash' 
                            ? 'border-blue-600 bg-blue-50 text-blue-700' 
                            : 'border-gray-100 hover:border-gray-200 text-gray-600'
                        }`}
                      >
                        <Banknote className="w-6 h-6" />
                        <span className="text-sm font-semibold">Cash</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-900 block mb-2">Payment Date</label>
                    <input 
                      type="date" 
                      value={depositPaymentDate}
                      onChange={(e) => setDepositPaymentDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 flex items-center justify-end gap-3 border-t border-gray-100">
                <button 
                  onClick={() => setResidentToMarkDepositPaid(null)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    // Implement same logic as in payments (use proper UTC time)
                    const depositTimestamp = (() => {
                      if (!depositPaymentDate) {
                        return new Date().toISOString();
                      }
                      if (/^\d{4}-\d{2}-\d{2}$/.test(depositPaymentDate)) {
                        const now = new Date();
                        const localTime = now.toISOString().split('T')[1];
                        return `${depositPaymentDate}T${localTime}`;
                      }
                      return depositPaymentDate;
                    })();
                    editResident(residentToMarkDepositPaid.id, { ...residentToMarkDepositPaid, isDepositPaid: true, depositPaidDate: depositTimestamp });
                    toast.success(`Security deposit marked as paid`);
                    setResidentToMarkDepositPaid(null);
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
                >
                  Confirm Paid
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
