import { supabase } from '../supabaseClient';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Floor, Room, Bed, Resident, JoinRequest } from '../data/mock';
import { addMonthsToDateOnly, compareBedLabels, compareRoomNumbers, formatBedLabel, getResidentPaymentStateForDate, getTodayIST, getTransactionSortTimestamp, normalizeBedLabel, normalizeBedLayoutPositions } from './utils';

const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_LABEL = '+05:30';

function getCurrentISTDateTimeParts() {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function normalizeIstTimestamp(value?: string) {
  const current = getCurrentISTDateTimeParts();

  if (!value) {
    return `${current.year}-${current.month}-${current.day}T${current.hour}:${current.minute}:${current.second}${IST_OFFSET_LABEL}`;
  }

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return value;
  }

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}T${current.hour}:${current.minute}:${current.second}${IST_OFFSET_LABEL}`;
  }

  const dateTimeMatch = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/);
  if (dateTimeMatch) {
    return `${dateTimeMatch[1]}T${dateTimeMatch[2]}${IST_OFFSET_LABEL}`;
  }

  return value;
}

const MAX_RESIDENT_PHOTO_SIZE = 1024 * 1024;
const MAX_JOIN_PHOTO_SIZE = 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function callPhotoFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('resident-photo', { body });
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.clone().json().catch(() => null);
    if (typeof payload?.error === 'string') throw new Error(payload.error);
  }
  if (error) throw new Error(error.message || 'Photo service request failed');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function getResidentPhotoUrl(residentId: string): Promise<string | undefined> {
  try {
    const result = await callPhotoFunction<{ url?: string }>({ action: 'resident-read', residentId });
    return result.url;
  } catch (error) {
    console.warn('Resident photo unavailable:', error);
    return undefined;
  }
}

export type MonthlyOverviewSnapshot = {
  month_start: string;
  metrics: Record<string, number>;
  captured_at: string;
};

export type DailyOverviewSnapshot = {
  snapshot_date: string;
  metrics: Record<string, number>;
  captured_at: string;
};

export async function getMonthlyOverviewSnapshots(hostelId: string): Promise<MonthlyOverviewSnapshot[]> {
  const { data, error } = await supabase
    .from('monthly_overview_snapshots')
    .select('month_start, metrics, captured_at')
    .eq('hostel_id', hostelId)
    .order('month_start', { ascending: false });
  if (error) throw error;
  return (data || []) as MonthlyOverviewSnapshot[];
}

export async function saveMonthlyOverviewSnapshot(
  hostelId: string,
  monthStart: string,
  metrics: Record<string, number>,
): Promise<MonthlyOverviewSnapshot> {
  const { data, error } = await supabase
    .from('monthly_overview_snapshots')
    .upsert({ hostel_id: hostelId, month_start: monthStart, metrics, captured_at: new Date().toISOString() }, { onConflict: 'hostel_id,month_start' })
    .select('month_start, metrics, captured_at')
    .single();
  if (error) throw error;
  return data as MonthlyOverviewSnapshot;
}

export async function getDailyOverviewSnapshots(hostelId: string, month: string): Promise<DailyOverviewSnapshot[]> {
  const monthStart = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonthStart = `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('daily_overview_snapshots')
    .select('snapshot_date, metrics, captured_at')
    .eq('hostel_id', hostelId)
    .gte('snapshot_date', monthStart)
    .lt('snapshot_date', nextMonthStart)
    .order('snapshot_date', { ascending: true });
  if (error) throw error;
  return (data || []) as DailyOverviewSnapshot[];
}

export async function saveDailyOverviewSnapshot(
  hostelId: string,
  snapshotDate: string,
  metrics: Record<string, number>,
): Promise<DailyOverviewSnapshot> {
  const { data, error } = await supabase
    .from('daily_overview_snapshots')
    .upsert({ hostel_id: hostelId, snapshot_date: snapshotDate, metrics, captured_at: new Date().toISOString() }, { onConflict: 'hostel_id,snapshot_date' })
    .select('snapshot_date, metrics, captured_at')
    .single();
  if (error) throw error;
  return data as DailyOverviewSnapshot;
}

export async function getJoinRequestPhotoUrl(requestId: string): Promise<string | undefined> {
  try {
    const result = await callPhotoFunction<{ url?: string }>({ action: 'join-read', requestId });
    return result.url;
  } catch (error) {
    console.warn('Join request photo unavailable:', error);
    return undefined;
  }
}

async function uploadToPresignedUrl(url: string, file: File) {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!response.ok) throw new Error('Photo upload failed. Select file and try again.');
}

export async function uploadResidentPhoto(residentId: string, file: File): Promise<void> {
  if (!PHOTO_TYPES.has(file.type)) throw new Error('Use a JPEG, PNG, or WebP image.');
  if (file.size > MAX_RESIDENT_PHOTO_SIZE) throw new Error('Photo must be 1 MB or smaller.');
  const intent = await callPhotoFunction<{ uploadId: string; url: string }>({ action: 'resident-intent', residentId, contentType: file.type, size: file.size });
  try {
    await uploadToPresignedUrl(intent.url, file);
    await callPhotoFunction({ action: 'resident-finalize', uploadId: intent.uploadId });
  } catch (error) {
    await callPhotoFunction({ action: 'resident-abort', uploadId: intent.uploadId }).catch(() => undefined);
    throw error;
  }
}

export async function deleteResidentPhoto(residentId: string): Promise<void> {
  await callPhotoFunction({ action: 'resident-delete', residentId });
}

export async function submitJoinRequestWithPhoto(
  request: Record<string, unknown>, file?: File | null, turnstileToken?: string
): Promise<string> {
  if (file && !PHOTO_TYPES.has(file.type)) throw new Error('Use a JPEG, PNG, or WebP image.');
  if (file && file.size > MAX_JOIN_PHOTO_SIZE) throw new Error('Photo must be 1 MB or smaller.');
  let intent: { requestId: string; uploadId: string; token: string; url: string } | undefined;
  if (file) {
    intent = await callPhotoFunction({
      action: 'join-intent', hostelId: request.hostelId, contentType: file.type, size: file.size, turnstileToken,
    });
    try {
      await uploadToPresignedUrl(intent.url, file);
    } catch (error) {
      await callPhotoFunction({ action: 'join-abort', uploadId: intent.uploadId, token: intent.token }).catch(() => undefined);
      throw error;
    }
  }
  const result = await callPhotoFunction<{ requestId: string }>({
    action: 'join-submit', request, uploadId: intent?.uploadId, token: intent?.token,
  });
  return result.requestId;
}

export async function fetchHostelData(userId: string) {
  // 1. Get Hostel
  const { data: hostelResponse, error: hostelError } = await supabase
    .from('hostels')
    .select('*, owner:users!user_id(*)')
    .eq('user_id', userId)
    .limit(1)
    .single();

  const hostel: any = hostelResponse;

  if (hostelError || !hostel) {
    if (hostelError && hostelError.code !== 'PGRST116') {
      console.error("fetchHostelData error:", hostelError);
    }
    return { hostel: null };
  }

  const hostelId = hostel.id;

  // 2. Get Floors
  let { data: floorsData, error: floorsError } = await supabase
    .from('floors')
    .select('*')
    .eq('hostel_id', hostelId)
    .order('floor_number', { ascending: true });
  if (floorsError) throw floorsError;

  // 3. Get Rooms
  const { data: initialRoomsData, error: initialRoomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('hostel_id', hostelId);
  if (initialRoomsError) throw initialRoomsError;

  let roomsData = initialRoomsData || [];
  if (roomsData.length === 0) {
    // Recover room cards for profiles created while onboarding skipped rooms.
    // Only run when saved onboarding data confirms the expected room count.
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('onboarding')
      .select('payload')
      .eq('hostel_id', hostelId)
      .maybeSingle();
    if (onboardingError) throw onboardingError;

    const snapshot = onboardingData?.payload as {
      numRooms?: number;
      roomsPerFloor?: Record<string, number>;
    } | null;
    const expectedRoomCount = Number(snapshot?.numRooms) ||
      Object.values(snapshot?.roomsPerFloor || {}).reduce((total: number, count: any) => total + (Number(count) || 0), 0);
    if (snapshot && expectedRoomCount > 0) {
      try {
        await ensureHostelStructure(hostelId, snapshot);
        const { data: recoveredRooms, error: recoveredRoomsError } = await supabase
          .from('rooms')
          .select('*')
          .eq('hostel_id', hostelId);
        if (recoveredRoomsError) throw recoveredRoomsError;
        roomsData = recoveredRooms || [];
        const { data: recoveredFloors, error: recoveredFloorsError } = await supabase
          .from('floors')
          .select('*')
          .eq('hostel_id', hostelId)
          .order('floor_number', { ascending: true });
        if (recoveredFloorsError) throw recoveredFloorsError;
        floorsData = recoveredFloors || floorsData;
      } catch (recoveryError) {
        console.warn('Failed to restore onboarding room cards:', recoveryError);
      }
    }
  }

  // 4. Get Beds
  const { data: bedsData, error: bedsError } = await supabase
    .from('beds')
    .select('*')
    .eq('hostel_id', hostelId);
  if (bedsError) throw bedsError;

  // 5. Get Residents
  const { data: residentsData, error: residentsError } = await supabase
    .from('residents')
    .select('*')
    .eq('hostel_id', hostelId);
  if (residentsError) throw residentsError;

  // Business visibility filter: only keep non-deleted, non-left residents in active resident set.
  const currentResidentsData = (residentsData || []).filter((r: any) => r.status !== 'left' && r.deleted_at == null);
  const activeResidentsData = currentResidentsData.filter((r: any) => r.status === 'active');

  // 6. Get Payment Cycles
  const { data: cyclesData, error: cyclesError } = await supabase
    .from('payment_cycles')
    .select('*')
    .eq('hostel_id', hostelId);
  if (cyclesError) throw cyclesError;

  // 7. Get Payments
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('hostel_id', hostelId);
  if (paymentsError) throw paymentsError;

  // 8. Get Past Residents
  const { data: pastResidentsData, error: pastResidentsError } = await supabase
    .from('residents')
    .select('*')
    .eq('hostel_id', hostelId)
    .or('status.eq.left,deleted_at.not.is.null')
    .is('personal_data_deleted_at', null);
  if (pastResidentsError) throw pastResidentsError;

  // 9. Get Activity Logs
  const { data: activityLogsData, error: activityLogsError } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('hostel_id', hostelId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (activityLogsError) throw activityLogsError;

  // 10. Get Join Requests (pending only)
  // Use RPC so dashboard does not depend on direct table read permissions.
  const { data: joinRequestsData, error: joinRequestsError } = await supabase.rpc('get_join_requests', {
    p_hostel_id: hostelId,
    p_status: 'pending',
  });

  if (joinRequestsError) {
    console.error('fetchHostelData join_requests error:', joinRequestsError);
  }

  // 11. Get centralized dashboard KPIs from backend RPC
  let dashboardStats: any = null;
  let subscriptionOverview: any = null;
  try {
    const { data: dashboardStatsData, error: dashboardStatsError } = await supabase.rpc('get_dashboard_stats', {
      p_hostel_id: hostelId,
    });

    if (dashboardStatsError) {
      console.error('fetchHostelData dashboard_stats error:', dashboardStatsError);
    } else {
      dashboardStats = dashboardStatsData;
    }
  } catch (error) {
    console.error('fetchHostelData dashboard_stats exception:', error);
  }

  try {
    const { data: subscriptionData, error: subscriptionError } = await supabase.rpc('get_hostel_subscription', {
      p_hostel_id: hostelId,
    });
    if (!subscriptionError) subscriptionOverview = subscriptionData;
    else console.error('fetchHostelData subscription error:', subscriptionError);
  } catch (error) {
    console.error('fetchHostelData subscription exception:', error);
  }

  // Build the nested structure Floor[] -> Room[] -> Bed[]
  const floors: Floor[] = (floorsData || []).map((f: any) => {
    const floorRooms = (roomsData || [])
      .filter((r: any) => r.floor_id === f.id)
      .sort((a: any, b: any) => compareRoomNumbers(a.room_number, b.room_number))
      .map((r: any) => {
        const roomBeds = (bedsData || [])
          .filter((b: any) => b.room_id === r.id)
          .sort((a: any, b: any) => compareBedLabels(a.label, b.label))
          .map((b: any) => {
            // Find current resident in this bed
            const resident = currentResidentsData.find((res: any) => res.bed_id === b.id);
            
            let displayStatus = b.status;
            if (resident && displayStatus === 'occupied') {
              const resCycles = (cyclesData || []).filter((c: any) => c.resident_id === resident.id);
              const paymentState = getResidentPaymentStateForDate(resCycles, getTodayIST());
              if (paymentState.paymentStatus !== 'paid') {
                displayStatus = 'payment_due';
              }
            }
            
            return {
              id: b.id,
              name: normalizeBedLabel(b.label),
              status: displayStatus,
              residentId: resident ? resident.id : undefined,
            };
          });
        return {
          id: r.id,
          number: r.room_number,
          beds: roomBeds,
          baseRent: r.base_rent,
          layoutId: r.layout_id,
        };
      });

    return {
      id: f.id,
      level: f.floor_number,
      name: f.label || `Floor ${f.floor_number}`,
      rooms: floorRooms,
    };
  });

  const mappedHostel = {
    ...hostel,
    hostelName: hostel.name,
    reminderTemplate: hostel.reminder_template ?? null,
    ownerName: hostel.owner?.name,
    phone: hostel.phone || hostel.owner?.phone,
    email: hostel.owner?.email,
    collectSecurityDeposit: Number(hostel.security_deposit || 0) > 0,
  };

  const residentsPromises = currentResidentsData.map(async (r: any) => {
    try {
      const resCycles = (cyclesData || []).filter((c: any) => c.resident_id === r.id);
      const today = getTodayIST();
      const paymentState = getResidentPaymentStateForDate(resCycles, today);
      const { paymentStatus, dueAmount, pendingDueToday: hasPendingDueToday } = paymentState;

    // Compute stayTime from join_date
    let stayTime = 'Just Joined';
    if (r.join_date) {
      const joinDate = String(r.join_date).slice(0, 10);
      const today = getTodayIST();
      const joinMs = Date.parse(`${joinDate}T00:00:00Z`);
      const todayMs = Date.parse(`${today}T00:00:00Z`);
      const diffDays = Number.isNaN(joinMs) || Number.isNaN(todayMs)
        ? 0
        : Math.floor((todayMs - joinMs) / (1000 * 60 * 60 * 24));
      if (diffDays >= 365) stayTime = `${Math.floor(diffDays / 365)}y ${Math.floor((diffDays % 365) / 30)}m`;
      else if (diffDays >= 30) stayTime = `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''}`;
      else if (diffDays > 0) stayTime = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }

    return {
      id: r.id,
      name: r.name,
      phone: r.phone || '',
      roomId: r.room_id || '',
      bedId: r.bed_id || '',
      joinDate: r.join_date || '',
      monthlyRent: r.monthly_rent || 0,
      paymentStatus,
      pendingDueToday: hasPendingDueToday,
      dueAmount,
      dueDate: paymentState.nextDueDate
        ? paymentState.nextDueDate
        : (() => {
            // Find the most recent cycle start to project the next one
            const sortedAll = (resCycles || []).sort((a: any, b: any) => new Date(b.cycle_start).getTime() - new Date(a.cycle_start).getTime());
            if (sortedAll.length > 0 && sortedAll[0].cycle_start) {
              return addMonthsToDateOnly(sortedAll[0].cycle_start);
            }
            // Fallback to join date or today
            return r.join_date || getTodayIST();
          })(),
      photoPath: r.photo_path || undefined,
      emergencyPhone: r.emergency_contact || '',
      aadhar: r.aadhar_number || '',
      areaAndCity: r.area_and_city || '',
      state: r.state || '',
      country: r.country || 'India',
      stayTime,
      securityDeposit: r.security_deposit || 0,
      isDepositPaid: r.is_deposit_paid || false,
      depositPaidDate: r.deposit_paid_at || undefined,
      vacatingDate: r.status === 'reserved' ? undefined : (r.vacating_date || undefined),
        status: r.status || 'active',
        confirmedAt: r.confirmed_at || undefined,
      paymentHistory: (paymentsData || [])
        .filter((p: any) => p.resident_id === r.id)
        .map((p: any) => {
          const cycle = (cyclesData || []).find((c: any) => c.id === p.cycle_id);
          const isPartial = cycle && (p.amount < cycle.total_amount);
          return {
            id: p.id,
            date: p.paid_on || p.created_at,
            recordedAt: p.created_at,
            amount: p.amount,
            status: isPartial ? 'partial' : 'paid',
            method: (p.method === 'cash' ? 'Cash' : 'UPI') as 'Cash' | 'UPI',
            cycleStart: cycle?.cycle_start,
            cycleEnd: cycle?.cycle_end,
            dueDate: cycle?.due_date,
            transactionRef: p.transaction_ref || undefined,
            notes: p.notes || undefined,
            title: `Rent Payment`
          };
        })
        .sort((a: any, b: any) => getTransactionSortTimestamp(b) - getTransactionSortTimestamp(a)),
      createdAt: r.created_at,
    };
    } catch (error) {
      console.error(`Failed to map resident ${r.id}:`, error);
      return null;
    }
  });

  const results = await Promise.allSettled(residentsPromises);
  const mappedResidents = results
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.status === 'fulfilled' ? r.value : null)
    .filter((r) => r !== null);

  // Keep every historical stay, even when the same person has returned with
  // the same phone number. Payments belong to a resident record, not a phone.
  const sortedRawPast = [...(pastResidentsData || [])].sort((a: any, b: any) =>
    new Date(b.actual_leave_date || b.updated_at).getTime() - new Date(a.actual_leave_date || a.updated_at).getTime()
  );

  const mappedPastResidents = await Promise.all(sortedRawPast.map(async (r: any) => ({
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    roomId: r.room_id || '',
    bedId: r.bed_id || '',
    joinDate: r.join_date || '',
    vacateDate: r.actual_leave_date || r.updated_at || '',
    reason: r.notes || 'Vacated',
    photoPath: r.photo_path || undefined,
    emergencyPhone: r.emergency_contact || '',
    areaAndCity: r.area_and_city || '',
    state: r.state || '',
    country: r.country || 'India',
    securityDeposit: r.security_deposit || 0,
    isDepositPaid: r.is_deposit_paid || false,
    depositPaidDate: r.deposit_paid_at || undefined,
    paymentHistory: (paymentsData || [])
      .filter((p: any) => p.resident_id === r.id)
      .map((p: any) => {
        const cycle = (cyclesData || []).find((c: any) => c.id === p.cycle_id);
        const isPartial = cycle && (p.amount < cycle.total_amount);
        return {
          id: p.id,
          date: p.paid_on || p.created_at,
          recordedAt: p.created_at,
          amount: p.amount,
          status: isPartial ? 'partial' : 'paid',
          method: (p.method === 'cash' ? 'Cash' : 'UPI') as 'Cash' | 'UPI',
          cycleStart: cycle?.cycle_start,
          cycleEnd: cycle?.cycle_end,
          dueDate: cycle?.due_date,
          transactionRef: p.transaction_ref || undefined,
          notes: p.notes || undefined,
          title: `Rent Payment`
        };
      })
      .sort((a: any, b: any) => getTransactionSortTimestamp(b) - getTransactionSortTimestamp(a)),
    createdAt: r.created_at,
  })));

  const mappedActivities = (activityLogsData || []).map((a: any) => {
    let icon = 'CheckCircle';
    if (a.action.includes('resident')) icon = 'UserPlus';
    if (a.action.includes('payment')) icon = 'IndianRupee';
    if (a.action.includes('deposit')) icon = 'IndianRupee';
    if (a.action.includes('vacate') || a.action === 'resident_vacated') icon = 'LogOut';
    
    // basic time ago
    const diff = Date.now() - new Date(a.created_at).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    let timeAgo = 'Just now';
    if (days > 0) timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
    else if (hours > 0) timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;

    let text = a.notes || a.action.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    const m = a.metadata || {};
    
    const getResident = (rId: string) => {
      const active = mappedResidents.find((r: any) => r.id === rId);
      if (active) return { name: active.name, phone: active.phone, bedId: active.bedId };
      const past = mappedPastResidents.find((r: any) => r.id === rId);
      if (past) return { name: past.name, phone: past.phone, bedId: past.bedId };
      return { name: 'Resident', phone: '', bedId: '' };
    };
    const getBedLocation = (bedId: string) => {
      if (!bedId) return '';
      for (const floor of floors) {
        for (const room of floor.rooms) {
          const bed = room.beds.find((b: any) => b.id === bedId);
          if (bed) {
            const roomName = (room as any).name || (room as any).number || `Room ${room.id.slice(0, 4)}`;
            const bedName = (bed as any).name || bed.id;
            return `${roomName}, ${bedName}`;
          }
        }
      }
      return '';
    };
    const details: string[] = [];
    const formatAmount = (amount: any) => amount != null ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
    const formatDate = (date: any) => {
      if (!date) return '';
      const parsed = new Date(String(date).length === 10 ? `${date}T00:00:00` : date);
      return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    if (a.action === 'resident_added') {
      const residentName = m.name || m.resident_name || 'Resident';
      text = `New resident added: ${residentName}`;
      if (m.phone) details.push(`Phone: ${m.phone}`);
      const location = getBedLocation(m.bed_id);
      if (location) details.push(`Bed: ${location}`);
    } else if (a.action === 'payment_recorded') {
      const residentId = m.resident_id || (a.entity_type === 'resident' ? a.entity_id : '');
      const resident = getResident(residentId);
      const residentName = m.resident_name || m.name || resident.name;
      text = `Payment of ${formatAmount(m.amount)} received from ${residentName}`;
      if (resident.phone) details.push(`Phone: ${resident.phone}`);
      if (m.method) details.push(`Method: ${String(m.method).toUpperCase()}`);
      const paymentDate = formatDate(m.paid_on || m.date);
      if (paymentDate) details.push(`Date: ${paymentDate}`);
    } else if (a.action === 'deposit_paid') {
      const resident = getResident(a.entity_id);
      const residentName = m.resident_name || m.name || resident.name;
      text = `Security deposit of ${formatAmount(m.amount)} received from ${residentName}`;
      if (resident.phone) details.push(`Phone: ${resident.phone}`);
      const depositDate = formatDate(m.date);
      if (depositDate) details.push(`Date: ${depositDate}`);
    } else if (a.action === 'bed_reserved') {
      const residentName = m.name || m.resident_name || 'Resident';
      text = `Bed reserved for ${residentName}`;
      if (m.phone) details.push(`Phone: ${m.phone}`);
      const location = getBedLocation(m.bed_id);
      if (location) details.push(`Bed: ${location}`);
    } else if (a.action === 'resident_vacated') {
      const resident = getResident(a.entity_id);
      text = `${resident.name} vacated their bed`;
      const location = getBedLocation(resident.bedId);
      if (location) details.push(`Bed: ${location}`);
      if (m.leave_date) details.push(`Vacated: ${formatDate(m.leave_date)}`);
      if (m.notes) details.push(`Reason: ${m.notes}`);
    } else if (a.action === 'resident_moved_bed') {
      const resident = getResident(a.entity_id);
      text = `${resident.name} moved to a new bed`;
      const oldLocation = getBedLocation(m.old_bed_id);
      const newLocation = getBedLocation(m.new_bed_id);
      if (oldLocation) details.push(`From: ${oldLocation}`);
      if (newLocation) details.push(`To: ${newLocation}`);
    } else if (a.action === 'resident_confirmed_move_in') {
      const residentName = m.name || 'Resident';
      text = `${residentName} confirmed move-in`;
      const location = getBedLocation(m.bed_id);
      if (location) details.push(`Bed: ${location}`);
      if (m.confirmed_date) details.push(`Date: ${formatDate(m.confirmed_date)}`);
    } else if (a.action === 'join_request_submitted') {
      const applicantName = m.name || 'New applicant';
      text = `Join request from ${applicantName}`;
      if (m.phone) details.push(`Phone: ${m.phone}`);
      if (m.preferred_room) details.push(`Preferred room: ${m.preferred_room}`);
      if (m.preferred_sharing) details.push(`Sharing: ${m.preferred_sharing}`);
    } else if (a.action === 'join_request_approved') {
      const resident = getResident(m.resident_id);
      text = `Join request approved${resident.name !== 'Resident' ? `: ${resident.name}` : ''}`;
      if (resident.phone) details.push(`Phone: ${resident.phone}`);
    } else if (a.action === 'join_request_rejected') {
      text = 'Join request rejected';
      if (m.notes) details.push(`Reason: ${m.notes}`);
    } else if (a.action === 'resident_archived') {
      const resident = getResident(a.entity_id);
      text = `${resident.name} resident record archived`;
      if (m.reason) details.push(`Reason: ${m.reason}`);
      if (m.previous_status) details.push(`Previous status: ${m.previous_status}`);
    } else if (a.action === 'resident_restored') {
      const resident = getResident(a.entity_id);
      text = `${resident.name} resident record restored`;
      if (m.reason) details.push(`Reason: ${m.reason}`);
    }

    return {
      id: a.id,
      text,
      time: timeAgo,
      icon,
      action: a.action,
      entity_type: a.entity_type || null,
      entity_id: a.entity_id || null,
      metadata: a.metadata || null,
      details,
    };
  });

  const mappedJoinRequests = (joinRequestsData || []).map((jr: any) => ({
    id: jr.id,
    name: jr.name,
    phone: jr.phone,
    emergencyContact: jr.emergency_contact || '',
    occupation: jr.occupation || '',
    preferredRoom: jr.preferred_room || '',
    preferredSharing: jr.preferred_sharing || '',
    aadharNumber: jr.aadhar_number || '',
    areaAndCity: jr.area_and_city || '',
    state: jr.state || '',
    country: jr.country || 'India',
    requestDate: (() => {
      const diff = Date.now() - new Date(jr.created_at).getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
      if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
      return 'Just now';
    })(),
    status: jr.status as 'pending' | 'approved' | 'rejected',
    stayDuration: jr.stay_duration_days || null,
    photoPath: jr.photo_path || undefined,
  }));

  return {
    hostel: mappedHostel,
    floors,
    residents: mappedResidents,
    pastResidents: mappedPastResidents,
    activities: mappedActivities,
    joinRequests: mappedJoinRequests,
    dashboardStats,
    subscriptionOverview,
  };
}

async function getRoomsPerFloorSnapshot(hostelId: string) {
  const { data: floorsData, error: floorsError } = await supabase
    .from('floors')
    .select('id, floor_number')
    .eq('hostel_id', hostelId)
    .order('floor_number', { ascending: true });

  if (floorsError) throw floorsError;

  const { data: roomsData, error: roomsError } = await supabase
    .from('rooms')
    .select('floor_id')
    .eq('hostel_id', hostelId);

  if (roomsError) throw roomsError;

  const roomCountByFloorId: Record<string, number> = {};
  for (const room of roomsData || []) {
    const floorId = room.floor_id;
    if (!floorId) continue;
    roomCountByFloorId[floorId] = (roomCountByFloorId[floorId] || 0) + 1;
  }

  const roomsPerFloor: Record<number, number> = {};
  for (const floor of floorsData || []) {
    roomsPerFloor[floor.floor_number] = roomCountByFloorId[floor.id] || 0;
  }

  return {
    numberOfFloors: (floorsData || []).length,
    numberOfRooms: (roomsData || []).length,
    roomsPerFloor,
  };
}

async function persistOnboardingSnapshot(userId: string, hostelId: string, data: any) {
  const snapshot = await getRoomsPerFloorSnapshot(hostelId);
  const totalBeds = data.totalBeds ? parseInt(String(data.totalBeds), 10) : 0;
  const securityDeposit = data.securityDeposit ? parseInt(String(data.securityDeposit), 10) : 0;

  const fieldMappings = {
    hostel_name: { source_field: 'hostelName', target_table: 'hostels', target_column: 'name' },
    owner_name: { source_field: 'ownerName', target_table: 'users', target_column: 'name' },
    phone: { source_field: 'phone', target_table: 'hostels/users', target_column: 'phone' },
    city: { source_field: 'city', target_table: 'hostels', target_column: 'city' },
    state: { source_field: 'state', target_table: 'hostels', target_column: 'state' },
    country: { source_field: 'country', target_table: 'hostels', target_column: 'country' },
    pincode: { source_field: 'pincode', target_table: 'hostels', target_column: 'pincode' },
    number_of_floors: { source_field: 'numFloors', target_table: 'hostels', target_column: null, note: 'Derived from floors rows for this hostel.' },
    rooms_per_floor: { source_field: 'roomsPerFloor', target_table: 'floors/rooms', target_column: null, note: 'Derived by grouping rooms by floor_number.' },
    number_of_rooms: { source_field: 'numRooms', target_table: 'rooms', target_column: 'room_number (count)' },
    total_beds: { source_field: 'totalBeds', target_table: 'hostels', target_column: 'total_beds' },
    sharing_configs: { source_field: 'sharingConfigs', target_table: 'onboarding', target_column: 'sharing_configs' },
    rent_due_type: { source_field: 'rentDueType', target_table: 'hostels', target_column: 'rent_cycle_type' },
    rent_due_date: { source_field: 'rentDueDate', target_table: 'hostels', target_column: 'rent_due_day' },
    security_deposit: { source_field: 'securityDeposit', target_table: 'hostels', target_column: 'security_deposit' },
  };

  const { error: onboardingError } = await supabase
    .from('onboarding')
    .upsert(
      {
        user_id: userId,
        hostel_id: hostelId,
        payload: data,
        hostel_name: data.hostelName || 'My Hostel',
        owner_name: data.ownerName || null,
        phone: data.phone || null,
        city: data.city || 'City',
        state: data.state || 'State',
        country: data.country || 'India',
        pincode: data.pincode || null,
        number_of_floors: snapshot.numberOfFloors || (data.numFloors || 1),
        number_of_rooms: snapshot.numberOfRooms || (data.numRooms || 0),
        rooms_per_floor: snapshot.roomsPerFloor,
        total_beds: totalBeds,
        sharing_configs: data.sharingConfigs || [],
        rent_due_type: data.rentDueType || '1st_of_month',
        rent_due_date: data.rentDueDate || 1,
        security_deposit: securityDeposit,
        field_mappings: fieldMappings,
      },
      { onConflict: 'hostel_id' }
    );

  if (onboardingError) {
    throw onboardingError;
  }
}

async function ensureHostelStructure(hostelId: string, data: any) {
  const floorCount = Math.max(1, Number(data.numFloors) || 1);
  const { data: existingFloors, error: floorsError } = await supabase
    .from('floors').select('id, floor_number').eq('hostel_id', hostelId).order('floor_number');
  if (floorsError) throw floorsError;
  const floorByNumber = new Map((existingFloors || []).map(floor => [floor.floor_number, floor]));

  for (let floorNumber = 1; floorNumber <= floorCount; floorNumber++) {
    if (floorByNumber.has(floorNumber)) continue;
    const { data: floor, error } = await supabase.from('floors').insert({
      hostel_id: hostelId,
      floor_number: floorNumber,
      label: `Floor ${floorNumber}`,
    }).select('id, floor_number').single();
    if (error) throw error;
    if (floor) floorByNumber.set(floorNumber, floor);
  }

  const roomTargets: Array<{ floorNumber: number; roomNumber: string; floorId: string }> = [];
  for (let floorNumber = 1; floorNumber <= floorCount; floorNumber++) {
    const floor = floorByNumber.get(floorNumber);
    if (!floor) throw new Error(`Floor ${floorNumber} was not available after setup.`);
    const configuredCount = Number(data.roomsPerFloor?.[floorNumber]);
    const roomCount = configuredCount > 0
      ? configuredCount
      : Math.ceil((Number(data.numRooms) || 0) / floorCount);
    for (let roomIndex = 1; roomIndex <= roomCount; roomIndex++) {
      roomTargets.push({
        floorNumber,
        floorId: floor.id,
        roomNumber: `${floorNumber}${String(roomIndex).padStart(2, '0')}`,
      });
    }
  }

  // Onboarding creates room cards with no beds. Owners configure each room from
  // Building View using the Set Up Room action.
  for (const target of roomTargets) {
    const { data: room, error: roomLookupError } = await supabase
      .from('rooms').select('id').eq('hostel_id', hostelId)
      .eq('room_number', target.roomNumber).maybeSingle();
    if (roomLookupError) throw roomLookupError;

    if (!room) {
      const { error } = await supabase.from('rooms').insert({
        hostel_id: hostelId,
        floor_id: target.floorId,
        room_number: target.roomNumber,
        base_rent: null,
      });
      if (error) throw error;
    }
  }
}

export async function createHostelData(userId: string, data: any) {
  // Ensure user exists in public.users to prevent FK violations
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: userData.user.email || '',
        name: data.ownerName || userData.user.user_metadata?.name || 'Hostel Owner',
        phone: data.phone || null,
      }, { onConflict: 'id' });
    if (userError) {
      console.error('Failed to upsert user:', userError);
      throw userError; // Critical: user must exist for hostel FK
    }
  }

  // Check if hostel already exists
  const { data: existingHostels, error: existingHostelsError } = await supabase
    .from('hostels')
    .select('id')
    .eq('user_id', userId);
  if (existingHostelsError) throw existingHostelsError;
    
  if (existingHostels && existingHostels.length > 0) {
    // We already have a hostel, just update the profile fields
    const { data: updatedHostel, error: updateError } = await supabase
      .from('hostels')
      .update({
        name: data.hostelName || 'My Hostel',
        city: data.city || 'City',
        state: data.state || 'State',
        country: data.country || 'India',
        pincode: data.pincode || null,
        phone: data.phone || '',
        rent_cycle_type: data.rentDueType === '1st_of_month' ? 'monthly_fixed' : 'joining_based',
        rent_due_day: data.rentDueDate || 1,
        security_deposit: data.securityDeposit ? parseInt(data.securityDeposit) : 0,
        total_beds: data.totalBeds || 0,
      })
      .eq('id', existingHostels[0].id)
      .select()
      .single();
      
    if (updateError) {
      throw updateError;
    }

    await ensureHostelStructure(existingHostels[0].id, data);
    try {
      await persistOnboardingSnapshot(userId, existingHostels[0].id, data);
    } catch (snapshotError) {
      // Onboarding snapshot is storage-only; never block primary onboarding flow.
      console.warn('Failed to persist onboarding snapshot:', snapshotError);
    }
    // Skip recreating floors/rooms to prevent duplicates
    const { data: hostel, error: hostelFetchError } = await supabase.from('hostels').select('*').eq('id', existingHostels[0].id).single();
    if (hostelFetchError) throw hostelFetchError;
    return hostel;
  }

  // 1. Create Hostel
  const { data: hostel, error: hostelError } = await supabase
    .from('hostels')
    .insert({
      user_id: userId,
      name: data.hostelName || 'My Hostel',
      city: data.city || 'City',
      state: data.state || 'State',
      country: data.country || 'India',
      pincode: data.pincode || null,
      phone: data.phone || '',
      rent_cycle_type: data.rentDueType === '1st_of_month' ? 'monthly_fixed' : 'joining_based',
      rent_due_day: data.rentDueDate || 1,
      security_deposit: data.securityDeposit ? parseInt(data.securityDeposit) : 0,
      total_beds: data.totalBeds || 0,
    })
    .select()
    .single();

  if (hostelError) {
    throw hostelError;
  }

  // Create missing floors and empty room cards. Re-running after a partial
  // network failure is safe because existing floor and room records are reused.
  await ensureHostelStructure(hostel.id, data);

  try {
    await persistOnboardingSnapshot(userId, hostel.id, data);
  } catch (snapshotError) {
    // Onboarding snapshot is storage-only; never block primary onboarding flow.
    console.warn('Failed to persist onboarding snapshot:', snapshotError);
  }

  return hostel;
}

export async function addResidentDb(
  hostelId: string,
  roomId: string,
  bedId: string,
  residentData: any,
  isReserved: boolean = false,
  oldResidentId?: string
) {
  // Archive previous record to prevent duplicates in history (Bug 3 fix)
  if (oldResidentId) {
    const { error: archiveError } = await supabase
      .from('residents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', oldResidentId);
    if (archiveError) throw archiveError;
  } else if (residentData.phone) {
    // Fallback: archive by phone if ID not provided
    const { error: archiveError } = await supabase
      .from('residents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('hostel_id', hostelId)
      .eq('phone', residentData.phone)
      .eq('status', 'left');
    if (archiveError) throw archiveError;
  }

  // Use the onboarding-aware RPC so historical residents start in the current
  // IST month and do not create arrears for earlier months.
  const { data, error } = await supabase.rpc('add_resident_onboarding', {
    p_hostel_id: hostelId,
    p_room_id: roomId,
    p_bed_id: bedId,
    p_name: residentData.name,
    p_phone: residentData.phone,
    p_monthly_rent: residentData.rent || 5000,
    p_join_date: residentData.joinDate || getTodayIST(),
    p_security_deposit: residentData.securityDeposit || 0,
    p_is_deposit_paid: residentData.isDepositPaid || false,
    p_stay_duration_days: residentData.stayTime ? parseInt(residentData.stayTime as string) : null,
    p_emergency_contact: residentData.emergencyPhone,
    p_aadhar_number: residentData.aadhar,
    p_is_reserved: isReserved  // Pass reserved status to RPC
  });
  if (error) throw error;

  if (!isReserved && residentData.vacatingDate && data) {
    const { error: vacatingDateError } = await supabase
      .from('residents')
      .update({ vacating_date: residentData.vacatingDate })
      .eq('id', data as string);
    if (vacatingDateError) throw vacatingDateError;
  }

  return data;
}

/**
 * Confirm a reserved resident: atomically transition to active and create first cycle.
 * This RPC ensures:
 * - resident.status: reserved → active
 * - resident.confirmed_at = NOW()
 * - bed.status: reserved → occupied
 * - first payment cycle created in same transaction
 */
export async function confirmMoveInDb(
  residentId: string,
  confirmedDate?: string
) {
  const dateToConfirm = confirmedDate || getTodayIST();

  const { data, error } = await supabase.rpc('confirm_move_in', {
    p_resident_id: residentId,
    p_confirmed_date: dateToConfirm
  });

  if (error) throw error;
  return data;
}

export async function markAsPaidDb(residentId: string, amount: number, method: string, paymentDate?: string) {
  const paidOn = paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
    ? paymentDate
    : getTodayIST();
  const storageKey = `hostelrr:rent-payment:${JSON.stringify([residentId, amount, method.toLowerCase(), paidOn])}`;
  let requestId: string | null = null;
  try {
    requestId = window.sessionStorage.getItem(storageKey);
  } catch {
    // Continue with an in-memory request key if session storage is unavailable.
  }
  requestId ||= crypto.randomUUID();
  try {
    window.sessionStorage.setItem(storageKey, requestId);
  } catch {
    // The current RPC invocation is still idempotent for its request key.
  }

  const { data, error } = await supabase.rpc('record_resident_payment', {
    p_request_id: requestId,
    p_resident_id: residentId,
    p_amount: amount,
    p_method: method.toLowerCase(),
    p_paid_on: paidOn,
  });
  if (error) throw error;

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Successful requests can safely be retried with the same key if retained.
  }
  return { success: true, paymentIds: data };
}

export async function getHostelSubscription(hostelId: string) {
  const { data, error } = await supabase.rpc('get_hostel_subscription', { p_hostel_id: hostelId });
  if (error) throw error;
  return data as any;
}

export async function submitHostelSubscriptionPayment(hostelId: string, paymentReference: string, paidOn: string) {
  const { data, error } = await supabase.rpc('submit_subscription_payment', {
    p_hostel_id: hostelId,
    p_payment_reference: paymentReference,
    p_claimed_paid_on: paidOn,
  });
  if (error) throw error;
  return data as string;
}

export async function getPlatformAdminStatus() {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) throw error;
  return data === true;
}

export async function getAdminSubscriptionPlans() {
  const { data, error } = await supabase.rpc('admin_list_subscription_plans');
  if (error) throw error;
  return data || [];
}

export async function getAdminSubscriptionPayments() {
  const { data, error } = await supabase.rpc('admin_list_subscription_payments');
  if (error) throw error;
  return data || [];
}

export async function getAdminSubscriptionPaymentSettings() {
  const { data, error } = await supabase.rpc('admin_get_subscription_payment_settings');
  if (error) throw error;
  return data?.[0] || { upi_vpa: '', payee_name: '' };
}

export async function setAdminSubscriptionPlanActive(planId: string, active: boolean) {
  const { error } = await supabase.rpc('admin_set_subscription_plan_active', {
    p_plan_id: planId,
    p_active: active,
  });
  if (error) throw error;
}

export async function saveAdminSubscriptionPlan(plan: any) {
  const { data, error } = await supabase.rpc('admin_upsert_subscription_plan', {
    p_plan_id: plan.id || null,
    p_name: plan.name,
    p_min_beds: plan.minBeds,
    p_max_beds: plan.maxBeds || null,
    p_amount_inr: plan.amountInr,
    p_billing_days: plan.billingDays || 30,
  });
  if (error) throw error;
  return data as string;
}

export async function saveAdminSubscriptionPaymentSettings(upiVpa: string, payeeName: string) {
  const { error } = await supabase.rpc('admin_set_subscription_payment_settings', {
    p_upi_vpa: upiVpa,
    p_payee_name: payeeName,
  });
  if (error) throw error;
}

export async function reviewAdminSubscriptionPayment(submissionId: string, approve: boolean, reason?: string) {
  const { error } = await supabase.rpc('admin_review_subscription_payment', {
    p_submission_id: submissionId,
    p_approve: approve,
    p_reason: reason || null,
  });
  if (error) throw error;
}

export async function extendAdminHostelSubscription(hostelId: string, days: number, reason: string) {
  const { error } = await supabase.rpc('admin_extend_hostel_subscription', {
    p_hostel_id: hostelId,
    p_days: days,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function editResidentDb(residentId: string, updatedData: any) {
  // updatedData.monthlyRent = base rent amount (from resident.monthly_rent in DB)
  // updatedData.dueAmount  = outstanding debt (computed, not a DB column)
  const updatePayload: Record<string, any> = {};
  if (updatedData.name !== undefined) updatePayload.name = updatedData.name;
  if (updatedData.phone !== undefined) updatePayload.phone = updatedData.phone;
  if (updatedData.emergencyPhone !== undefined) updatePayload.emergency_contact = updatedData.emergencyPhone;
  if (updatedData.aadhar !== undefined) updatePayload.aadhar_number = updatedData.aadhar;
  if (updatedData.areaAndCity !== undefined) updatePayload.area_and_city = updatedData.areaAndCity;
  if (updatedData.state !== undefined) updatePayload.state = updatedData.state;
  if (updatedData.country !== undefined) updatePayload.country = updatedData.country;
  if (updatedData.monthlyRent !== undefined) updatePayload.monthly_rent = updatedData.monthlyRent;
  if (updatedData.securityDeposit !== undefined) updatePayload.security_deposit = updatedData.securityDeposit;
  if (updatedData.isDepositPaid !== undefined) updatePayload.is_deposit_paid = updatedData.isDepositPaid;
  if (updatedData.depositPaidDate !== undefined) updatePayload.deposit_paid_at = normalizeIstTimestamp(updatedData.depositPaidDate);
  if (updatedData.vacatingDate !== undefined) updatePayload.vacating_date = updatedData.vacatingDate || null;

  // Get resident data to fetch hostel_id for activity logging
  const { data: residentData, error: fetchError } = await supabase
    .from('residents')
    .select('hostel_id, name, security_deposit, status')
    .eq('id', residentId)
    .single();
  
  if (fetchError) throw fetchError;
  if (!residentData) throw new Error('Resident not found');
  if (residentData.status === 'reserved') updatePayload.vacating_date = null;

  const { data, error } = await supabase
    .from('residents')
    .update(updatePayload)
    .eq('id', residentId)
    .select()
    .single();
  if (error) throw error;

  // Log activity if security deposit was marked as paid
  if (updatedData.isDepositPaid === true) {
    await supabase.from('activity_logs').insert({
      hostel_id: residentData.hostel_id,
      action: 'deposit_paid',
      entity_type: 'resident',
      entity_id: residentId,
      metadata: {
        resident_name: residentData.name,
        amount: residentData.security_deposit,
        date: normalizeIstTimestamp(updatedData.depositPaidDate)
      }
    });
  }

  return data;
}

export async function addRoomDb(hostelId: string, floorId: string, roomData: any) {
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({
      hostel_id: hostelId,
      floor_id: floorId,
      room_number: roomData.number,
      base_rent: roomData.baseRent ? parseInt(String(roomData.baseRent).replace(/,/g, ''), 10) : null,
      layout_id: roomData.layoutId
    })
    .select()
    .single();

  if (roomError) throw roomError;

  // Add beds
  if (roomData.numBeds > 0) {
    const bedsToInsert = Array.from({ length: roomData.numBeds }).map((_, idx) => ({
      hostel_id: hostelId,
      room_id: room.id,
      label: String(idx + 1),
    }));
    const { error: bedError } = await supabase.from('beds').insert(bedsToInsert);
    if (bedError) throw bedError;
  }
  return room;
}

export async function updateRoomSetupDb(roomId: string, roomData: any, bedsData: { bedsToAdd: number, bedsToRemove: string[] }) {
  console.log('updateRoomSetupDb START:', { roomId, roomData, bedsData });
  
  // Update room
  const { error: roomError } = await supabase
    .from('rooms')
    .update({
      room_number: roomData.number,
      base_rent: roomData.baseRent,
      layout_id: roomData.layoutId
    })
    .eq('id', roomId);
  if (roomError) {
    console.error('roomError:', roomError);
    throw roomError;
  }

  // Remove beds
  if (bedsData.bedsToRemove.length > 0) {
    const { data: deletedBeds, error: delErr } = await supabase
      .from('beds')
      .delete()
      .in('id', bedsData.bedsToRemove)
      .select('id');
    if (delErr) throw delErr;
    if ((deletedBeds?.length || 0) !== bedsData.bedsToRemove.length) {
      throw new Error(`Removed ${deletedBeds?.length || 0} of ${bedsData.bedsToRemove.length} bed(s)`);
    }
  }

  // Add beds
  if (bedsData.bedsToAdd > 0) {
    const { data: currentBeds, error: bedsError } = await supabase.from('beds').select('label').eq('room_id', roomId);
    if (bedsError) throw bedsError;
    const existingCount = currentBeds ? currentBeds.length : 0;
    
    // We fetch hostel_id from room
    const { data: roomInfo, error: roomInfoErr } = await supabase.from('rooms').select('hostel_id').eq('id', roomId).single();
    if (roomInfoErr) throw roomInfoErr;
    
    if(roomInfo) {
      const bedsToInsert = Array.from({ length: bedsData.bedsToAdd }).map((_, idx) => ({
        hostel_id: roomInfo.hostel_id,
        room_id: roomId,
        label: String(existingCount + idx + 1),
      }));
      const { error: insErr } = await supabase.from('beds').insert(bedsToInsert);
      if (insErr) throw insErr;
    }
  }
}

export async function copyFloorLayoutDb(sourceFloorId: string, targetFloorId: string) {
  if (sourceFloorId === targetFloorId) throw new Error('Choose a different floor to copy from.');

  const [sourceFloorResult, targetFloorResult] = await Promise.all([
    supabase.from('floors').select('id, hostel_id, floor_number').eq('id', sourceFloorId).single(),
    supabase.from('floors').select('id, hostel_id, floor_number').eq('id', targetFloorId).single(),
  ]);
  if (sourceFloorResult.error) throw sourceFloorResult.error;
  if (targetFloorResult.error) throw targetFloorResult.error;
  const sourceFloor = sourceFloorResult.data;
  const targetFloor = targetFloorResult.data;
  if (sourceFloor.hostel_id !== targetFloor.hostel_id) {
    throw new Error('Source and target floors must belong to the same hostel.');
  }

  const [sourceResult, targetResult, roomNumbersResult] = await Promise.all([
    supabase.from('rooms').select('id, hostel_id, room_number, base_rent, layout_id, beds(id, label)')
      .eq('floor_id', sourceFloorId),
    supabase.from('rooms').select('id, hostel_id, room_number, beds(id, status)')
      .eq('floor_id', targetFloorId),
    supabase.from('rooms').select('room_number').eq('hostel_id', targetFloor.hostel_id),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (targetResult.error) throw targetResult.error;
  if (roomNumbersResult.error) throw roomNumbersResult.error;

  const sourceRooms = [...(sourceResult.data || [])].sort((a, b) => compareRoomNumbers(a.room_number, b.room_number));
  const targetRooms = [...(targetResult.data || [])].sort((a, b) => compareRoomNumbers(a.room_number, b.room_number));
  if (targetRooms.some(room => room.beds?.some((bed: any) => bed.status !== 'vacant'))) {
    throw new Error('Target floor has occupied or reserved beds. Move residents first.');
  }

  // Bed and room rows with resident history cannot be deleted safely.
  const targetRoomIds = targetRooms.map(room => room.id);
  if (targetRoomIds.length > 0) {
    const { data: linkedResidents, error: residentsError } = await supabase
      .from('residents').select('id').in('room_id', targetRoomIds);
    if (residentsError) throw residentsError;
    if (linkedResidents?.length) {
      throw new Error('Cannot replace this floor layout because resident records reference its rooms.');
    }
  }

  const extraRooms = targetRooms.slice(sourceRooms.length);
  if (extraRooms.length > 0) {
    const { error } = await supabase.from('rooms').delete().in('id', extraRooms.map(room => room.id));
    if (error) throw error;
  }

  const usedNumbers = new Set((roomNumbersResult.data || []).map(room => String(room.room_number).toLowerCase()));
  let nextRoomIndex = 1;
  for (let index = 0; index < sourceRooms.length; index++) {
    const source = sourceRooms[index];
    let target = targetRooms[index];
    let targetRoomId = target?.id;
    if (!target) {
      let roomNumber = `${targetFloor.floor_number}${String(nextRoomIndex).padStart(2, '0')}`;
      while (usedNumbers.has(roomNumber.toLowerCase())) {
        nextRoomIndex++;
        roomNumber = `${targetFloor.floor_number}${String(nextRoomIndex).padStart(2, '0')}`;
      }
      nextRoomIndex++;
      usedNumbers.add(roomNumber.toLowerCase());
      const { data: createdRoom, error } = await supabase.from('rooms').insert({
        hostel_id: targetFloor.hostel_id,
        floor_id: targetFloor.id,
        room_number: roomNumber,
        base_rent: source.base_rent,
        layout_id: source.layout_id,
      }).select('id, hostel_id, room_number').single();
      if (error) throw error;
      targetRoomId = createdRoom.id;
    } else {
      const { error } = await supabase.from('rooms').update({
        base_rent: source.base_rent,
        layout_id: source.layout_id,
      }).eq('id', target.id);
      if (error) throw error;

      const { error: bedDeleteError } = await supabase.from('beds').delete().eq('room_id', target.id);
      if (bedDeleteError) throw bedDeleteError;
    }

    if (source.beds?.length) {
      const beds = source.beds.map((bed: any) => ({
        hostel_id: targetFloor.hostel_id,
        room_id: targetRoomId!,
        label: bed.label,
      }));
      const { error } = await supabase.from('beds').insert(beds);
      if (error) throw error;
    }
  }
}

export async function deleteRoomDb(roomId: string) {
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}

export async function moveResidentToBedDb(residentId: string, roomId: string, bedId: string) {
  const { data, error } = await supabase.rpc('move_bed', {
    p_resident_id: residentId,
    p_new_bed_id: bedId,
    p_new_room_id: roomId,
  });
  if (error) throw error;
  return data;
}

export async function moveBedsDb(sourceRoomId: string, targetRoomId: string, bedIds: string[]) {
  const { data: targetRoom, error: targetRoomError } = await supabase.from('rooms').select('hostel_id, room_number').eq('id', targetRoomId).single();
  if (targetRoomError) throw targetRoomError;
  if (!targetRoom) throw new Error('Target room not found');

  // Guard: refuse to move occupied/reserved beds (would orphan the resident)
  const { data: movingBeds, error: movingBedsError } = await supabase
    .from('beds')
    .select('id, status, room_id, hostel_id')
    .in('id', bedIds);
  if (movingBedsError) throw movingBedsError;
  if ((movingBeds || []).length !== bedIds.length) throw new Error('One or more beds could not be loaded. Refresh and try again.');

  const occupiedBeds = (movingBeds || []).filter((b: any) => b.status !== 'vacant');
  if (occupiedBeds.length > 0) {
    throw new Error(`Cannot move occupied/reserved beds. Vacate residents first (${occupiedBeds.length} bed(s) blocked).`);
  }

  const sourceRoomIds = Array.from(new Set((movingBeds || []).map((b: any) => b.room_id).filter(Boolean)));
  if ((movingBeds || []).some((bed: any) => bed.room_id !== sourceRoomId || bed.hostel_id !== targetRoom.hostel_id)) {
    throw new Error('Selected vacant beds must belong to the chosen source room and same hostel. Refresh and try again.');
  }
  const { data: targetBeds, error: targetBedsError } = await supabase.from('beds').select('id, label').eq('room_id', targetRoomId);
  if (targetBedsError) throw targetBedsError;
  const { data: sourceBeds, error: sourceBedsError } = sourceRoomIds.length > 0
    ? await supabase.from('beds').select('id, room_id, label, hostel_id').in('room_id', sourceRoomIds)
    : { data: [] as any[] };
  if (sourceBedsError) throw sourceBedsError;

  // Clear layout_id for the target room because bed count changed
  const { error: targetLayoutError } = await supabase.from('rooms').update({ layout_id: null }).eq('id', targetRoomId);
  if (targetLayoutError) throw targetLayoutError;
  
  // Clear layout_id for source rooms because their bed counts also changed
  for (const sId of sourceRoomIds) {
    if (sId) {
      const { error } = await supabase.from('rooms').update({ layout_id: null }).eq('id', sId);
      if (error) throw error;
    }
  }

  const labelSorter = (a: any, b: any) => compareBedLabels(a.label, b.label);
  const movingBedMap = new Map((movingBeds || []).map((bed: any) => [bed.id, bed]));

  const sortedTargetBeds = (targetBeds || []).slice().sort(labelSorter);
  const sortedMovingBeds = bedIds
    .map((bedId) => movingBedMap.get(bedId))
    .filter(Boolean)
    .sort(labelSorter);

  const targetFinalBeds = [...sortedTargetBeds, ...sortedMovingBeds];

  for (let i = 0; i < targetFinalBeds.length; i++) {
    const { error } = await supabase.from('beds').update({
      room_id: targetRoomId,
      label: String(i + 1)
    }).eq('id', targetFinalBeds[i].id);
    if (error) throw error;
  }

  for (const sourceRoomId of sourceRoomIds) {
    const remainingBeds = (sourceBeds || [])
      .filter((bed: any) => bed.room_id === sourceRoomId && !bedIds.includes(bed.id))
      .sort(labelSorter);

    for (let i = 0; i < remainingBeds.length; i++) {
      const { error } = await supabase.from('beds').update({
        room_id: sourceRoomId,
        label: String(i + 1)
      }).eq('id', remainingBeds[i].id);
      if (error) throw error;
    }
  }
}

export async function vacateResidentDb(residentId: string) {
  const { data, error } = await supabase.rpc('vacate_resident', {
    p_resident_id: residentId,
  });
  if (error) throw error;
  return data;
}

/**
 * Archive (soft delete) a resident
 * @param residentId The resident ID to archive
 * @param reason Optional reason for archival (logged to audit trail)
 * 
 * CRITICAL: This soft-deletes the resident (marks deleted_at), but:
 * - Payment history is PRESERVED FOREVER
 * - Payment cycles are PRESERVED FOREVER
 * - Bed becomes vacant
 * - Can be restored via restoreResidentDb()
 */
export async function archiveResidentDb(residentId: string, reason?: string) {
  const { data, error } = await supabase.rpc('archive_resident', {
    p_resident_id: residentId,
    p_reason: reason || null,
  });
  if (error) throw error;
  return data;
}

export async function deletePastResidentDb(residentId: string): Promise<'deleted' | 'anonymized'> {
  const result = await callPhotoFunction<{ disposition?: string }>({ action: 'resident-history-delete', residentId });
  return result.disposition === 'anonymized' ? 'anonymized' : 'deleted';
}

/**
 * Restore an archived resident (undo archiveResidentDb)
 * @param residentId The resident ID to restore
 */
export async function restoreResidentDb(residentId: string) {
  const { data, error } = await supabase.rpc('restore_resident', {
    p_resident_id: residentId,
  });
  if (error) throw error;
  return data;
}

export async function fetchPublicHostelForJoin(hostelId: string): Promise<{ id: string; hostelName: string; contactPhone?: string } | null> {
  const { data, error } = await supabase.rpc('get_public_hostel_for_join', {
    p_hostel_ref: hostelId,
  });
  if (error) throw error;
  const hostel = Array.isArray(data) ? data[0] : data;
  return hostel?.id ? {
    id: hostel.id,
    hostelName: hostel.hostel_name,
    contactPhone: hostel.contact_phone || undefined,
  } : null;
}

export async function approveJoinRequestDb(params: {
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
}) {
  const { data, error } = await supabase.rpc('approve_join_request', {
    p_request_id: params.requestId,
    p_room_id: params.roomId,
    p_bed_id: params.bedId,
    p_monthly_rent: params.monthlyRent,
    p_join_date: params.joinDate || getTodayIST(),
    p_security_deposit: params.securityDeposit ?? 0,
    p_is_deposit_paid: params.isDepositPaid ?? false,
    p_stay_duration_days: params.stayDurationDays ?? null,
    p_review_notes: params.reviewNotes ?? null,
    p_vacating_date: params.vacatingDate ?? null,
  });

  if (error) throw error;
  return data;
}

export async function rejectJoinRequestDb(params: {
  requestId: string;
  reviewNotes?: string | null;
}) {
  await callPhotoFunction({
    action: 'join-reject',
    requestId: params.requestId,
    reviewNotes: params.reviewNotes ?? null,
  });
  return true;
}

export async function updateHostelData(userId: string, hostelId: string, updatedProfile: any) {
  // Update User Table
  if (updatedProfile.ownerName || updatedProfile.phone || updatedProfile.email) {
    const { error: userError } = await supabase
      .from('users')
      .update({
        name: updatedProfile.ownerName,
        phone: updatedProfile.phone,
        email: updatedProfile.email,
      })
      .eq('id', userId);
    if (userError) console.error('Failed to update user:', userError);
  }

  // Update Hostel Table
  if (hostelId) {
    const { error: hostelError } = await supabase
      .from('hostels')
      .update({
        name: updatedProfile.hostelName,
        city: updatedProfile.city,
        state: updatedProfile.state,
        country: updatedProfile.country,
        pincode: updatedProfile.pincode,
        reminder_template: updatedProfile.reminderTemplate,
      })
      .eq('id', hostelId);
    if (hostelError) throw hostelError;
  }
}

// Photo uploads use the resident-photo Edge Function and Cloudflare R2.

// =============================================================================
// Bed Layout Templates
// Store bed layout templates in database for persistence across devices
// =============================================================================

export interface BedLayoutTemplate {
  id: string;
  sharing: number;
  positions: Record<string, { x: number; y: number; rotated: boolean }>;
  door: 'N' | 'S' | 'E' | 'W' | null;
  color: string;
  pillSize: number;
}

/**
 * Fetch all bed layout templates for a hostel
 * @param hostelId The hostel ID
 * @returns Array of templates
 */
export async function getBedLayoutTemplates(hostelId: string): Promise<BedLayoutTemplate[]> {
  const { data, error } = await supabase
    .from('bed_layout_templates')
    .select('*')
    .eq('hostel_id', hostelId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch bed layout templates:', error);
    throw error;
  }

  return (data || []).map((t: any) => ({
    id: t.id,
    sharing: t.sharing,
    positions: normalizeBedLayoutPositions(t.positions),
    door: t.door,
    color: t.color,
    pillSize: Number(t.pill_size || 1.0),
  }));
}

/**
 * Save or update a bed layout template
 * @param hostelId The hostel ID
 * @param template The template to save
 * @returns The saved template
 */
export async function saveBedLayoutTemplate(
  hostelId: string,
  template: Partial<BedLayoutTemplate>
): Promise<BedLayoutTemplate> {
  if (!template.sharing || !template.positions) {
    throw new Error('Template must have sharing and positions');
  }

  const normalizedPositions = normalizeBedLayoutPositions(template.positions as Record<string, { x: number; y: number; rotated: boolean }>);

  // If template has a non-empty ID, update it; otherwise insert (let DB generate UUID)
  if (template.id && template.id.length > 0) {
    const { data, error } = await supabase
      .from('bed_layout_templates')
      .update({
        sharing: template.sharing,
        positions: normalizedPositions,
        door: template.door || null,
        color: template.color || 'Blue',
        pill_size: template.pillSize || 1.0,
      })
      .eq('id', template.id)
      .eq('hostel_id', hostelId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update bed layout template:', error);
      throw error;
    }

    return {
      id: data.id,
      sharing: data.sharing,
      positions: normalizeBedLayoutPositions(data.positions),
      door: data.door,
      color: data.color,
      pillSize: Number(data.pill_size || 1.0),
    };
  } else {
    // Insert new template
    const { data, error } = await supabase
      .from('bed_layout_templates')
      .insert({
        hostel_id: hostelId,
        sharing: template.sharing,
        positions: normalizedPositions,
        door: template.door || null,
        color: template.color || 'Blue',
        pill_size: template.pillSize || 1.0,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create bed layout template:', error);
      throw error;
    }

    return {
      id: data.id,
      sharing: data.sharing,
      positions: normalizeBedLayoutPositions(data.positions),
      door: data.door,
      color: data.color,
      pillSize: Number(data.pill_size || 1.0),
    };
  }
}

/**
 * Delete a bed layout template
 * @param templateId The template ID to delete
 */
export async function deleteBedLayoutTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('bed_layout_templates')
    .delete()
    .eq('id', templateId);

  if (error) {
    console.error('Failed to delete bed layout template:', error);
    throw error;
  }
}

