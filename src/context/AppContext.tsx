import React, { createContext, useContext, useState } from 'react';
import {
  Floor, Resident, PastResident, Bed, JoinRequest,
  MOckFloors, MockResidents, MockPastResidents, MockActivities, MockJoinRequests
} from '../data/mock';
import { toast } from 'sonner';
import { FLAGS } from '../core/env';

export type PaymentsFilterType = 'All' | 'Paid' | 'Unpaid' | 'Pending' | 'Late' | 'Partially Paid';

interface AppContextType {
  floors: Floor[];
  residents: Resident[];
  pastResidents: PastResident[];
  activities: any[];
  joinRequests: JoinRequest[];
  markAsPaid: (residentId: string, method?: 'UPI' | 'Cash', partialAmount?: number, paymentDate?: string) => void;
  markReminderSent: (residentId: string) => void;
  vacateResident: (residentId: string) => void;
  addResident: (residentData: any, isReserved?: boolean) => void;
  confirmMoveIn: (residentId: string, confirmedDate?: string) => void;
  editResident: (residentId: string, updatedData: any) => void;
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
    reviewNotes?: string | null;
  }) => void;
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
  moveBeds: (sourceRoomId: string, targetRoomId: string, bedIdsToMove: string[]) => void;
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
  updateHostelProfile: (profile: any) => void;
  syncStateWithDb: () => Promise<void>;
  isDataLoading: boolean;
  dataFetchError: boolean;
  retryDataFetch: () => void;
  authLoading: boolean;
  session: any | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isOnboardingCompleteInitial = localStorage.getItem('hostelrr_onboarding') === 'true';
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (FLAGS.demoMode) return true;
    return !isOnboardingCompleteInitial;
  });

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
            setIsOnboardingComplete(true);
            localStorage.setItem('hostelrr_onboarding', 'true');
            setIsDemoMode(false);
          } else {
            setIsOnboardingComplete(false);
            localStorage.removeItem('hostelrr_onboarding');
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
          // If fetch fails (which can happen on CORS errors from invalid/deleted sessions),
          // we should sign out defensively to prevent the app getting stuck with a ghost session.
          try {
            await supabase.auth.signOut();
          } catch (e) {
            console.warn("Sign out failed:", e);
          }
          currentUserId = null;
          setSession(null);
          setIsDataLoading(false);
          setAuthLoading(false);
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
    setHostelProfile(newProfile);
    localStorage.setItem('hostelrr_profile', JSON.stringify(newProfile));
    
    // Save to DB
    try {
      if (session?.user && newProfile.id) {
        const { updateHostelData } = await import('../lib/supabaseAPI');
        await updateHostelData(session.user.id, newProfile.id, newProfile);
        toast.success('Hostel profile updated successfully');
      }
    } catch (e) {
      console.error("Failed to update hostel profile in DB:", e);
      toast.error('Failed to update profile');
    }
  };

  const syncStateWithDb = async () => {
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
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [isOnboardingComplete, setIsOnboardingComplete] = React.useState(() => {
    return localStorage.getItem('hostelrr_onboarding') === 'true';
  });

  React.useEffect(() => {
    if (isOnboardingComplete && !isDemoMode) {
      syncStateWithDb();
    }
  }, [isOnboardingComplete, isDemoMode]);

  // Listen for join request refresh events (e.g., after new submission from JoinForm)
  React.useEffect(() => {
    const handleRefreshJoinRequests = () => {
      if (isOnboardingComplete && !isDemoMode) {
        syncStateWithDb();
      }
    };

    window.addEventListener('refresh-join-requests', handleRefreshJoinRequests);
    return () => window.removeEventListener('refresh-join-requests', handleRefreshJoinRequests);
  }, [isOnboardingComplete, isDemoMode]);

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
    
    setSecurityDeposit(data.securityDeposit ? parseInt(data.securityDeposit) : 0);
  };

  const removeJoinRequest = (requestId: string) => {
    setJoinRequests(prev => prev.filter(req => req.id !== requestId));
  };

  const approveJoinRequest = (params: {
    requestId: string;
    roomId: string;
    bedId: string;
    monthlyRent: number;
    joinDate?: string;
    securityDeposit?: number;
    isDepositPaid?: boolean;
    stayDurationDays?: number | null;
    reviewNotes?: string | null;
  }) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.requestId);
    const localRequest = joinRequests.find(req => req.id === params.requestId);

    if (isDemoMode || !session?.user || !isUuid) {
      if (!localRequest) {
        toast.error('Failed to approve join request');
        return;
      }

      const newResidentId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `res_${Date.now()}`;

      setResidents(prev => [{
        id: newResidentId,
        name: localRequest.name,
        phone: localRequest.phone,
        roomId: params.roomId,
        bedId: params.bedId,
        joinDate: params.joinDate || new Date().toISOString().split('T')[0],
        // Rent dues are independent of security-deposit collection.
        paymentStatus: 'due',
        dueAmount: params.monthlyRent,
        dueDate: params.joinDate || new Date().toISOString().split('T')[0],
        documentsComplete: true,
        emergencyPhone: localRequest.emergencyContact,
        aadhar: localRequest.aadharNumber,
        monthlyRent: params.monthlyRent,
        stayTime: params.stayDurationDays ?? undefined,
        securityDeposit: params.securityDeposit ?? 0,
        isDepositPaid: params.isDepositPaid ?? false,
        photoPath: localRequest.photoPath,
        photoUrl: localRequest.photoUrl,
        aadharDocumentPath: localRequest.aadharDocumentPath,
        aadharDocumentUrl: localRequest.aadharDocumentUrl,
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

    import('../lib/supabaseAPI').then(async ({ approveJoinRequestDb }) => {
      try {
        await approveJoinRequestDb(params);
        toast.success('Join request approved and resident added');
        await syncStateWithDb();
      } catch (e) {
        console.error(e);
        toast.error('Failed to approve join request');
      }
    });
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
    const paidValue = partialAmount !== undefined ? partialAmount : (res.dueAmount > 0 ? res.dueAmount : 7500);

    // Optimistic Update
    // ... we can skip detailed optimistic due to refetch ...
    // Background DB Update
    import('../lib/supabaseAPI').then(async ({ markAsPaidDb }) => {
      try {
        await markAsPaidDb(residentId, paidValue, method, paymentDate); 
        toast.success(`Payment of ₹${paidValue} recorded`);
        await syncStateWithDb();
      } catch(e) { 
        console.error(e);
        toast.error('Failed to record payment');
      }
    });
  };

  const markReminderSent = (residentId: string) => {
    setResidents(prev => prev.map(r => 
      r.id === residentId ? { ...r, lastReminderSentAt: new Date().toISOString() } : r
    ));
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
          setResidents(prev => {
            const nextResident: Resident = {
              id: newResidentId,
              name: residentData.name,
              phone: residentData.phone,
              roomId: residentData.roomId,
              bedId: residentData.bedId,
              joinDate: residentData.joinDate || new Date().toISOString().split('T')[0],
              paymentStatus: 'due',
              dueAmount: residentData.rent || 5000,
              dueDate: residentData.vacatingDate || residentData.joinDate || new Date().toISOString().split('T')[0],
              documentsComplete: false,
              emergencyPhone: residentData.emergencyPhone,
              aadhar: residentData.aadhar,
              monthlyRent: residentData.rent || 5000,
              stayTime: residentData.stayTime ?? undefined,
              securityDeposit: residentData.securityDeposit || 0,
              isDepositPaid: residentData.isDepositPaid || false,
              vacatingDate: residentData.vacatingDate,
              areaAndCity: residentData.areaAndCity,
              state: residentData.state,
              country: residentData.country,
              createdAt: new Date().toISOString(),
              paymentHistory: [],
              photoUrl: undefined,
              photoPath: undefined,
              aadharDocumentUrl: undefined,
              aadharDocumentPath: undefined,
              hostelFormUrl: undefined,
              hostelFormPath: undefined,
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

  const editResident = (residentId: string, updatedData: any) => {
    import('../lib/supabaseAPI').then(async ({ editResidentDb }) => {
      try {
        await editResidentDb(residentId, updatedData);
        toast.success('Resident details updated');
        await syncStateWithDb();
      } catch (e) { 
        console.error(e);
        toast.error('Failed to update resident');
      }
    });
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
                  name: `Bed ${String.fromCharCode(65 + currentCount + idx)}`,
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
        let toAdd = 0;
        let toRemove: string[] = [];
        if (numBeds > currentCount) {
          toAdd = numBeds - currentCount;
        } else if (numBeds < currentCount && currentBeds) {
          toRemove = currentBeds.slice(numBeds).map(b => b.id);
        }
        
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
                  name: `Bed ${String.fromCharCode(65 + currentCount + idx)}`,
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
        // Find current beds
        const { data: currentBeds } = await supabase.from('beds').select('id').eq('room_id', roomId);
        const currentCount = currentBeds ? currentBeds.length : 0;
        let toAdd = 0;
        let toRemove: string[] = [];
        if (numBeds > currentCount) {
          toAdd = numBeds - currentCount;
        } else if (numBeds < currentCount && currentBeds) {
          // Remove from end
          toRemove = currentBeds.slice(numBeds).map(b => b.id);
        }
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

  const moveBeds = (sourceRoomId: string, targetRoomId: string, bedIdsToMove: string[]) => {
    import('../lib/supabaseAPI').then(async ({ moveBedsDb }) => {
      try {
        await moveBedsDb(targetRoomId, bedIdsToMove);
        toast.success(`${bedIdsToMove.length} bed(s) moved successfully`);
        await syncStateWithDb();
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Failed to move beds');
        await syncStateWithDb(); // Re-sync to revert optimistic state
      }
    });
  };

  const copyFloorLayout = (sourceFloorId: string, targetFloorId: string) => {
    import('../supabaseClient').then(async ({ supabase }) => {
      try {
        const { data: sourceRooms } = await supabase.from('rooms').select('*, beds(*)').eq('floor_id', sourceFloorId);
        const { data: targetRooms } = await supabase.from('rooms').select('id, room_number').eq('floor_id', targetFloorId);
        
        if (!sourceRooms || !targetRooms) return;

        for (let i = 0; i < targetRooms.length; i++) {
          const tRoom = targetRooms[i];
          const sRoom = sourceRooms[i];
          if (!sRoom) break;

          await supabase.from('rooms').update({
            base_rent: sRoom.base_rent,
            layout_id: sRoom.layout_id
          }).eq('id', tRoom.id);

          // Delete existing beds
          await supabase.from('beds').delete().eq('room_id', tRoom.id);

          // Add beds
          if (sRoom.beds && sRoom.beds.length > 0) {
            const sortedBeds = [...sRoom.beds].sort((a: any, b: any) =>
              String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' })
            );

            const newBeds = sortedBeds.map((b: any) => ({
              hostel_id: sRoom.hostel_id,
              room_id: tRoom.id,
              label: b.label
            }));
            await supabase.from('beds').insert(newBeds);
          }
        }
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
      markAsPaid, markReminderSent, vacateResident, addResident, confirmMoveIn, editResident, removeJoinRequest, approveJoinRequest, rejectJoinRequest, addJoinRequest,
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
      session
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
