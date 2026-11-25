import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { FLAGS } from '../core/env';
import DefaultAvatar from '../components/DefaultAvatar';
import { Plus, Phone, X, History, ArrowLeft, Calendar, LogOut, UserPlus, Users, IndianRupee, FileText, CheckCircle2, Edit, User, Upload, Image as ImageIcon, Trash2, BedDouble } from 'lucide-react';
import { cn, formatDate, getNamesFromIds, getTodayIST, convertToIST, getCurrentTimeIST, getTransactionSortTimestamp, getResidentRentAmount, getResidentDueDisplayAmount, getWhatsAppUrl, isResidentReserved } from '../lib/utils';
import EmptyState from '../components/EmptyState';
import { Resident, PastResident, MockPastResidents } from '../data/mock';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { deleteResidentPhoto, uploadResidentPhoto } from '../lib/supabaseAPI';
import useAsyncAction from '../hooks/useAsyncAction';
import { MarkRentPaidModal } from '../components/MarkRentPaidModal';
import { MarkDepositPaidModal } from '../components/MarkDepositPaidModal';
import ResidentStatusCard from '../components/ResidentStatusCard';
import { PrivatePhoto } from '../components/PrivatePhoto';
import { buildRentReminderMessage } from '../lib/reminderTemplate';
import ResidentAvatar from '../components/ResidentAvatar';

type ViewMode = 'all' | 'floor' | 'room' | 'vacating' | 'reserved';
const MAX_RESIDENT_PHOTO_SIZE = 1024 * 1024;

export const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

export default function Residents() {
  const location = useLocation();
  const navigate = useNavigate();
  const { residents, pastResidents, floors, hostelProfile, globalSelectedResidentId, setGlobalSelectedResidentId, vacateResident, addResident, confirmMoveIn, editResident, markAsPaid, isDemoMode, deletePastResident, syncStateWithDb, isDataLoading } = useApp();
  const collectsSecurityDeposit = Boolean(hostelProfile?.collectSecurityDeposit ?? Number(hostelProfile?.security_deposit || 0) > 0);
  const initialSearchFilter = new URLSearchParams(location.search).get('filter');
  const initialRouteState = location.state as any;
  const isInitialReserved = Boolean(initialRouteState?.showReserved || initialSearchFilter === 'reserved');
  const isInitialVacating = Boolean(initialRouteState?.showVacatingSoon || initialSearchFilter === 'vacating');

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (isInitialReserved) return 'reserved';
    if (isInitialVacating) return 'vacating';
    return 'all';
  });
  const [currentSort, setCurrentSort] = useState(() => (isInitialVacating ? 'vacating' : 'all'));
  const [showHistory, setShowHistory] = useState(false);
  const [selectedResident, setSelectedResident] = useState<Resident | PastResident | null>(null);
  const [profileTab, setProfileTab] = useState<'info' | 'payment'>('info');
  const [residentToVacate, setResidentToVacate] = useState<Resident | null>(null);
  const [residentToEdit, setResidentToEdit] = useState<Resident | null>(null);
  const [residentEditFiles, setResidentEditFiles] = useState<{ photo?: File }>({});
  const [isEditingFiles, setIsEditingFiles] = useState(false);
  const [showPhotoRemovalConfirm, setShowPhotoRemovalConfirm] = useState(false);
  const [historyResidentToDelete, setHistoryResidentToDelete] = useState<PastResident | null>(null);
  const [isUploadingProfileDoc, setIsUploadingProfileDoc] = useState(false);
  const [residentToMarkDepositPaid, setResidentToMarkDepositPaid] = useState<Resident | null>(null);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<'UPI' | 'Cash'>('UPI');
  const [depositPaymentDate, setDepositPaymentDate] = useState<string>(getTodayIST());
  
  // Confirm Bed for reserved residents
  const [residentToConfirmMoveIn, setResidentToConfirmMoveIn] = useState<Resident | null>(null);
  const [confirmMoveInDate, setConfirmMoveInDate] = useState<string>(getTodayIST());

  const [residentToMarkPaid, setResidentToMarkPaid] = useState<Resident | null>(null);
  const [paidUsing, setPaidUsing] = useState<'UPI' | 'Cash'>('UPI');
  const [isPartialPayment, setIsPartialPayment] = useState<boolean>(false);
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(getTodayIST());
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const reservedResidents = residents.filter(resident => isResidentReserved(resident, floors));
  const todayIST = getTodayIST();
  const vacatingResidents = residents.filter(r => {
    if (r.status === 'reserved' || !r.vacatingDate) return false;
    return r.vacatingDate >= todayIST;
  });
  const initialFilterApplied = React.useRef(isInitialReserved || isInitialVacating);

  React.useEffect(() => {
    const currentSearchFilter = new URLSearchParams(location.search).get('filter');
    const currentRouteState = location.state as any;
    const shouldShowReserved = Boolean(currentRouteState?.showReserved || currentSearchFilter === 'reserved');
    const shouldShowVacating = Boolean(currentRouteState?.showVacatingSoon || currentSearchFilter === 'vacating');

    if (shouldShowReserved) {
      setViewMode('reserved');
      setCurrentSort('all');
      initialFilterApplied.current = true;
      if (currentRouteState?.showReserved) {
        navigate(location.pathname + location.search, { replace: true, state: {} });
      }
      return;
    }

    if (shouldShowVacating) {
      setViewMode('vacating');
      setCurrentSort('vacating');
      initialFilterApplied.current = true;
      if (currentRouteState?.showVacatingSoon) {
        navigate(location.pathname + location.search, { replace: true, state: {} });
      }
      return;
    }

    if (!initialFilterApplied.current && !isDataLoading) {
      initialFilterApplied.current = true;
      if (vacatingResidents.length > 0) {
        setViewMode('vacating');
        setCurrentSort('vacating');
      } else {
        setViewMode('all');
        setCurrentSort('all');
      }
    }
  }, [isDataLoading, location.pathname, location.search, location.state, navigate, vacatingResidents.length]);

  React.useEffect(() => {
    if (isDataLoading) return;
    const currentSearchFilter = new URLSearchParams(location.search).get('filter');
    if (viewMode === 'reserved' && reservedResidents.length === 0 && currentSearchFilter !== 'reserved') {
      setViewMode('all');
      setCurrentSort('all');
    }
  }, [isDataLoading, reservedResidents.length, viewMode, location.search]);

  const getDayAndMonth = (dateString: string) => {
    return formatDate(dateString);
  };

  const { execute: executeVacate, isLoading: isVacating } = useAsyncAction(async (id: string) => {
    await vacateResident(id);
    setResidentToVacate(null);
    setSelectedResident(null);
  });

  const { execute: executeMarkPaid, isLoading: isMarkingPaid } = useAsyncAction(async (id: string, method: string, amount?: number, date?: string) => {
    await markAsPaid(id, method as 'UPI' | 'Cash', amount, date);
    toast.success('Rent marked as paid');
    setResidentToMarkPaid(null);
  });

  const { execute: executeMarkDepositPaid, isLoading: isMarkingDepositPaid } = useAsyncAction(async (id: string, date: string) => {
    await editResident(id, { isDepositPaid: true, depositPaidDate: date });
    toast.success('Security deposit marked as paid');
    setResidentToMarkDepositPaid(null);
  });

  const { execute: executeConfirmMoveIn, isLoading: isConfirmingMoveIn } = useAsyncAction(async (id: string, date: string) => {
    await confirmMoveIn(id, date);
    setResidentToConfirmMoveIn(null);
    setSelectedResident(null);
  });

  const openWhatsAppReminder = (resident: Resident, message: string) => {
    const waUrl = getWhatsAppUrl(resident.phone, message);
    if (!waUrl) {
      toast.error('Invalid Indian mobile number');
      return;
    }

    const whatsappTab = window.open(waUrl, '_blank');
    if (!whatsappTab) {
      toast.error('Your browser blocked the WhatsApp tab. Allow pop-ups for Hostelrr and try again.');
      return;
    }
    toast.success(`Opening WhatsApp for ${resident.name}`);
  };

  const handleSendReminder = (resident: Resident) => {
    if (!resident.phone) {
      toast.error('Resident phone number not available');
      return;
    }
    
    if (!getWhatsAppUrl(resident.phone, '')) {
      toast.error('Invalid phone number');
      return;
    }

    const hostelName = hostelProfile?.hostelName || "My Hostel";
    const { roomName: roomNum } = getNamesFromIds(floors, resident.roomId, resident.bedId);
    const rentAmount = getResidentDueDisplayAmount(resident, floors);
    const dueDateDisplay = resident.dueDate ? getDayAndMonth(resident.dueDate) : 'Today';

    const message = buildRentReminderMessage(hostelProfile?.reminderTemplate, {
      name: resident.name,
      amount: rentAmount,
      room: roomNum,
      dueDate: dueDateDisplay,
      hostelName,
    });

    openWhatsAppReminder(resident, message);
  };

  const handleSendDepositReminder = (resident: Resident) => {
    if (!resident.phone) {
      toast.error('Resident phone number not available');
      return;
    }

    if (!getWhatsAppUrl(resident.phone, '')) {
      toast.error('Invalid phone number');
      return;
    }

    if (!resident.securityDeposit) {
      toast.error('Security deposit amount not available');
      return;
    }

    const hostelName = hostelProfile?.hostelName || 'My Hostel';
    const { roomName: roomNum } = getNamesFromIds(floors, resident.roomId, resident.bedId);
    const message = `Hello ${resident.name}, your security deposit of *₹${resident.securityDeposit.toLocaleString('en-IN')}* for Room ${roomNum} is still pending.\n\nPlease make the payment soon and reply *PAID* once done.\n\nThank you,\n${hostelName}\nPowered by Hostelrr`;

    openWhatsAppReminder(resident, message);
  };

  React.useEffect(() => {
    if (residentToMarkPaid) {
      setPaymentDate(getTodayIST());
    }
  }, [residentToMarkPaid]);

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
    if (mode === 'all') setCurrentSort('all');
    else if (mode === 'floor') setCurrentSort('floor_asc');
    else if (mode === 'room') setCurrentSort('room_asc');
    else if (mode === 'vacating') setCurrentSort('vacating');
    else if (mode === 'reserved') setCurrentSort('all');
  };

  const handleProfileDocumentUpload = async (
    type: 'aadhar' | 'hostelForm' | 'photo',
    file?: File
  ) => {
    if (!file || type !== 'photo' || !selectedResident || !('paymentStatus' in selectedResident)) return;
    if (!hostelProfile?.id) {
      toast.error('Hostel profile not found. Please refresh and try again.');
      return;
    }

    setIsUploadingProfileDoc(true);
    try {
      await uploadResidentPhoto(selectedResident.id, file);
      await syncStateWithDb();

      toast.success(`${type === 'photo' ? 'Photo' : (type === 'aadhar' ? 'Aadhar' : 'Hostel form')} uploaded successfully`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload');
    } finally {
      setIsUploadingProfileDoc(false);
    }
  };

  const handleResidentPhotoRemoval = async () => {
    if (!residentToEdit?.photoPath && !residentToEdit?.photoUrl) return;

    setIsEditingFiles(true);
    try {
      await deleteResidentPhoto(residentToEdit.id);
      await syncStateWithDb();
      setShowPhotoRemovalConfirm(false);
      setResidentEditFiles({});
      setResidentToEdit(null);
      toast.success('Resident photo removed');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove photo');
    } finally {
      setIsEditingFiles(false);
    }
  };

  const handleHistoryDeletion = async () => {
    if (!historyResidentToDelete) return;

    const resident = historyResidentToDelete;
    setDeletingHistoryId(resident.id);
    try {
      const disposition = await deletePastResident(resident.id);
      setSelectedResident(current => current?.id === resident.id ? null : current);
      setHistoryResidentToDelete(null);
      toast.success(disposition === 'anonymized'
        ? 'Personal details removed; required financial records retained'
        : 'Resident history deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete resident history');
    } finally {
      setDeletingHistoryId(null);
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

  const getMockHistory = (resident: Resident | PastResident) => {
    const r = resident as any;
    const rentAmount = getResidentRentAmount(r, floors);
    const history = r.paymentHistory ? [...r.paymentHistory] : [];
    
    if (r.securityDeposit && r.isDepositPaid) {
      history.push({
        id: 'sec_dep',
        // keep raw ISO/timestamp here for reliable sorting and parsing
        date: r.depositPaidDate ? r.depositPaidDate : r.joinDate,
        recordedAt: r.depositPaidDate || r.createdAt,
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
      return [...history, ...mock].sort((a: any, b: any) => getTransactionSortTimestamp(b) - getTransactionSortTimestamp(a));
  };

  // Past residents logic (sorted by recents)
  const sortedPastResidents = [...pastResidents].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.vacateDate).getTime();
    const dateB = new Date(b.createdAt || b.vacateDate).getTime();
    return dateB - dateA;
  });

  let sortedResidents =
    viewMode === 'vacating'
      ? [...vacatingResidents]
      : viewMode === 'reserved'
        ? [...reservedResidents]
        : [...residents];
  if (viewMode === 'all') {
    if (collectsSecurityDeposit) {
      if (currentSort === 'paid') {
        sortedResidents = sortedResidents.filter(r => r.isDepositPaid);
      } else if (currentSort === 'unpaid') {
        sortedResidents = sortedResidents.filter(r => !r.isDepositPaid);
      }
    } else if (currentSort === 'rent_paid') {
      sortedResidents = sortedResidents.filter(r => !isResidentReserved(r, floors) && r.paymentStatus === 'paid');
    } else if (currentSort === 'rent_unpaid') {
      sortedResidents = sortedResidents.filter(r => isResidentReserved(r, floors) || r.paymentStatus !== 'paid');
    }
    
    // Always sort by recent as default behavior
    sortedResidents.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.joinDate).getTime();
      const dateB = new Date(b.createdAt || b.joinDate).getTime();
      return dateB - dateA;
    });
  } else if (viewMode === 'vacating') {
    // Sort by vacating date (nearest first)
    sortedResidents.sort((a, b) => {
      const dateA = new Date(a.vacatingDate || '').getTime();
      const dateB = new Date(b.vacatingDate || '').getTime();
      return dateA - dateB;
    });
  }

  const getStatusPill = (resident: Resident) => {
    if (isResidentReserved(resident, floors)) {
      return null;
    }
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

  const getBedStatusFor = (resident: Resident) => {
    for (const floor of floors) {
      const room = floor.rooms.find(r => r.id === resident.roomId);
      if (room) {
        const bed = room.beds.find(b => b.id === resident.bedId);
        if (bed) return bed.status;
      }
    }
    return 'unknown';
  };

  const renderPastCard = (resident: PastResident) => {
    const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, resident.roomId, resident.bedId);
    const joinDate = formatDate(resident.joinDate);
    const vacateDate = formatDate(resident.vacateDate);

    return (
      <div 
        key={resident.id} 
        onClick={() => setSelectedResident(resident)}
        className="bg-white rounded-2xl p-4 md:p-5 border border-gray-200 shadow-sm flex flex-col gap-3 md:gap-4 opacity-75 hover:opacity-100 transition-all cursor-pointer min-w-0"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-[14px] border-2 border-white bg-slate-100 ring-1 ring-slate-200 shadow-sm">
              {resident.photoPath || resident.photoUrl ? (
                <PrivatePhoto kind="resident" id={resident.id} photoPath={resident.photoPath} fallbackSrc={resident.photoUrl} alt={resident.name} className="h-full w-full object-cover" />
              ) : (
                <DefaultAvatar className="h-full w-full" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-gray-900 leading-tight truncate">{resident.name}</div>
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
            className="min-h-10 min-w-10 p-2 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors shrink-0"
            title="Re-add Resident"
          >
            <UserPlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={deletingHistoryId === resident.id}
            onClick={async (e) => {
              e.stopPropagation();
              setHistoryResidentToDelete(resident);
            }}
            className="min-h-10 min-w-10 p-2 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
            title="Permanently delete history"
            aria-label={`Permanently delete ${resident.name}'s history`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        <div className="text-sm text-gray-500 flex flex-col gap-2 border-b border-gray-100 pb-4 pt-2">
          <div className="flex min-w-0 items-center gap-2"><Phone className="w-4 h-4 text-gray-400 shrink-0" /> <span className="truncate">{resident.phone}</span></div>
          <div className="flex flex-col gap-1.5 mt-1 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
            <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-gray-400" /> <span className="text-xs">Joined: {joinDate}</span></div>
            <div className="flex items-center gap-2"><LogOut className="w-3.5 h-3.5 text-gray-400" /> <span className="text-xs">Left: {vacateDate}</span></div>
          </div>
        </div>
        
        <div className="flex flex-col pt-1">
          <span className="text-xs text-gray-400 font-medium">Reason for leaving</span>
          <span className="text-sm font-medium text-gray-800 break-words">{resident.reason}</span>
        </div>
      </div>
    );
  };

  const renderCard = (resident: Resident) => {
    const { roomName: roomNum, bedName: bedLetter } = getNamesFromIds(floors, resident.roomId, resident.bedId);
    const joinDate = formatDate(resident.joinDate);
    const vacatingOn = resident.vacatingDate ? formatDate(resident.vacatingDate) : null;
    const rentAmount = getResidentDueDisplayAmount(resident, floors);
    const bedStatus = getBedStatusFor(resident);

    return (
      <div 
        key={resident.id} 
        onClick={() => setSelectedResident(resident)}
        className="bg-white rounded-2xl p-4 md:p-5 border border-gray-200 shadow-sm flex flex-col gap-3 md:gap-4 transition-all hover:shadow-md cursor-pointer min-w-0"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ResidentAvatar resident={resident} floors={floors} className="h-12 w-12" dotClassName="h-3 w-3" />
          <div className="min-w-0">
            <div className="font-bold text-gray-900 leading-tight truncate">{resident.name}</div>
            <div className="text-sm text-gray-500 mt-1">Room {roomNum} · {bedLetter}</div>
            {vacatingOn && (
              <div className="mt-2">
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-md">VACATING</span>
              </div>
            )}
            {bedStatus === 'reserved' && (
              <div className="mt-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-md">RESERVED</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="text-sm text-gray-500 flex flex-col gap-1.5 border-b border-gray-100 pb-4 pt-2">
          <div className="flex min-w-0 items-center gap-2"><Phone className="w-4 h-4 text-gray-400 shrink-0" /> <span className="truncate">{resident.phone}</span></div>
          <div className="text-gray-400 pl-6">Joined {joinDate}</div>
          {vacatingOn && <div className="text-orange-600 pl-6 font-medium">Vacating on {vacatingOn}</div>}
        </div>
        
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="font-bold text-gray-900">₹{rentAmount.toLocaleString('en-IN')}/mo</div>
          {getStatusPill(resident)}
        </div>
      </div>
    );
  };

  const renderGrid = (list: Resident[]) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {list.map(renderCard)}
      </div>
    );
  };

  const renderContent = () => {
    if (showHistory) {
      if (sortedPastResidents.length === 0) {
        return (
          <EmptyState 
            icon={History}
            title="No history yet"
            subtitle="Past residents appear here after they leave. Personal details and photos are removed after two calendar months; required financial records are retained."
          />
        );
      }
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Resident personal details and photos are removed two calendar months after departure or archive. Required financial records remain. You can also remove an individual resident from History using its trash button.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {sortedPastResidents.map(res => renderPastCard(res))}
          </div>
        </div>
      );
    }

    if (sortedResidents.length === 0) {
      return (
        <EmptyState 
          icon={Users}
          title="No residents found"
          subtitle="There are no residents matching your current filters."
          action={{
            label: "Add Resident",
            onClick: () => window.dispatchEvent(new CustomEvent('open-add-resident-modal'))
          }}
        />
      );
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
        <div className="space-y-8 md:space-y-10">
          {sortedFloorNames.map((floorName) => {
            const resList = floorGroups[floorName];
            if (resList.length === 0) return null;
            
            const floorObj = floors.find(f => f.name === floorName);
            const totalBeds = floorObj?.rooms.reduce((acc, r) => acc + r.beds.length, 0) || 0;
            const allocatedCount = residents.filter(r => floorObj?.rooms.some(rm => rm.id === r.roomId)).length;

            return (
              <div key={floorName}>
                <div className="flex justify-between items-end gap-3 mb-4 pb-2 border-b border-gray-200">
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
                    <div key={roomName} className="mb-6 md:mb-8 last:mb-0">
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
        <div className="space-y-8 md:space-y-10">
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
                <div className="flex justify-between items-end gap-3 mb-4 pb-2 border-b border-gray-200">
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

    if (viewMode === 'vacating') {
      return renderGrid(sortedResidents);
    }

    if (viewMode === 'reserved') {
      return renderGrid(sortedResidents);
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
  const depositFilterCounts = {
    all: residents.length,
    paid: residents.filter(r => r.isDepositPaid).length,
    unpaid: residents.filter(r => !r.isDepositPaid).length,
  };
  const rentFilterCounts = {
    paid: residents.filter(r => !isResidentReserved(r, floors) && r.paymentStatus === 'paid').length,
    unpaid: residents.filter(r => isResidentReserved(r, floors) || r.paymentStatus !== 'paid').length,
  };

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-7xl mx-auto md:h-[calc(100dvh-4rem)] overflow-x-hidden md:overflow-hidden flex flex-col relative w-full min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5 md:mb-8 shrink-0 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mb-1">Residents</h1>
          <p className="text-sm sm:text-base text-gray-500">Manage all your hostel residents.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "min-h-11 justify-center px-4 md:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2",
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
            className="min-h-11 justify-center bg-[#1D4ED8] hover:bg-[#1e40af] text-white px-4 md:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2 hover:shadow-md"
          >
            <Plus className="w-4 h-4" /> Add Resident
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 mb-5 md:mb-6 shrink-0 min-w-0">
        {/* Toggle Buttons */}
        <div className={cn("bg-gray-100/80 p-1.5 rounded-[14px] flex gap-1.5 items-center justify-start overflow-x-auto w-full sm:w-auto border border-gray-200/60 shadow-sm no-scrollbar", showHistory ? "hidden sm:invisible" : "visible")}>
          {([
            ...(reservedResidents.length > 0 || viewMode === 'reserved' ? ['reserved'] : []),
            'vacating',
            'all',
            'floor',
            'room',
          ] as ViewMode[]).map((mode) => {
            let countNum = 0;
            if (mode === 'all') countNum = residents.length;
            if (mode === 'floor') countNum = floors.length;
            if (mode === 'room') countNum = floors.reduce((acc, f) => acc + f.rooms.length, 0);
            if (mode === 'vacating') countNum = vacatingResidents.length;
            if (mode === 'reserved') countNum = reservedResidents.length;

            return (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                className={cn(
                  "min-h-10 px-4 md:px-5 py-2 rounded-xl text-sm md:text-[15px] font-semibold transition-all capitalize flex items-center gap-2.5 whitespace-nowrap",
                  viewMode === mode 
                    ? "bg-white text-blue-700 shadow-md ring-1 ring-black/5" 
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
                )}
              >
                {mode === 'all'
                  ? 'All'
                  : mode === 'vacating'
                    ? 'Vacating Soon'
                    : mode === 'reserved'
                      ? 'Reserved'
                      : `${mode} wise`}
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
          <div className="relative w-full sm:w-auto">
            <select
              value={currentSort}
              onChange={(e) => setCurrentSort(e.target.value)}
              className="appearance-none w-full sm:w-48 bg-white border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-2.5 pr-10 text-sm font-medium outline-none transition-all cursor-pointer shadow-sm text-gray-700"
            >
              {viewMode === 'all' && (
                collectsSecurityDeposit ? <>
                  <option value="all">Deposit: All ({depositFilterCounts.all})</option>
                  <option value="paid">Deposit: Paid ({depositFilterCounts.paid})</option>
                  <option value="unpaid">Deposit: Unpaid ({depositFilterCounts.unpaid})</option>
                </> : <>
                  <option value="all">Rent: All ({residents.length})</option>
                  <option value="rent_paid">Rent: Paid ({rentFilterCounts.paid})</option>
                  <option value="rent_unpaid">Rent: Unpaid ({rentFilterCounts.unpaid})</option>
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

      {viewMode === 'reserved' && !showHistory && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3.5 text-sm text-blue-900">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-600">
            <BedDouble className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold">Reserved beds are not occupied or vacant yet</p>
            <p className="mt-1 text-xs leading-5 text-blue-700/80">
              These residents have a bed held for them, but move-in confirmation is pending. Confirm move-in to activate rent billing and occupancy.
            </p>
          </div>
        </div>
      )}

      {/* Grid Content */}
      <div className={cn(
        "flex-1 overflow-y-visible md:overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12 pr-0 md:pr-2 custom-scrollbar transition-all duration-300 min-w-0"
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
            className="w-full sm:w-[440px] bg-[#f8fafc] border-l border-slate-200/80 shadow-[-18px_0_50px_rgba(15,23,42,0.12)] h-dvh sm:h-[calc(100dvh-4rem)] fixed right-0 top-0 sm:top-16 z-50 sm:z-30 flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 sm:px-6 border-b border-slate-200/80 flex justify-between items-center gap-3 bg-white shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Resident profile</p>
                <h2 className="mt-0.5 text-lg sm:text-xl font-extrabold tracking-tight text-slate-950 truncate">{selectedResident.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                {('paymentStatus' in selectedResident) && (
                  <button
                    onClick={() => setResidentToEdit(selectedResident as Resident)}
                    className="min-h-10 px-3.5 text-[13px] font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-950 rounded-xl transition-all"
                  >
                    Edit
                  </button>
                )}
                <button 
                  onClick={() => setSelectedResident(null)}
                  aria-label="Close resident profile"
                  className="min-h-10 min-w-10 p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="flex min-w-0 items-center gap-4">
                <div className="relative group">
                  <ResidentAvatar resident={selectedResident as Resident} floors={floors} className="h-16 w-16" dotClassName="h-3.5 w-3.5" />
                  {('paymentStatus' in selectedResident) && (
                    <div className="absolute inset-0">
                        <label className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <Plus className="w-6 h-6 text-white" />
                          <input 
                            type="file" 
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden" 
                            disabled={isUploadingProfileDoc}
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0];
                              if (file && file.size > MAX_RESIDENT_PHOTO_SIZE) {
                                e.currentTarget.value = '';
                                toast.error('Photo must be 1 MB or smaller.');
                                return;
                              }
                              void handleProfileDocumentUpload('photo', file);
                            }}
                          />
                        </label>
                      </div>
                  )}
                  {isUploadingProfileDoc && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-950 flex flex-wrap items-center gap-2">
                    {selectedResident.name}
                    {('paymentStatus' in selectedResident) && selectedResident.status !== 'reserved' && selectedResident.vacatingDate && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold tracking-wider rounded-md">VACATING</span>
                    )}
                    {selectedBedStatus === 'reserved' && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold tracking-wider rounded-md">RESERVED</span>
                    )}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Room {getNamesFromIds(floors, selectedResident.roomId, selectedResident.bedId).roomName} <span className="text-slate-300 px-1">•</span> Bed {getNamesFromIds(floors, selectedResident.roomId, selectedResident.bedId).bedName}</p>
                  {('paymentStatus' in selectedResident) && selectedResident.status !== 'reserved' && selectedResident.vacatingDate && (
                    <p className="text-xs text-orange-700 font-bold mt-1.5">Vacating on {formatDate(selectedResident.vacatingDate)}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <a href={`tel:${selectedResident.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100">
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a href={`https://wa.me/${(selectedResident.phone || '').replace(/[^0-9]/g, '').startsWith('91') && (selectedResident.phone || '').replace(/[^0-9]/g, '').length === 12 ? (selectedResident.phone || '').replace(/[^0-9]/g, '') : ((selectedResident.phone || '').replace(/[^0-9]/g, '').length === 10 ? '91' + (selectedResident.phone || '').replace(/[^0-9]/g, '') : (selectedResident.phone || '').replace(/[^0-9]/g, ''))}`} target="_blank" rel="noopener noreferrer" className="min-h-11 flex items-center justify-center gap-2 px-4 py-2 bg-[#28a745] hover:bg-[#218838] text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
                  <WhatsAppIcon className="w-5 h-5" /> WhatsApp
                </a>
              </div>
              </section>

              {('paymentStatus' in selectedResident) && (selectedResident as Resident).status === 'reserved' && (
                <button
                  onClick={() => setResidentToConfirmMoveIn(selectedResident as Resident)}
                  className="min-h-11 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
                >
                  Confirm Bed
                </button>
              )}

              {/* Status Section */}
              {('paymentStatus' in selectedResident) && selectedResident.status !== 'reserved' && (
                <ResidentStatusCard
                  resident={selectedResident as Resident}
                  rentAmount={getResidentDueDisplayAmount(selectedResident as Resident, floors)}
                  onSendReminder={() => handleSendReminder(selectedResident as Resident)}
                  onMarkPaid={() => {
                    setResidentToMarkPaid(selectedResident as Resident);
                    setPaidUsing('UPI');
                    setIsPartialPayment(false);
                    setPartialAmount('');
                    setPaymentDate(getTodayIST());
                  }}
                  onSendDepositReminder={() => handleSendDepositReminder(selectedResident as Resident)}
                  onMarkDepositPaid={() => {
                    setResidentToMarkDepositPaid(selectedResident as Resident);
                    setDepositPaymentMethod('UPI');
                    setDepositPaymentDate(getTodayIST());
                  }}
                  isSendingReminder={isSendingReminder}
                  isMarkingPayment={isMarkingPaid}
                  isMarkingDeposit={isMarkingDepositPaid}
                />
              )}

              <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1">
                <button
                  onClick={() => setProfileTab('info')}
                  className={cn(
                    "py-2.5 text-sm font-bold rounded-lg transition-all",
                    profileTab === 'info' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  Overview
                </button>
                <button
                  onClick={() => setProfileTab('payment')}
                  className={cn(
                    "py-2.5 text-sm font-bold rounded-lg transition-all",
                    profileTab === 'payment' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  Payment History
                </button>
              </div>

              {profileTab === 'info' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-extrabold text-slate-950">Resident details</h4>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Personal</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80">
                      <span className="flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-[0.08em] mb-1.5"><Phone className="w-3.5 h-3.5" /> Phone</span>
                      <span className="text-sm font-bold tabular-nums text-slate-900">{selectedResident.phone}</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200/80">
                      <span className="flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-[0.08em] mb-1.5"><Calendar className="w-3.5 h-3.5" /> Joined</span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatDate(selectedResident.joinDate)}
                      </span>
                    </div>
                    {('paymentStatus' in selectedResident) && selectedResident.status !== 'reserved' && selectedResident.vacatingDate && (
                      <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 sm:col-span-2">
                        <span className="flex items-center gap-2 text-[11px] text-orange-700 font-bold uppercase tracking-[0.08em] mb-1.5"><LogOut className="w-3.5 h-3.5" /> Vacating On</span>
                        <span className="text-sm font-bold text-orange-800">
                          {formatDate(selectedResident.vacatingDate)}
                        </span>
                      </div>
                    )}
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
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5"><IndianRupee className="w-4 h-4" /> Monthly Rent</span>
                        <span className="text-sm font-semibold text-gray-900">₹{getResidentRentAmount(selectedResident as Resident, floors).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5">🏛️ State</span>
                      <span className="text-sm font-semibold text-gray-900">{(selectedResident as any).state || 'Not provided'}</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <span className="flex items-center gap-2 text-xs text-gray-500 font-medium mb-1.5">🌍 Country</span>
                      <span className="text-sm font-semibold text-gray-900">{(selectedResident as any).country || 'India'}</span>
                    </div>
                  </div>
                </div>
              )}

              {profileTab === 'payment' && (
                <div className="space-y-6">
                  {/* Payment History Section */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-slate-950">Payment History</h4>
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Transactions</span>
                    </div>
                    {(() => {
                      const history = getMockHistory(selectedResident as Resident);
                      if (history.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-10 px-4 text-center">
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                              <FileText className="w-6 h-6 text-slate-400" />
                            </div>
                            <p className="text-sm font-bold text-slate-900 mb-1">No payment history</p>
                            <p className="text-xs text-slate-500">No payments have been recorded for this resident.</p>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          {history.map(historyItem => (
                            <div key={historyItem.id} className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-xl transition-colors cursor-pointer group border-l-4", historyItem.status === 'partial' ? "border-l-purple-500 bg-purple-50/50 hover:border-purple-300 border-gray-200" : "bg-white hover:border-blue-300 border-gray-200 border-l-transparent")}>
                              <div className="flex min-w-0 items-center gap-3">
                                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", historyItem.status === 'partial' ? "bg-purple-100 text-purple-600" : "bg-green-50 text-green-600")}>
                                  <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">{historyItem.title || 'Rent Payment'}</p>
                                  <p className="text-xs text-gray-500">Paid on {getTransactionDateForDisplay(historyItem.date)}</p>
                                </div>
                              </div>
                              <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
                                <span className="text-sm font-bold text-gray-900">₹{historyItem.amount.toLocaleString('en-IN')}</span>
                                <span className={cn("text-xs font-semibold flex items-center gap-1", historyItem.status === 'partial' ? "text-purple-600" : "text-green-600")}>
                                  {historyItem.status === 'partial' ? 'Partial' : 'Successful'}
                                  {historyItem.method && <span className={historyItem.status === 'partial' ? "bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md text-[10px]" : "bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-[10px]"}>{historyItem.method}</span>}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
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
                    className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-700 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col relative"
            >
              <button 
                onClick={() => setResidentToVacate(null)}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="p-5 sm:p-6 pb-0">
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <LogOut className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Vacate Resident?</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed">
                  Are you sure you want to vacate <strong>{residentToVacate.name}</strong> from Room {getNamesFromIds(floors, residentToVacate.roomId, undefined).roomName}? This action will permanently remove them from the active residents list.
                </p>
              </div>

              <div className="p-4 sm:p-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 mt-2">
                <button 
                  onClick={() => setResidentToVacate(null)}
                  className="w-full sm:w-auto min-h-11 px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => executeVacate(residentToVacate.id)}
                  disabled={isVacating}
                  className="w-full sm:w-auto min-h-11 justify-center px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isVacating ? 'Vacating...' : 'Confirm Vacate'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {residentToConfirmMoveIn && (
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
                        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col relative"
                      >
                        <button 
                          onClick={() => setResidentToConfirmMoveIn(null)}
                          className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
                        >
                          <X className="w-5 h-5" />
                        </button>
              
                        <div className="p-5 sm:p-6 pb-0">
                          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Bed?</h3>
                          <p className="text-gray-500 text-[15px] leading-relaxed">
                            Confirm that <strong>{residentToConfirmMoveIn.name}</strong> has moved into <strong>{getNamesFromIds(floors, residentToConfirmMoveIn.roomId, residentToConfirmMoveIn.bedId).roomName} • Bed {getNamesFromIds(floors, residentToConfirmMoveIn.roomId, residentToConfirmMoveIn.bedId).bedName}</strong>. This will activate billing and create the first payment cycle.
                          </p>
                        </div>

                        <div className="p-4 sm:p-6 bg-blue-50 border-t border-blue-100 space-y-3 mt-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-900 block">Move-In Date</label>
                            <input 
                              type="date" 
                              value={confirmMoveInDate}
                              onChange={(e) => setConfirmMoveInDate(e.target.value)}
                              className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all"
                            />
                          </div>
                        </div>

                        <div className="p-4 sm:p-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                          <button 
                            onClick={() => setResidentToConfirmMoveIn(null)}
                            className="w-full sm:w-auto min-h-11 px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => {
                              if (isConfirmingMoveIn || !residentToConfirmMoveIn || residentToConfirmMoveIn.status !== 'reserved') return;
                              executeConfirmMoveIn(residentToConfirmMoveIn.id, confirmMoveInDate);
                            }}
                            disabled={isConfirmingMoveIn || !residentToConfirmMoveIn || residentToConfirmMoveIn.status !== 'reserved'}
                            className="w-full sm:w-auto min-h-11 justify-center px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                          >
                            {isConfirmingMoveIn ? 'Confirming...' : 'Confirm Bed'}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {residentToEdit && (
          <>
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
              className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col relative"
            >
              <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Edit Resident Profile</h3>
                <button 
                  onClick={() => {
                    setResidentToEdit(null);
                    setResidentEditFiles({});
                  }}
                  className="min-h-10 min-w-10 p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const normalizePhone = (value: FormDataEntryValue | null) => {
                  const digits = String(value ?? '').replace(/\D/g, '');
                  return digits.length > 10 ? digits.slice(-10) : digits;
                };
                const normalizedPhone = normalizePhone(formData.get('phone'));
                const normalizedEmergencyPhone = normalizePhone(formData.get('emergencyPhone'));
                
                setIsEditingFiles(true);
                try {
                  if (residentEditFiles.photo && residentToEdit) {
                    await uploadResidentPhoto(residentToEdit.id, residentEditFiles.photo);
                  }

                  await editResident(residentToEdit!.id, {
                    name: formData.get('name'),
                    phone: normalizedPhone,
                    aadhar: formData.get('aadhar'),
                    emergencyPhone: normalizedEmergencyPhone,
                    areaAndCity: formData.get('areaAndCity'),
                    state: formData.get('state'),
                    country: formData.get('country'),
                    monthlyRent: formData.get('monthlyRent') ? parseInt(formData.get('monthlyRent') as string, 10) : undefined,
                    securityDeposit: formData.get('securityDeposit') ? parseInt(formData.get('securityDeposit') as string, 10) : undefined,
                    vacatingDate: residentToEdit!.status === 'reserved' ? null : formData.get('vacatingDate') || undefined,
                  });
                  setResidentToEdit(null);
                  setResidentEditFiles({});
                  toast.success('Resident updated successfully');
                  if (selectedResident && selectedResident.id === residentToEdit!.id) {
                    setSelectedResident(prev => prev ? {
                      ...prev, 
                      name: formData.get('name') as string, 
                      phone: normalizedPhone,
                      aadhar: formData.get('aadhar') as string,
                      emergencyPhone: normalizedEmergencyPhone,
                      areaAndCity: formData.get('areaAndCity') as string,
                      state: formData.get('state') as string,
                      country: formData.get('country') as string,
                      monthlyRent: formData.get('monthlyRent') ? parseInt(formData.get('monthlyRent') as string, 10) : ('monthlyRent' in prev ? (prev as Resident).monthlyRent : undefined),
                      dueAmount: formData.get('monthlyRent') ? parseInt(formData.get('monthlyRent') as string, 10) : ('dueAmount' in prev ? prev.dueAmount : 0),
                      securityDeposit: formData.get('securityDeposit') ? parseInt(formData.get('securityDeposit') as string, 10) : ('securityDeposit' in prev ? prev.securityDeposit : undefined),
                    } as Resident : null);
                  }
                } catch (error: any) {
                  toast.error(error?.message || 'Failed to update resident');
                } finally {
                  setIsEditingFiles(false);
                }
              }} className="flex-1 p-4 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" name="name" defaultValue={residentToEdit.name} required className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                </div>

                <div className="grid grid-cols-1 gap-4 pt-1">
                  {[
                    { label: 'Photo', key: 'photo', icon: ImageIcon, current: residentToEdit.photoPath || residentToEdit.photoUrl, accept: 'image/jpeg,image/png,image/webp' },
                  ].map((file) => (
                    <div key={file.key} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 bg-gray-50 border border-gray-100 rounded-2xl">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-400">
                          <file.icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{file.label}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">JPG, PNG or WebP · up to 1 MB</p>
                          {(file.current || residentEditFiles[file.key as keyof typeof residentEditFiles]) && (
                            <p className="text-[11px] text-green-600 font-bold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" /> {residentEditFiles[file.key as keyof typeof residentEditFiles] ? 'New file selected' : 'Uploaded'}
                            </p>
                          )}
                          {file.current && !residentEditFiles[file.key as keyof typeof residentEditFiles] && (
                            <button
                              type="button"
                              disabled={isEditingFiles}
                              onClick={() => setShowPhotoRemovalConfirm(true)}
                              className="mt-1 text-[11px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                            >
                              Remove photo
                            </button>
                          )}
                        </div>
                      </div>
                      <label className="relative inline-flex min-h-10 items-center justify-center px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-bold text-gray-700 shadow-sm cursor-pointer transition-all hover:bg-gray-50">
                        {file.current || residentEditFiles[file.key as keyof typeof residentEditFiles] ? 'Replace' : 'Upload'}
                        <input 
                          type="file" 
                          accept={file.accept}
                          className="sr-only" 
                          onChange={(e) => {
                            const selectedFile = e.currentTarget.files?.[0];
                            if (selectedFile && selectedFile.size > MAX_RESIDENT_PHOTO_SIZE) {
                              e.currentTarget.value = '';
                              toast.error('Photo must be 1 MB or smaller.');
                              return;
                            }
                            if (selectedFile) {
                              setResidentEditFiles(prev => ({ ...prev, [file.key]: selectedFile }));
                            }
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Phone No. <span className="text-red-500">*</span></label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 text-sm font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      defaultValue={(residentToEdit.phone || '').replace(/\D/g, '').slice(-10)}
                      required
                      inputMode="numeric"
                      pattern="\d{10}"
                      minLength={10}
                      maxLength={10}
                      title="Phone number must be exactly 10 digits"
                      onInput={(e) => {
                        const input = e.currentTarget;
                        input.value = input.value.replace(/\D/g, '').slice(0, 10);
                      }}
                      className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-r-xl px-4 py-3 text-sm outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Aadhar No.</label>
                  <input type="text" name="aadhar" defaultValue={residentToEdit.aadhar || ''} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">State</label>
                    <input type="text" name="state" defaultValue={(residentToEdit as any).state || ''} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 block">Country</label>
                    <input type="text" name="country" defaultValue={(residentToEdit as any).country || 'India'} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Emergency Contact</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-white text-gray-500 text-sm font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      name="emergencyPhone"
                      defaultValue={(residentToEdit.emergencyPhone || '').replace(/\D/g, '').slice(-10)}
                      inputMode="numeric"
                      pattern="\d{10}"
                      minLength={10}
                      maxLength={10}
                      title="Emergency number must be exactly 10 digits when provided"
                      onInput={(e) => {
                        const input = e.currentTarget;
                        input.value = input.value.replace(/\D/g, '').slice(0, 10);
                      }}
                      className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-r-xl px-4 py-3 text-sm outline-none transition-all"
                    />
                  </div>
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

                {collectsSecurityDeposit && <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Security Deposit</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <IndianRupee className="h-4 w-4 text-gray-500" />
                    </div>
                    <input type="number" name="securityDeposit" defaultValue={(residentToEdit as any).securityDeposit ?? 0} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-9 pr-4 py-3 text-sm outline-none transition-all" />
                  </div>
                </div>}

                {residentToEdit.status !== 'reserved' && <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-900 block">Vacating Date <span className="text-gray-400">(Optional)</span></label>
                  <input type="date" name="vacatingDate" defaultValue={residentToEdit.vacatingDate || ''} className="w-full border border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl px-4 py-3 text-sm outline-none transition-all" />
                  <p className="text-xs text-gray-500">For future planning only.</p>
                </div>}

                <div className="pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 sticky bottom-0 bg-white border-t border-gray-100 mt-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-[env(safe-area-inset-bottom)]">
                  <button 
                    type="button"
                    onClick={() => {
                      setResidentToEdit(null);
                      setResidentEditFiles({});
                    }}
                    disabled={isEditingFiles}
                    className="w-full sm:w-auto min-h-11 px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isEditingFiles}
                    className="w-full sm:w-auto min-h-11 justify-center px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isEditingFiles ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPhotoRemovalConfirm && residentToEdit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm sm:p-4"
            onClick={() => !isEditingFiles && setShowPhotoRemovalConfirm(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="remove-resident-photo-title"
              aria-describedby="remove-resident-photo-description"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative z-10 w-full max-w-md rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="p-5 sm:p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h2 id="remove-resident-photo-title" className="mb-2 text-xl font-bold text-gray-900">Remove resident photo?</h2>
                <p id="remove-resident-photo-description" className="text-sm leading-relaxed text-gray-600">
                  Remove the photo for <strong>{residentToEdit.name}</strong>? Resident record stays intact. The photo object is queued for reference-aware cleanup.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:justify-end">
                <button type="button" disabled={isEditingFiles} onClick={() => setShowPhotoRemovalConfirm(false)} className="min-h-11 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="button" disabled={isEditingFiles} onClick={() => void handleResidentPhotoRemoval()} className="min-h-11 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50">
                  {isEditingFiles ? 'Removing…' : 'Remove photo'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyResidentToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm sm:p-4"
            onClick={() => !deletingHistoryId && setHistoryResidentToDelete(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-history-title"
              aria-describedby="delete-history-description"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative z-10 w-full max-w-md rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="p-5 sm:p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h2 id="delete-history-title" className="mb-2 text-xl font-bold text-gray-900">Delete resident from History?</h2>
                <p id="delete-history-description" className="text-sm leading-relaxed text-gray-600">
                  Remove <strong>{historyResidentToDelete.name}</strong>'s personal details and photo reference. Required financial records stay, with personal details removed. This action cannot be undone.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:justify-end">
                <button type="button" disabled={deletingHistoryId === historyResidentToDelete.id} onClick={() => setHistoryResidentToDelete(null)} className="min-h-11 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="button" disabled={deletingHistoryId === historyResidentToDelete.id} onClick={() => void handleHistoryDeletion()} className="min-h-11 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50">
                  {deletingHistoryId === historyResidentToDelete.id ? 'Deleting…' : 'Delete from History'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MarkDepositPaidModal
        resident={residentToMarkDepositPaid}
        isOpen={!!residentToMarkDepositPaid}
        onClose={() => setResidentToMarkDepositPaid(null)}
        depositPaymentDate={depositPaymentDate}
        onPaymentDateChange={setDepositPaymentDate}
        depositPaymentMethod={depositPaymentMethod}
        onPaymentMethodChange={setDepositPaymentMethod}
        onConfirm={() => {
          if (residentToMarkDepositPaid) {
            executeMarkDepositPaid(residentToMarkDepositPaid.id, depositPaymentDate);
          }
        }}
        isLoading={isMarkingDepositPaid}
      />

      <MarkRentPaidModal
        resident={residentToMarkPaid}
        isOpen={!!residentToMarkPaid}
        onClose={() => {
          setResidentToMarkPaid(null);
          setPaidUsing('UPI');
          setIsPartialPayment(false);
          setPartialAmount('');
          setPaymentDate(getTodayIST());
        }}
        paidUsing={paidUsing}
        onPaymentMethodChange={setPaidUsing}
        isPartialPayment={isPartialPayment}
        onPartialPaymentChange={setIsPartialPayment}
        partialAmount={partialAmount}
        onPartialAmountChange={setPartialAmount}
        paymentDate={paymentDate}
        onPaymentDateChange={setPaymentDate}
        floors={floors}
        onConfirm={() => {
          if (residentToMarkPaid) {
            const amountToPay = isPartialPayment && partialAmount ? Number(partialAmount) : undefined;
            executeMarkPaid(residentToMarkPaid.id, paidUsing, amountToPay, isPartialPayment ? paymentDate : undefined);
          }
        }}
        isLoading={isMarkingPaid}
      />
    </div>
  );
}
