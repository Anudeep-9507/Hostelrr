import React, { createContext, useContext, useState } from 'react';
import {
  Floor, Resident, PastResident, Bed, JoinRequest,
  MOckFloors, MockResidents, MockPastResidents, MockActivities, MockJoinRequests
} from '../data/mock';
import { toast } from 'sonner';
import { FLAGS } from '../core/env';
import { compareBedLabels, getResidentPaymentStateForDate, getResidentDueDisplayAmount, getRoomBaseRent, getTodayIST } from '../lib/utils';

export type PaymentsFilterType = 'All' | 'Paid' | 'Unpaid' | 'Pending' | 'Late' | 'Partially Paid';

interface AppContextType {
  floors: Floor[];
  residents: Resident[];
  pastResidents: PastResident[];
  activities: any[];
  joinRequests: JoinRequest[];
  markAsPaid: (residentId: string, method?: 'UPI' | 'Cash', partialAmount?: number, paymentDate?: string) => void;
  vacateResident: (residentId: string) => void;
  archiveResident: (residentId: string, reason?: string) => void;
  deletePastResident: (residentId: string) => Promise<'deleted' | 'anonymized'>;
  addResident: (residentData: any, isReserved?: boolean) => void;
  confirmMoveIn: (residentId: string, confirmedDate?: string) => void;
  editResident: (residentId: string, updatedData: any) => Promise<void>;
  removeJoinRequest: (requestId: string) => void;
  approveJoinRequest: (params: {
    requestId: string;
    roomId: string;
    bedId: string;
    monthlyRent: number;
    joinDate?: string;
    securityDeposit?: number;
    isDepositPaid?: boolean;
    stayDurationDays?: number | null;
    vacatingDate?: string;
    reviewNotes?: string | null;
  }) => Promise<void>;
  rejectJoinRequest: (requestId: string, reviewNotes?: string) => void;
  addJoinRequest: (request: Omit<JoinRequest, 'id' | 'requestDate' | 'status'>) => void;
  activeBuildingFilter: Bed['status'] | 'all';
  setActiveBuildingFilter: (filter: Bed['status'] | 'all') => void;
  activePaymentsFilter: PaymentsFilterType;
  setActivePaymentsFilter: (filter: PaymentsFilterType) => void;
  globalSelectedResidentId: string | null;
  setGlobalSelectedResidentId: (id: string | null) => void;
  globalSelectedRoomId: string | null;
  setGlobalSelectedRoomId: (id: string | null) => void;
  addRoom: (floorId: string, roomData: { number: string; numBeds: number; baseRent?: string; layoutId?: string }) => void;
  editRoomBeds: (floorId: string, roomId: string, numBeds: number, layoutId?: string) => void;
  updateRoomSetup: (floorId: string, roomId: string, numBeds: number, baseRent: number, newNumber?: string, layoutId?: string) => void;
  moveBeds: (sourceRoomId: string, targetRoomId: string, bedIdsToMove: string[]) => Promise<void>;
  deleteRoom: (floorId: string, roomId: string) => void;
  copyFloorLayout: (sourceFloorId: string, targetFloorId: string) => void;
  isOnboardingComplete: boolean;
  completeOnboarding: (data: any) => void;
  isDemoMode: boolean;
  toggleDemoMode: (enabled: boolean) => void;
  showBedLayout: boolean;
  setShowBedLayout: (v: boolean) => void;
  sharingRentMap: Record<number, number>;
  securityDeposit: number;
  hostelProfile: any;
  dashboardStats: Record<string, any> | null;
  subscriptionOverview: any | null;
  updateHostelProfile: (profile: any) => void;
  syncStateWithDb: () => Promise<void>;
  isDataLoading: boolean;
  dataFetchError: boolean;
  retryDataFetch: () => void;
  authLoading: boolean;
  session: any | null;
  isSupportModalOpen: boolean;
  setIsSupportModalOpen: (open: boolean) => void;
  openSupportModal: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const openSupportModal = () => setIsSupportModalOpen(true);
  const isOnboardingCompleteInitial = false;
  const [isDemoMode, setIsDemoMode] = useState(() => FLAGS.demoMode);

  const [floors, setFloors] = useState<Floor[]>(() => {
    if (!isOnboardingCompleteInitial) return MOckFloors;
    const rawData = localStorage.getItem('hostelrr_onboarding_data');
    if (rawData) {
      try {
        const data = JSON.parse(rawData);
        const floorCount = data.numFloors || 1;
        const newFloors: any[] = [];
        for (let f = 1; f <= floorCount; f++) {
          const rooms: any[] = [];
          const roomCountThisFloor = data.roomsPerFloor?.[f]
            ? parseInt(data.roomsPerFloor[f])
            : Math.ceil((data.numRooms || 0) / floorCount);
          for (let r = 1; r <= roomCountThisFloor; r++) {
            const roomNumStr = `${f}${String(r).padStart(2, '0')}`;
            rooms.push({ id: `r${roomNumStr}`, number: roomNumStr, baseRent: undefined, beds: [] });
          }
          newFloors.push({ id: `f${f}`, level: f, name: `Floor ${f}`, rooms });
        }
        return newFloors;
      } catch { return []; }
    }
    return [];
  });

  const [residents, setResidents] = useState<Resident[]>(!isOnboardingCompleteInitial ? MockResidents : []);
  const [pastResidents, setPastResidents] = useState<PastResident[]>(!isOnboardingCompleteInitial ? MockPastResidents : []);
  const [activities, setActivities] = useState<any[]>(!isOnboardingCompleteInitial ? MockActivities : []);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>(!isOnboardingCompleteInitial ? MockJoinRequests : []);

  const [activeBuildingFilter, setActiveBuildingFilter] = useState<Bed['status'] | 'all'>('all');
  const [activePaymentsFilter, setActivePaymentsFilter] = useState<PaymentsFilterType>('All');
  const [globalSelectedResidentId, setGlobalSelectedResidentId] = useState<string | null>(null);
  const [globalSelectedRoomId, setGlobalSelectedRoomId] = useState<string | null>(null);

  // Load sharing→rent map from localStorage (populated on onboarding)
  const [sharingRentMap, setSharingRentMap] = React.useState<Record<number, number>>(() => {
    try {
      const raw = localStorage.getItem('hostelrr_sharing_rent_map');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [securityDeposit, setSecurityDeposit] = React.useState<number>(() => {
    try {
      const profile = localStorage.getItem('hostelrr_profile');
      if (profile) {
        const parsed = JSON.parse(profile);
        return parsed.securityDeposit || 0;
      }
    } catch { }
    return 0;
  });

  const [hostelProfile, setHostelProfile] = React.useState<any>(() => {
    try {
      const raw = localStorage.getItem('hostelrr_profile');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [dashboardStats, setDashboardStats] = React.useState<Record<string, any> | null>(null);
  const [subscriptionOverview, setSubscriptionOverview] = React.useState<any | null>(null);

  React.useEffect(() => {
    const subscription = subscriptionOverview?.subscription;
    if (!subscription || subscriptionOverview.writable !== true) return;
    const trialEnd = Date.parse(subscription.trial_ends_at || '');
    const paidEnd = Date.parse(subscription.current_period_end || '');
    const expiresAt = subscription.status === 'active' && Number.isFinite(paidEnd)
      ? Math.max(Number.isFinite(trialEnd) ? trialEnd : 0, paidEnd)
      : trialEnd;
    const delay = expiresAt - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      setSubscriptionOverview((current: any) => current ? { ...current, writable: false } : current);
      return;
    }
    const timer = window.setTimeout(() => {
      setSubscriptionOverview((current: any) => current ? { ...current, writable: false } : current);
    }, Math.min(delay + 1000, 2147483647));
    return () => window.clearTimeout(timer);
  }, [subscriptionOverview]);

  const [showBedLayout, setShowBedLayout] = React.useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('hostelrr_show_bed_layout');
      return raw ? JSON.parse(raw) : true;
    } catch {
      return true;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('hostelrr_show_bed_layout', JSON.stringify(showBedLayout));
    } catch {}
  }, [showBedLayout]);

  // Track if we are fetching data
  const [isDataLoading, setIsDataLoading] = React.useState(true);
  const [dataFetchError, setDataFetchError] = React.useState(false);
  const [session, setSession] = React.useState<any>(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  React.useEffect(() => {
    let currentUserId: string | null = null;
    import('../supabaseClient').then(({ supabase }) => {
      const loadData = async (userId: string) => {
        setIsDataLoading(true);
        try {
          const { fetchHostelData } = await import('../lib/supabaseAPI');
          const result = await fetchHostelData(userId);
          if (result.hostel) {
            setHostelProfile(result.hostel);
            setFloors(result.floors || []);
            setResidents(result.residents || []);
            setActivities(result.activities || []);
            setJoinRequests(result.joinRequests || []);
            setDashboardStats(result.dashboardStats || null);
            setSubscriptionOverview(result.subscriptionOverview || null);
            setIsOnboardingComplete(true);
            localStorage.setItem('hostelrr_onboarding', 'true');
            localStorage.setItem(`hostelrr_onboarding:${userId}`, 'true');
            setIsDemoMode(false);
          } else {
            setHostelProfile(null);
            setFloors([]);
            setResidents([]);
            setPastResidents([]);
            setActivities([]);
            setJoinRequests([]);
            setDashboardStats(null);
            setSubscriptionOverview(null);
            setIsOnboardingComplete(false);
            localStorage.removeItem('hostelrr_onboarding');
            localStorage.removeItem(`hostelrr_onboarding:${userId}`);
          }
          setDataFetchError(false);
        } catch (err) {
          console.error("Error loading data from Supabase:", err);
          setDataFetchError(true);
          toast.error("Failed to connect to database. Please check your connection.");
        } finally {
          setIsDataLoading(false);
        }
      };

      const retryDataFetch = () => {
        if (session?.user?.id) {
          loadData(session.user.id);
        }
      };

      const verifySessionAndLoad = async (currentSession: any, skipLoadIfSameUser = false) => {
        if (!currentSession?.user) {
          currentUserId = null;
          setSession(null);
          setHostelProfile(null);
          setFloors([]);
          setResidents([]);
          setPastResidents([]);
          setActivities([]);
          setJoinRequests([]);
          setDashboardStats(null);
          setSubscriptionOverview(null);
          setIsOnboardingComplete(false);
          localStorage.removeItem('hostelrr_onboarding');
          setIsDataLoading(false);
          setAuthLoading(false);
          return;
        }

        if (skipLoadIfSameUser && currentUserId === currentSession.user.id) {
          setSession(currentSession);
          return;
        }

        // Publish session immediately so route guards can see auth state
        // before the slower server verification and data load finish.
        setSession(currentSession);
        setAuthLoading(false);

        try {
          // Verify with the server to handle deleted users
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
            try {
              await supabase.auth.signOut();
            } catch (e) {
              console.error("Auth: signOut failed", e);
            }
            currentUserId = null;
            setSession(null);
            setHostelProfile(null);
            setFloors([]);
            setResidents([]);
            setPastResidents([]);
            setActivities([]);
            setJoinRequests([]);
            setIsDataLoading(false);
            setAuthLoading(false);
            return;
          }

          currentUserId = user.id;
          setSession(currentSession);
          setAuthLoading(false);
          loadData(user.id);
        } catch (err) {
          console.error("Network or verification error:", err);
          // A failed network check does not prove the saved session is invalid.
          currentUserId = currentSession.user.id;
          setSession(currentSession);
          setAuthLoading(false);
          loadData(currentSession.user.id);
        }
      };

      supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
        verifySessionAndLoad(initialSession, false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
        if (_event === 'INITIAL_SESSION') return; // Handled by getSession above
        const skipLoadIfSameUser = ['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(_event);
        verifySessionAndLoad(currentSession, skipLoadIfSameUser);
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  }, []);

  const updateHostelProfile = async (newProfile: any) => {
    try {
      if (session?.user && newProfile.id) {
        const { updateHostelData } = await import('../lib/supabaseAPI');
        await updateHostelData(session.user.id, newProfile.id, newProfile);
      }
      setHostelProfile(newProfile);
      localStorage.setItem('hostelrr_profile', JSON.stringify(newProfile));
      return true;
    } catch (e) {
      console.error("Failed to update hostel profile in DB:", e);
      throw e;
    }
  };

  const syncStateWithDb = React.useCallback(async () => {
    try {
      const { fetchHostelData } = await import('../lib/supabaseAPI');
      const { data: { session } } = await import('../supabaseClient').then(m => m.supabase.auth.getSession());
      if (session && session.user) {
        const result = await fetchHostelData(session.user.id);
        if (result.hostel) {
          setFloors(result.floors || []);
          setResidents(result.residents || []);
          setPastResidents(result.pastResidents || []);
          setActivities(result.activities || []);
          setJoinRequests(result.joinRequests || []);
          setDashboardStats(result.dashboardStats || null);
          setSubscriptionOverview(result.subscriptionOverview || null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const [isOnboardingComplete, setIsOnboardingComplete] = React.useState(() => {
    // Do not infer onboarding state from shared browser storage. The active
    // account's hostel record is authoritative and is loaded below.
    return false;
  });

  React.useEffect(() => {
    if (isOnboardingComplete && !isDemoMode) {
      syncStateWithDb();
    }
  }, [isOnboardingComplete, isDemoMode, syncStateWithDb]);

  // Listen for join request refresh events (e.g., after new submission from JoinForm)
  React.useEffect(() => {
    const handleRefreshJoinRequests = () => {
      if (isOnboardingComplete && !isDemoMode) {
        void syncStateWithDb();
      }
    };

    window.addEventListener('refresh-join-requests', handleRefreshJoinRequests);
    return () => window.removeEventListener('refresh-join-requests', handleRefreshJoinRequests);
  }, [isOnboardingComplete, isDemoMode, syncStateWithDb]);

  React.useEffect(() => {
    if (!isOnboardingComplete || isDemoMode) return;

    const interval = window.setInterval(() => {
      void syncStateWithDb();
    }, 10000);
    const handleFocus = () => { void syncStateWithDb(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isOnboardingComplete, isDemoMode, syncStateWithDb]);

  // Activity logs are the existing in-app notification feed. Realtime refreshes
  // that feed across tabs/devices, while focus refresh remains the fallback.
  React.useEffect(() => {
    const hostelId = hostelProfile?.id;
    if (!hostelId || isDemoMode) return;

    let mounted = true;
    let removeChannel: (() => void) | undefined;
    void import('../supabaseClient').then(({ supabase }) => {
      if (!mounted) return;
      const channel = supabase
        .channel(`hostel-activity-${hostelId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `hostel_id=eq.${hostelId}`,
        }, () => { void syncStateWithDb(); })
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`Activity realtime unavailable (${status}); refresh-on-focus remains enabled.`);
          }
        });
      removeChannel = () => { void supabase.removeChannel(channel); };
    }).catch(error => console.warn('Could not initialize activity realtime:', error));

    return () => {
      mounted = false;
      removeChannel?.();
    };
  }, [hostelProfile?.id, isDemoMode, syncStateWithDb]);

  React.useEffect(() => {
    if (!hostelProfile?.id || isDemoMode) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void syncStateWithDb();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [hostelProfile?.id, isDemoMode, syncStateWithDb]);

  const completeOnboarding = async (data: any) => {
    // Attempt saving to Supabase
    try {
      const { createHostelData, fetchHostelData } = await import('../lib/supabaseAPI');
      const { data: { session } } = await import('../supabaseClient').then(m => m.supabase.auth.getSession());
      if (session?.user) {
        await createHostelData(session.user.id, data);

        // Refresh from server to ensure IDs match Supabase generated ones
        const result = await fetchHostelData(session.user.id);
        if (result.hostel) {
          setHostelProfile(result.hostel);
          setFloors(result.floors || []);
          setResidents(result.residents || []);
          setActivities(result.activities || []);
          setDashboardStats(result.dashboardStats || null);
          setSubscriptionOverview(result.subscriptionOverview || null);
        }
      }
    } catch (e: any) {
      console.error("Failed to create hostel in Supabase:", e);
      throw e; // Stop if fails and let caller handle
    }

    // Build sharing→rent lookup
    const rentMap: Record<number, number> = {};
    if (data.sharingConfigs) {
      data.sharingConfigs.forEach((sc: any) => {
        if (sc.sharing && sc.rent) {
          rentMap[sc.sharing] = parseInt(sc.rent);
        }
      });
    }

    setSharingRentMap(rentMap);
    localStorage.setItem('hostelrr_sharing_rent_map', JSON.stringify(rentMap));

    // Clear UI state as it's built freshly from server
    setActivities([]);
    setJoinRequests([]);
    setIsDemoMode(false);
    setIsOnboardingComplete(true);
    localStorage.setItem('hostelrr_onboarding', 'true');
    localStorage.setItem('hostelrr_onboarding_data', JSON.stringify(data));
    if (session?.user?.id) {
      localStorage.setItem(`hostelrr_onboarding:${session.user.id}`, 'true');
    }

    const depositAmount = data.collectSecurityDeposit && data.securityDeposit
      ? parseInt(data.securityDeposit, 10)
      : 0;
    setSecurityDeposit(depositAmount);
    setHostelProfile((current: any) => ({
      ...current,
      security_deposit: depositAmount,
      collectSecurityDeposit: Boolean(data.collectSecurityDeposit && depositAmount > 0),
    }));
  };

  const removeJoinRequest = (requestId: string) => {
    setJoinRequests(prev => prev.filter(req => req.id !== requestId));
  };

  const approveJoinRequest = async (params: {
    requestId: string;
    roomId: string;
    bedId: string;
    monthlyRent: number;
    joinDate?: string;
    securityDeposit?: number;
    isDepositPaid?: boolean;
    stayDurationDays?: number | null;
    vacatingDate?: string;
    reviewNotes?: string | null;
  }) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.requestId);
    const localRequest = joinRequests.find(req => req.id === params.requestId);

    if (isDemoMode || !session?.user || !isUuid) {
      if (!localRequest) {
        throw new Error('This join request is no longer available. Refresh the page and try again.');
      }

      const newResidentId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `res_${Date.now()}`;
      const joinDate = params.joinDate || getTodayIST();
      const paymentState = getResidentPaymentStateForDate([{
        status: 'pending', due_date: joinDate, paid_amount: 0, total_amount: params.monthlyRent,
      }], getTodayIST());

      setResidents(prev => [{
        id: newResidentId,
        name: localRequest.name,
        phone: localRequest.phone,
        roomId: params.roomId,
        bedId: params.bedId,
        joinDate,
        // Rent dues are independent of security-deposit collection.
        paymentStatus: paymentState.paymentStatus,
        dueAmount: paymentState.dueAmount,
        dueDate: joinDate,
        emergencyPhone: localRequest.emergencyContact,
        aadhar: localRequest.aadharNumber,
        monthlyRent: params.monthlyRent,
        stayTime: params.stayDurationDays ?? undefined,
        vacatingDate: params.vacatingDate,
        securityDeposit: params.securityDeposit ?? 0,
        isDepositPaid: params.isDepositPaid ?? false,
        photoPath: localRequest.photoPath,
        photoUrl: localRequest.photoUrl,
      }, ...prev]);

      setFloors(prev => prev.map(floor => ({
        ...floor,
        rooms: floor.rooms.map(room => room.id !== params.roomId ? room : ({
          ...room,
          beds: room.beds.map(bed => bed.id === params.bedId ? { ...bed, status: 'occupied', residentId: newResidentId } : bed)
        }))
      })));

      setJoinRequests(prev => prev.filter(req => req.id !== params.requestId));
      toast.success('Join request approved and resident added');
      return;
    }

    try {
      const { approveJoinRequestDb } = await import('../lib/supabaseAPI');
      await approveJoinRequestDb(params);
      toast.success('Join request approved and resident added');
      await syncStateWithDb();
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const rejectJoinRequest = (requestId: string, reviewNotes?: string) => {
    import('../lib/supabaseAPI').then(async ({ rejectJoinRequestDb }) => {
      try {
        await rejectJoinRequestDb({ requestId, reviewNotes: reviewNotes || null });
        toast.success('Join request rejected');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to reject join request');
      }
    });
  };

  const addJoinRequest = (request: Omit<JoinRequest, 'id' | 'requestDate' | 'status'>) => {
    const newRequest: JoinRequest = {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `jr_${Date.now()}`,
      ...request,
      requestDate: 'Just now',
      status: 'pending'
    };
    setJoinRequests(prev => [newRequest, ...prev]);
  };

  const markAsPaid = (residentId: string, method: 'UPI' | 'Cash' = 'UPI', partialAmount?: number, paymentDate?: string) => {
    // Determine how much to pay
    const res = residents.find(r => r.id === residentId);
    if (!res) return;
    const paidValue = partialAmount !== undefined ? partialAmount : getResidentDueDisplayAmount(res, floors);

    // Optimistic Update
    // ... we can skip detailed optimistic due to refetch ...
    // Background DB Update
    import('../lib/supabaseAPI').then(async ({ markAsPaidDb }) => {
      try {
        await markAsPaidDb(residentId, paidValue, method, paymentDate);
        toast.success(`Payment of ₹${paidValue} recorded`);
        await syncStateWithDb();
      } catch(e: any) {
        console.error(e);
        toast.error(e?.message === 'Payment exceeds the outstanding rent balance.'
          ? 'Payment is higher than the current outstanding balance. Refresh the resident and retry.'
          : 'Failed to record payment');
      }
    });
  };

  const vacateResident = (residentId: string) => {
    // Optimistic
    const res = residents.find(r => r.id === residentId);
    if (!res) return;
    setResidents(prev => prev.filter(r => r.id !== residentId));
    setFloors(prev => prev.map(f => ({ ...f, rooms: f.rooms.map(room => ({ ...room, beds: room.beds.map(b => b.id === res.bedId ? { ...b, status: 'vacant', residentId: undefined } : b) })) })));

    // DB Sync
    import('../lib/supabaseAPI').then(async ({ vacateResidentDb }) => {
      try {
        await vacateResidentDb(residentId);
        toast.success('Resident vacated successfully');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to vacate resident');
      }
    });
  };

  /**
   * Archive (soft delete) a resident
   * CRITICAL: Preserves all payment history forever
   * Use for admin features only - do not expose in standard UI
   */
  const archiveResident = (residentId: string, reason?: string) => {
    // Optimistic: Remove from active residents
    const res = residents.find(r => r.id === residentId);
    if (!res) return;
    setResidents(prev => prev.filter(r => r.id !== residentId));
    setFloors(prev => prev.map(f => ({ ...f, rooms: f.rooms.map(room => ({ ...room, beds: room.beds.map(b => b.id === res.bedId ? { ...b, status: 'vacant', residentId: undefined } : b) })) })));

    // DB Sync: Soft delete via archive_resident RPC
    import('../lib/supabaseAPI').then(async ({ archiveResidentDb }) => {
      try {
        await archiveResidentDb(residentId, reason);
        toast.success('Resident archived successfully');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to archive resident');
      }
    });
  };

  const deletePastResident = async (residentId: string) => {
    if (isDemoMode) {
      setPastResidents(prev => prev.filter(resident => resident.id !== residentId));
      return 'deleted' as const;
    }
    const { deletePastResidentDb } = await import('../lib/supabaseAPI');
    const disposition = await deletePastResidentDb(residentId);
    await syncStateWithDb();
    return disposition;
  };

  const addResident = (residentData: any, isReserved?: boolean) => {
    const hostelId = hostelProfile?.id;
    if (!hostelId) {
      console.error('addResident: hostelProfile.id is null — cannot create resident');
      return;
    }
    // DB sync
    import('../lib/supabaseAPI').then(async ({ addResidentDb }) => {
      try {
        const newResidentId = await addResidentDb(hostelId, residentData.roomId, residentData.bedId, residentData, isReserved, residentData.oldResidentId);

        if (newResidentId) {
          const resolvedRent = Number(residentData.rent) > 0 ? Number(residentData.rent) : getRoomBaseRent(floors, residentData.roomId);
          const joinDate = residentData.joinDate || getTodayIST();
          const paymentState = getResidentPaymentStateForDate(isReserved ? [] : [{
            status: 'pending', due_date: joinDate, paid_amount: 0, total_amount: resolvedRent,
          }], getTodayIST());
          setResidents(prev => {
            const nextResident: Resident = {
              id: newResidentId,
              name: residentData.name,
              phone: residentData.phone,
              roomId: residentData.roomId,
              bedId: residentData.bedId,
              joinDate,
              paymentStatus: paymentState.paymentStatus,
              dueAmount: paymentState.dueAmount,
              dueDate: joinDate,
              emergencyPhone: residentData.emergencyPhone,
              aadhar: residentData.aadhar,
              monthlyRent: resolvedRent,
              stayTime: residentData.stayTime ?? undefined,
              securityDeposit: residentData.securityDeposit || 0,
              isDepositPaid: residentData.isDepositPaid || false,
              vacatingDate: isReserved ? undefined : residentData.vacatingDate,
              areaAndCity: residentData.areaAndCity,
              state: residentData.state,
              country: residentData.country,
              status: isReserved ? 'reserved' : 'active',
              createdAt: new Date().toISOString(),
              paymentHistory: [],
              photoUrl: undefined,
              photoPath: undefined,
            };

            const withoutOld = residentData.oldResidentId
              ? prev.filter(r => r.id !== residentData.oldResidentId)
              : prev;

            return [nextResident, ...withoutOld];
          });

          setFloors(prev => prev.map(floor => ({
            ...floor,
            rooms: floor.rooms.map(room => ({
              ...room,
              beds: room.beds.map(bed => bed.id === residentData.bedId ? { ...bed, status: isReserved ? 'reserved' : 'occupied', residentId: newResidentId } : bed)
            }))
          })));
        }

        toast.success(isReserved ? 'Bed reserved successfully' : 'Resident added successfully');
        await syncStateWithDb();
      } catch (e: any) {
        console.error(e);
        import('sonner').then(({ toast }) => {
          const msg = (e && (e.message || e.error)) || (typeof e === 'string' ? e : JSON.stringify(e));
          toast.error(msg || 'Failed to add resident');
        });
      }
    });
  };

  /**
   * Confirm a reserved resident: atomically transition to active and create first cycle.
   */
  const confirmMoveIn = async (residentId: string, confirmedDate?: string) => {
    const { confirmMoveInDb } = await import('../lib/supabaseAPI');
    try {
      await confirmMoveInDb(residentId, confirmedDate);
      await syncStateWithDb();
    } catch (e: any) {
      console.error(e);
      const msg = (e && (e.message || e.error)) || (typeof e === 'string' ? e : JSON.stringify(e));
      toast.error(msg || 'Failed to confirm resident move-in');
    }
  };

  const editResident = async (residentId: string, updatedData: any) => {
    const { editResidentDb } = await import('../lib/supabaseAPI');
    await editResidentDb(residentId, updatedData);
    await syncStateWithDb();
  };

  const addRoom = (floorId: string, roomData: { number: string; numBeds: number; baseRent?: string; layoutId?: string }) => {
    import('../lib/supabaseAPI').then(async ({ addRoomDb }) => {
      try {
        await addRoomDb(hostelProfile?.id, floorId, roomData);
        toast.success(`Room ${roomData.number} created`);
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to create room');
      }
    });
  };
  const updateRoomSetup = (floorId: string, roomId: string, numBeds: number, baseRent: number, newNumber?: string, layoutId?: string) => {
    // Optimistic Update
    setFloors(prev => prev.map(f => {
      if (f.id === floorId) {
        return {
          ...f,
          rooms: f.rooms.map(r => {
            if (r.id === roomId) {
              const currentCount = r.beds.length;
              let newBeds = [...r.beds];
              if (numBeds > currentCount) {
                const toAdd = numBeds - currentCount;
                const added = Array.from({ length: toAdd }).map((_, idx) => ({
                  id: `temp_${Date.now()}_${idx}`,
                  name: String(currentCount + idx + 1),
                  status: 'vacant' as const
                }));
                newBeds = [...newBeds, ...added];
              } else if (numBeds < currentCount) {
                newBeds = newBeds.slice(0, numBeds);
              }
              return {
                ...r,
                number: newNumber !== undefined ? newNumber : r.number,
                baseRent,
                layoutId: layoutId || r.layoutId,
                beds: newBeds
              };
            }
            return r;
          })
        };
      }
      return f;
    }));

    import('../supabaseClient').then(async ({ supabase }) => {
      try {
        const { data: currentBeds, error: bedErr } = await supabase.from('beds').select('id').eq('room_id', roomId);
        if (bedErr) console.error('updateRoomSetup: bed fetch error', bedErr);
        const currentCount = currentBeds ? currentBeds.length : 0;
        const toAdd = Math.max(0, numBeds - currentCount);
        const toRemove = numBeds < currentCount && currentBeds ? currentBeds.slice(numBeds).map(b => b.id) : [];
        const { updateRoomSetupDb } = await import('../lib/supabaseAPI');
        await updateRoomSetupDb(roomId, { number: newNumber, baseRent: baseRent || 0, layoutId: layoutId || null }, { bedsToAdd: toAdd, bedsToRemove: toRemove });
        toast.success('Room configuration saved');
        await syncStateWithDb();
      } catch (e) {
        console.error('Error in updateRoomSetup:', e);
        toast.error('Failed to save room setup');
        await syncStateWithDb(); // Revert on failure
      }
    });
  };

  const editRoomBeds = (floorId: string, roomId: string, numBeds: number, layoutId?: string) => {
    // Optimistic Update
    setFloors(prev => prev.map(f => {
      if (f.id === floorId) {
        return {
          ...f,
          rooms: f.rooms.map(r => {
            if (r.id === roomId) {
              const currentCount = r.beds.length;
              let newBeds = [...r.beds];
              if (numBeds > currentCount) {
                const toAdd = numBeds - currentCount;
                const added = Array.from({ length: toAdd }).map((_, idx) => ({
                  id: `temp_${Date.now()}_${idx}`,
                  name: String(currentCount + idx + 1),
                  status: 'vacant' as const
                }));
                newBeds = [...newBeds, ...added];
              } else if (numBeds < currentCount) {
                newBeds = newBeds.slice(0, numBeds);
              }
              return { ...r, layoutId, beds: newBeds };
            }
            return r;
          })
        };
      }
      return f;
    }));

    import('../supabaseClient').then(async ({ supabase }) => {
      try {
        const { data: currentBeds } = await supabase.from('beds').select('id').eq('room_id', roomId);
        const currentCount = currentBeds ? currentBeds.length : 0;
        const toAdd = Math.max(0, numBeds - currentCount);
        const toRemove = numBeds < currentCount && currentBeds ? currentBeds.slice(numBeds).map(b => b.id) : [];
        const { updateRoomSetupDb } = await import('../lib/supabaseAPI');
        await updateRoomSetupDb(roomId, { layoutId }, { bedsToAdd: toAdd, bedsToRemove: toRemove });
        toast.success('Room layout updated');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to update beds');
        await syncStateWithDb(); // Revert on failure
      }
    });
  };

  const toggleDemoMode = (enabled: boolean) => {
    setIsDemoMode(enabled);
    if (enabled) {
      setFloors(MOckFloors);
      setResidents(MockResidents);
      setPastResidents(MockPastResidents);
      setActivities(MockActivities);
      setJoinRequests(MockJoinRequests);
    } else {
      setResidents([]);
      setPastResidents([]);
      setActivities([]);
      setJoinRequests([]);

      const rawData = localStorage.getItem('hostelrr_onboarding_data');
      if (rawData) {
        const data = JSON.parse(rawData);
        const floorCount = data.numFloors || 1;
        const newFloors: any[] = [];
        for (let f = 1; f <= floorCount; f++) {
          const rooms: any[] = [];
          const roomCountThisFloor = data.roomsPerFloor?.[f]
            ? parseInt(data.roomsPerFloor[f])
            : Math.ceil((data.numRooms || 0) / floorCount);
          for (let r = 1; r <= roomCountThisFloor; r++) {
            const roomNumStr = `${f}${String(r).padStart(2, '0')}`;
            rooms.push({ id: `r${roomNumStr}`, number: roomNumStr, baseRent: undefined, beds: [] });
          }
          newFloors.push({ id: `f${f}`, level: f, name: `Floor ${f}`, rooms });
        }
        setFloors(newFloors);
      } else {
        setFloors([]);
      }
    }
  };

  const deleteRoom = (floorId: string, roomId: string) => {
    import('../lib/supabaseAPI').then(async ({ deleteRoomDb }) => {
      try {
        await deleteRoomDb(roomId);
        toast.success('Room deleted');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to delete room');
      }
    });
  };

  const moveBeds = async (sourceRoomId: string, targetRoomId: string, bedIdsToMove: string[]) => {
    const { moveBedsDb } = await import('../lib/supabaseAPI');
    await moveBedsDb(sourceRoomId, targetRoomId, bedIdsToMove);
    await syncStateWithDb();
  };

  const copyFloorLayout = (sourceFloorId: string, targetFloorId: string) => {
    import('../lib/supabaseAPI').then(async ({ copyFloorLayoutDb }) => {
      try {
        await copyFloorLayoutDb(sourceFloorId, targetFloorId);
        toast.success('Floor layout copied successfully');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to copy layout');
      }
    });
  };

  return (
    <AppContext.Provider value={{
      floors, residents, pastResidents, activities, joinRequests,
      markAsPaid, vacateResident, archiveResident, deletePastResident, addResident, confirmMoveIn, editResident, removeJoinRequest, approveJoinRequest, rejectJoinRequest, addJoinRequest,
      activeBuildingFilter, setActiveBuildingFilter,
      activePaymentsFilter, setActivePaymentsFilter,
      globalSelectedResidentId, setGlobalSelectedResidentId,
      globalSelectedRoomId, setGlobalSelectedRoomId,
      addRoom, editRoomBeds, updateRoomSetup, deleteRoom, moveBeds, copyFloorLayout,
      isOnboardingComplete, completeOnboarding,
      isDemoMode, toggleDemoMode,
      showBedLayout, setShowBedLayout,
      sharingRentMap,
      securityDeposit,
      hostelProfile,
      dashboardStats,
      subscriptionOverview,
      updateHostelProfile,
      syncStateWithDb,
      isDataLoading,
      dataFetchError,
      retryDataFetch: () => {
        if (session?.user?.id) {
          setIsDataLoading(true);
          setDataFetchError(false);
          import('../lib/supabaseAPI').then(({ fetchHostelData }) => {
            fetchHostelData(session.user.id).then(result => {
              if (result.hostel) {
                setHostelProfile(result.hostel);
                setFloors(result.floors || []);
                setResidents(result.residents || []);
                setActivities(result.activities || []);
                setJoinRequests(result.joinRequests || []);
                setDashboardStats(result.dashboardStats || null);
                setSubscriptionOverview(result.subscriptionOverview || null);
                setIsOnboardingComplete(true);
              }
              setIsDataLoading(false);
            }).catch(e => {
              console.error(e);
              setDataFetchError(true);
              setIsDataLoading(false);
              toast.error("Failed to connect to database");
            });
          });
        }
      },
      authLoading,
      session,
      isSupportModalOpen,
      setIsSupportModalOpen,
      openSupportModal
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
