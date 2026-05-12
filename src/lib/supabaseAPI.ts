import { supabase } from '../supabaseClient';
import { Floor, Room, Bed, Resident, JoinRequest } from '../data/mock';

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

export async function getSignedFileUrl(path?: string | null): Promise<string | undefined> {
  if (!path) return undefined;

  const normalizedPath = path.replace(/^\/+/, '');
  const bucket = supabase.storage.from('hostelrr-documents');

  const signPath = async (candidatePath: string) => {
    const { data, error } = await bucket.createSignedUrl(candidatePath, 60 * 60);
    return error ? undefined : data?.signedUrl;
  };

  try {
    const directUrl = await signPath(normalizedPath);
    if (directUrl) return directUrl;

    const leafName = normalizedPath.split('/').pop();
    if (leafName && leafName !== normalizedPath) {
      const leafUrl = await signPath(leafName);
      if (leafUrl) return leafUrl;
    }

    const lastSlash = normalizedPath.lastIndexOf('/');
    if (lastSlash === -1) return undefined;

    const folderPath = normalizedPath.slice(0, lastSlash);
    const fileName = normalizedPath.slice(lastSlash + 1);

    const { data: listing } = await bucket.list(folderPath, {
      limit: 100,
      search: fileName,
    });

    if (!listing || listing.length === 0) return undefined;

    const exactMatch = listing.find(item => item.name === fileName);
    const fallbackMatch = exactMatch || listing.find(item => item.name.endsWith(fileName)) || listing[0];
    if (!fallbackMatch) return undefined;

    return await signPath(`${folderPath}/${fallbackMatch.name}`);
  } catch (err) {
    // Silently handle errors - file may not exist or folder may not be listable.
    return undefined;
  }
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
  const { data: floorsData, error: floorsError } = await supabase
    .from('floors')
    .select('*')
    .eq('hostel_id', hostelId)
    .order('floor_number', { ascending: true });

  // 3. Get Rooms
  const { data: roomsData, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('hostel_id', hostelId);

  // 4. Get Beds
  const { data: bedsData, error: bedsError } = await supabase
    .from('beds')
    .select('*')
    .eq('hostel_id', hostelId);

  // 5. Get Residents
  const { data: residentsData, error: residentsError } = await supabase
    .from('residents')
    .select('*')
    .eq('hostel_id', hostelId)
    .eq('status', 'active');

  // 6. Get Payment Cycles
  const { data: cyclesData } = await supabase
    .from('payment_cycles')
    .select('*')
    .eq('hostel_id', hostelId);

  // 7. Get Payments
  const { data: paymentsData } = await supabase
    .from('payments')
    .select('*')
    .eq('hostel_id', hostelId);

  // 8. Get Past Residents
  const { data: pastResidentsData } = await supabase
    .from('residents')
    .select('*')
    .eq('hostel_id', hostelId)
    .eq('status', 'left');

  // 9. Get Activity Logs
  const { data: activityLogsData } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('hostel_id', hostelId)
    .order('created_at', { ascending: false })
    .limit(20);

  // 10. Get Join Requests (pending only)
  // Use RPC so dashboard does not depend on direct table read permissions.
  const { data: joinRequestsData, error: joinRequestsError } = await supabase.rpc('get_join_requests', {
    p_hostel_id: hostelId,
    p_status: 'pending',
  });

  if (joinRequestsError) {
    console.error('fetchHostelData join_requests error:', joinRequestsError);
  }

  // Build the nested structure Floor[] -> Room[] -> Bed[]
  const floors: Floor[] = (floorsData || []).map((f: any) => {
    const floorRooms = (roomsData || [])
      .filter((r: any) => r.floor_id === f.id)
      .map((r: any) => {
        const roomBeds = (bedsData || [])
          .filter((b: any) => b.room_id === r.id)
          .sort((a: any, b: any) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' }))
          .map((b: any) => {
            // Find active resident in this bed
            const resident = (residentsData || []).find((res: any) => res.bed_id === b.id);
            
            let displayStatus = b.status;
            if (resident && displayStatus === 'occupied') {
              const resCycles = (cyclesData || []).filter((c: any) => c.resident_id === resident.id);
              const hasDue = resCycles.some((c: any) => ['pending', 'late', 'partial'].includes(c.status));
              if (hasDue) {
                displayStatus = 'payment_due';
              }
            }
            
            return {
              id: b.id,
              name: `Bed ${b.label}`,
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
    ownerName: hostel.owner?.name,
    phone: hostel.phone || hostel.owner?.phone,
    email: hostel.owner?.email,
  };

  const mappedResidents = await Promise.all((residentsData || []).map(async (r: any) => {
    const resCycles = (cyclesData || []).filter((c: any) => c.resident_id === r.id);
    let paymentStatus: 'paid' | 'due' | 'partially_paid' | 'late' = 'paid';
    let dueAmount = 0;
    
    // Sort cycles by date descending, find earliest due cycle
    const pendingCycles = resCycles.filter((c: any) => ['pending', 'late', 'partial'].includes(c.status));
    
    if (pendingCycles.length > 0) {
      dueAmount = pendingCycles.reduce((sum: number, c: any) => sum + (c.total_amount - c.paid_amount), 0);
      const today = new Date().toISOString().split('T')[0];
      // Treat as late if DB says late OR if due_date is already past (cron may not have run yet)
      const hasLate = pendingCycles.some((c: any) =>
        c.status === 'late' || (c.status === 'pending' && c.due_date < today)
      );
      const isPartialOnly = !hasLate && pendingCycles.every((c: any) => c.status === 'partial');
      paymentStatus = hasLate ? 'late' : (isPartialOnly ? 'partially_paid' : 'due');
    }

    // Compute stayTime from join_date
    let stayTime = 'Just Joined';
    if (r.join_date) {
      const joinMs = new Date(r.join_date).getTime();
      const nowMs = Date.now();
      const diffDays = Math.floor((nowMs - joinMs) / (1000 * 60 * 60 * 24));
      if (diffDays >= 365) stayTime = `${Math.floor(diffDays / 365)}y ${Math.floor((diffDays % 365) / 30)}m`;
      else if (diffDays >= 30) stayTime = `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''}`;
      else if (diffDays > 0) stayTime = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }

    const photoUrl = await getSignedFileUrl(r.photo_path);
    const aadharDocumentUrl = await getSignedFileUrl(r.aadhar_document_path);
    const hostelFormUrl = await getSignedFileUrl(r.hostel_form_path);

    return {
      id: r.id,
      name: r.name,
      phone: r.phone || '',
      roomId: r.room_id || '',
      bedId: r.bed_id || '',
      joinDate: r.join_date || '',
      monthlyRent: r.monthly_rent || 0,
      paymentStatus,
      dueAmount,
      dueDate: pendingCycles.length > 0 
        ? pendingCycles.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0].due_date 
        : (() => {
            // Find the most recent cycle start to project the next one
            const sortedAll = (resCycles || []).sort((a: any, b: any) => new Date(b.cycle_start).getTime() - new Date(a.cycle_start).getTime());
            if (sortedAll.length > 0 && sortedAll[0].cycle_start) {
              const last = new Date(sortedAll[0].cycle_start);
              if (!isNaN(last.getTime())) {
                last.setMonth(last.getMonth() + 1);
                return last.toISOString().split('T')[0];
              }
            }
            // Fallback to join date or today
            return r.join_date || new Date().toISOString().split('T')[0];
          })(),
      documentsComplete: Boolean(r.aadhar_document_path && r.hostel_form_path),
      photoUrl,
      photoPath: r.photo_path || undefined,
      aadharDocumentPath: r.aadhar_document_path || undefined,
      aadharDocumentUrl,
      hostelFormPath: r.hostel_form_path || undefined,
      hostelFormUrl,
      emergencyPhone: r.emergency_contact || '',
      aadhar: r.aadhar_number || '',
      areaAndCity: r.area_and_city || '',
      state: r.state || '',
      country: r.country || 'India',
      stayTime,
      securityDeposit: r.security_deposit || 0,
      isDepositPaid: r.is_deposit_paid || false,
      depositPaidDate: r.deposit_paid_at || undefined,
      vacatingDate: r.vacating_date || undefined,
      paymentHistory: (paymentsData || [])
        .filter((p: any) => p.resident_id === r.id)
        .map((p: any) => {
          const cycle = (cyclesData || []).find((c: any) => c.id === p.cycle_id);
          const isPartial = cycle && (p.amount < cycle.total_amount);
          return {
            id: p.id,
            date: p.created_at || p.paid_on,
            amount: p.amount,
            status: isPartial ? 'partial' : 'paid',
            method: (p.method === 'cash' ? 'Cash' : 'UPI') as 'Cash' | 'UPI',
            title: `Rent Payment`
          };
        })
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      createdAt: r.created_at,
    };
  }));

  // Deduplicate past residents by phone number, keeping only the most recent stay (Bug 3 fix)
  const uniquePastResidents: any[] = [];
  const seenPhones = new Set();
  
  // Sort by date descending first to ensure we keep the latest one
  const sortedRawPast = (pastResidentsData || []).sort((a: any, b: any) => 
    new Date(b.actual_leave_date || b.updated_at).getTime() - new Date(a.actual_leave_date || a.updated_at).getTime()
  );

  for (const r of sortedRawPast) {
    if (!r.phone || !seenPhones.has(r.phone)) {
      // Also ensure they aren't currently active
      const isActive = (residentsData || []).some((active: any) => active.phone === r.phone);
      if (!isActive) {
        if (r.phone) seenPhones.add(r.phone);
        uniquePastResidents.push(r);
      }
    }
  }

  const mappedPastResidents = await Promise.all(uniquePastResidents.map(async (r: any) => ({
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    roomId: r.room_id || '',
    bedId: r.bed_id || '',
    joinDate: r.join_date || '',
    vacateDate: r.actual_leave_date || r.updated_at || '',
    reason: r.notes || 'Vacated',
    photoUrl: await getSignedFileUrl(r.photo_path),
    photoPath: r.photo_path || undefined,
    emergencyPhone: r.emergency_contact || '',
    areaAndCity: r.area_and_city || '',
    state: r.state || '',
    country: r.country || 'India',
    paymentHistory: (paymentsData || [])
      .filter((p: any) => p.resident_id === r.id)
      .map((p: any) => {
        const cycle = (cyclesData || []).find((c: any) => c.id === p.cycle_id);
        const isPartial = cycle && (p.amount < cycle.total_amount);
        return {
          id: p.id,
          date: p.created_at || p.paid_on,
          amount: p.amount,
          status: isPartial ? 'partial' : 'paid',
          method: (p.method === 'cash' ? 'Cash' : 'UPI') as 'Cash' | 'UPI',
          title: `Rent Payment`
        };
      })
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
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
    
    const getNames = (rId: string) => {
      const active = mappedResidents.find((r: any) => r.id === rId);
      if (active) return { name: active.name, bed: active.bedId ? mappedHostel.id : '' }; // Simplified
      const past = mappedPastResidents.find((r: any) => r.id === rId);
      if (past) return { name: past.name, bed: '' };
      return { name: 'Resident', bed: '' };
    };

    if (a.action === 'resident_added' && m.name) {
      text = `New Resident Joined: ${m.name}`;
    } else if (a.action === 'payment_recorded') {
      const { name } = getNames(m.resident_id);
      text = `Payment of ₹${m.amount} received from ${name}`;
    } else if (a.action === 'deposit_paid') {
      const { name } = getNames(a.entity_id);
      text = `Security Deposit of ₹${m.amount} received from ${name}`;
    } else if (a.action === 'resident_vacated') {
      const { name } = getNames(a.entity_id);
      text = `${name} vacated their bed`;
    } else if (a.action === 'resident_moved_bed') {
      const { name } = getNames(a.entity_id);
      text = `${name} moved to a new bed`;
    }

    return {
      id: a.id,
      text,
      time: timeAgo,
      icon,
    };
  });

  const mappedJoinRequests = (joinRequestsData || []).map((jr: any) => ({
    id: jr.id,
    name: jr.name,
    phone: jr.phone,
    emergencyContact: jr.emergency_contact || '',
    occupation: jr.occupation || '',
    preferredRoom: jr.preferred_room || '',
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
    aadharDocumentPath: jr.aadhar_document_path || undefined,
  }));

  const mappedJoinRequestsWithUrls = await Promise.all(
    mappedJoinRequests.map(async (jr: any) => ({
      ...jr,
      photoUrl: await getSignedFileUrl(jr.photoPath),
      aadharDocumentUrl: await getSignedFileUrl(jr.aadharDocumentPath),
    }))
  );

  return { hostel: mappedHostel, floors, residents: mappedResidents, pastResidents: mappedPastResidents, activities: mappedActivities, joinRequests: mappedJoinRequestsWithUrls };
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
  const { data: existingHostels } = await supabase
    .from('hostels')
    .select('id')
    .eq('user_id', userId);
    
  let activeHostelId = null;

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

    try {
      await persistOnboardingSnapshot(userId, existingHostels[0].id, data);
    } catch (snapshotError) {
      // Onboarding snapshot is storage-only; never block primary onboarding flow.
      console.warn('Failed to persist onboarding snapshot:', snapshotError);
    }
    
    // Skip recreating floors/rooms to prevent duplicates
    const { data: hostel } = await supabase.from('hostels').select('*').eq('id', existingHostels[0].id).single();
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

  // 2. Create Floors and empty Rooms based on onboarding logic
  const floorCount = data.numFloors || 1;

  for (let f = 1; f <= floorCount; f++) {
    const { data: floorObj } = await supabase
      .from('floors')
      .insert({
        hostel_id: hostel.id,
        floor_number: f,
        label: `Floor ${f}`,
      })
      .select()
      .single();

    const roomCountThisFloor = data.roomsPerFloor?.[f]
      ? parseInt(data.roomsPerFloor[f])
      : Math.ceil((data.numRooms || 0) / floorCount);

    for (let r = 1; r <= roomCountThisFloor; r++) {
      const roomNumStr = `${f}${String(r).padStart(2, '0')}`;
      let baseRentForRoom: number | null = null;
      
      await supabase
        .from('rooms')
        .insert({
          hostel_id: hostel.id,
          floor_id: floorObj?.id,
          room_number: roomNumStr,
          base_rent: baseRentForRoom,
        })
        .select()
        .single();
    }
  }

  try {
    await persistOnboardingSnapshot(userId, hostel.id, data);
  } catch (snapshotError) {
    // Onboarding snapshot is storage-only; never block primary onboarding flow.
    console.warn('Failed to persist onboarding snapshot:', snapshotError);
  }

  return hostel;
}

export async function addResidentDb(hostelId: string, roomId: string, bedId: string, residentData: any, isReservedOnly: boolean = false, oldResidentId?: string) {
  // Archive previous record to prevent duplicates in history (Bug 3 fix)
  if (oldResidentId) {
    await supabase
      .from('residents')
      .update({ status: 'archived' })
      .eq('id', oldResidentId);
  } else if (residentData.phone) {
    // Fallback: archive by phone if ID not provided
    await supabase
      .from('residents')
      .update({ status: 'archived' })
      .eq('hostel_id', hostelId)
      .eq('phone', residentData.phone)
      .eq('status', 'left');
  }

  const { data, error } = await supabase.rpc('add_resident', {
    p_hostel_id: hostelId,
    p_room_id: roomId,
    p_bed_id: bedId,
    p_name: residentData.name,
    p_phone: residentData.phone,
    p_monthly_rent: residentData.rent || 5000,
    p_join_date: residentData.joinDate || new Date().toISOString().split('T')[0],
    p_security_deposit: residentData.securityDeposit || 0,
    p_is_deposit_paid: residentData.isDepositPaid || false,
    p_stay_duration_days: residentData.stayTime ? parseInt(residentData.stayTime as string) : null,
    p_emergency_contact: residentData.emergencyPhone,
    p_aadhar_number: residentData.aadhar
  });
  if (error) throw error;

  if (residentData.vacatingDate && data) {
    const { error: vacatingDateError } = await supabase
      .from('residents')
      .update({ vacating_date: residentData.vacatingDate })
      .eq('id', data as string);
    if (vacatingDateError) throw vacatingDateError;
  }
  
  if (isReservedOnly) {
    const { error: bedError } = await supabase
      .from('beds')
      .update({ status: 'reserved' })
      .eq('id', bedId);
    if (bedError) console.error("Could not set bed as reserved:", bedError);
  }
  
  return data;
}

export async function markAsPaidDb(residentId: string, amount: number, method: string, paymentDate?: string) {
  // First find the oldest pending payment cycle for this resident
  const { data: cycles, error: cycleError } = await supabase
    .from('payment_cycles')
    .select('id, total_amount, paid_amount')
    .eq('resident_id', residentId)
    .in('status', ['pending', 'late', 'partial'])
    .order('due_date', { ascending: true });
    
  if (cycleError) throw cycleError;
  if (!cycles || cycles.length === 0) {
    throw new Error('No pending payment cycles found for this resident.');
  }

  let remainingParamAmount = amount;

  // Pay potentially multiple cycles if they have more dues?
  // Let's just allocate amount across cycles
  for (const cycle of cycles) {
    if (remainingParamAmount <= 0) break;
    const dueForCycle = cycle.total_amount - cycle.paid_amount;
    const amountToApply = Math.min(remainingParamAmount, dueForCycle);
    
    if (amountToApply > 0) {
      const { data, error } = await supabase.rpc('mark_payment', {
        p_cycle_id: cycle.id,
        p_amount: amountToApply,
        p_method: method.toLowerCase(),
        p_paid_on: normalizeIstTimestamp(paymentDate)
      });
      if (error) throw error;
      remainingParamAmount -= amountToApply;
    }
  }

  return { success: true };
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
  if (updatedData.photoPath !== undefined) updatePayload.photo_path = updatedData.photoPath;
  if (updatedData.aadharPath !== undefined) updatePayload.aadhar_document_path = updatedData.aadharPath;
  if (updatedData.hostelFormPath !== undefined) updatePayload.hostel_form_path = updatedData.hostelFormPath;
  if (updatedData.monthlyRent !== undefined) updatePayload.monthly_rent = updatedData.monthlyRent;
  if (updatedData.securityDeposit !== undefined) updatePayload.security_deposit = updatedData.securityDeposit;
  if (updatedData.isDepositPaid !== undefined) updatePayload.is_deposit_paid = updatedData.isDepositPaid;
  if (updatedData.depositPaidDate !== undefined) updatePayload.deposit_paid_at = normalizeIstTimestamp(updatedData.depositPaidDate);
  if (updatedData.vacatingDate !== undefined) updatePayload.vacating_date = updatedData.vacatingDate || null;

  // Get resident data to fetch hostel_id for activity logging
  const { data: residentData, error: fetchError } = await supabase
    .from('residents')
    .select('hostel_id, name, security_deposit')
    .eq('id', residentId)
    .single();
  
  if (fetchError) throw fetchError;
  if (!residentData) throw new Error('Resident not found');

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
      label: String.fromCharCode(65 + idx), // A, B, C...
    }));
    await supabase.from('beds').insert(bedsToInsert);
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
    const { error: delErr } = await supabase.from('beds').delete().in('id', bedsData.bedsToRemove);
    if (delErr) console.error('delErr:', delErr);
  }

  // Add beds
  if (bedsData.bedsToAdd > 0) {
    const { data: currentBeds } = await supabase.from('beds').select('label').eq('room_id', roomId);
    const existingCount = currentBeds ? currentBeds.length : 0;
    
    // We fetch hostel_id from room
    const { data: roomInfo, error: roomInfoErr } = await supabase.from('rooms').select('hostel_id').eq('id', roomId).single();
    if (roomInfoErr) console.error('roomInfoErr:', roomInfoErr);
    
    if(roomInfo) {
      const bedsToInsert = Array.from({ length: bedsData.bedsToAdd }).map((_, idx) => ({
        hostel_id: roomInfo.hostel_id,
        room_id: roomId,
        label: String.fromCharCode(65 + existingCount + idx),
      }));
      const { error: insErr } = await supabase.from('beds').insert(bedsToInsert);
      if (insErr) console.error('updateRoomSetupDb: insertError', insErr);
    }
  }
}

export async function deleteRoomDb(roomId: string) {
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}

export async function moveBedsDb(targetRoomId: string, bedIds: string[]) {
  const { data: targetRoom } = await supabase.from('rooms').select('hostel_id, room_number').eq('id', targetRoomId).single();
  if (!targetRoom) throw new Error('Target room not found');

  // Guard: refuse to move occupied/reserved beds (would orphan the resident)
  const { data: movingBeds } = await supabase
    .from('beds')
    .select('id, status, room_id')
    .in('id', bedIds);

  const occupiedBeds = (movingBeds || []).filter((b: any) => b.status !== 'vacant');
  if (occupiedBeds.length > 0) {
    throw new Error(`Cannot move occupied/reserved beds. Vacate residents first (${occupiedBeds.length} bed(s) blocked).`);
  }

  const sourceRoomIds = Array.from(new Set((movingBeds || []).map((b: any) => b.room_id).filter(Boolean)));
  const { data: targetBeds } = await supabase.from('beds').select('id, label').eq('room_id', targetRoomId);
  const { data: sourceBeds } = sourceRoomIds.length > 0
    ? await supabase.from('beds').select('id, room_id, label').in('room_id', sourceRoomIds)
    : { data: [] as any[] };

  // Clear layout_id for the target room because bed count changed
  await supabase.from('rooms').update({ layout_id: null }).eq('id', targetRoomId);
  
  // Clear layout_id for source rooms because their bed counts also changed
  for (const sId of sourceRoomIds) {
    if (sId) {
      await supabase.from('rooms').update({ layout_id: null }).eq('id', sId);
    }
  }

  const labelSorter = (a: any, b: any) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' });
  const movingBedMap = new Map((movingBeds || []).map((bed: any) => [bed.id, bed]));

  const sortedTargetBeds = (targetBeds || []).slice().sort(labelSorter);
  const sortedMovingBeds = bedIds
    .map((bedId) => movingBedMap.get(bedId))
    .filter(Boolean)
    .sort(labelSorter);

  const targetFinalBeds = [...sortedTargetBeds, ...sortedMovingBeds];

  for (let i = 0; i < targetFinalBeds.length; i++) {
    await supabase.from('beds').update({
      room_id: targetRoomId,
      label: String.fromCharCode(65 + i)
    }).eq('id', targetFinalBeds[i].id);
  }

  for (const sourceRoomId of sourceRoomIds) {
    const remainingBeds = (sourceBeds || [])
      .filter((bed: any) => bed.room_id === sourceRoomId && !bedIds.includes(bed.id))
      .sort(labelSorter);

    for (let i = 0; i < remainingBeds.length; i++) {
      await supabase.from('beds').update({
        room_id: sourceRoomId,
        label: String.fromCharCode(65 + i)
      }).eq('id', remainingBeds[i].id);
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

export async function createJoinRequestDb(requestData: {
  hostelId: string;
  name: string;
  phone: string;
  emergencyContact?: string;
  occupation?: string;
  preferredRoom?: string;
  aadharNumber?: string;
  areaAndCity?: string;
  state?: string;
  country?: string;
  photoPath?: string | null;
  aadharDocumentPath?: string | null;
}) {
  const { data, error } = await supabase.rpc('create_join_request', {
    p_hostel_id: requestData.hostelId,
    p_name: requestData.name,
    p_phone: requestData.phone,
    p_emergency_contact: requestData.emergencyContact || null,
    p_occupation: requestData.occupation || null,
    p_preferred_room: requestData.preferredRoom || null,
    p_aadhar_number: requestData.aadharNumber || null,
    p_area_and_city: requestData.areaAndCity || null,
    p_state: requestData.state || null,
    p_country: requestData.country || 'India',
    p_photo_path: requestData.photoPath ?? null,
    p_aadhar_document_path: requestData.aadharDocumentPath ?? null,
  });

  if (error) throw error;
  return data;
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
  reviewNotes?: string | null;
}) {
  const { data, error } = await supabase.rpc('approve_join_request', {
    p_request_id: params.requestId,
    p_room_id: params.roomId,
    p_bed_id: params.bedId,
    p_monthly_rent: params.monthlyRent,
    p_join_date: params.joinDate || new Date().toISOString().split('T')[0],
    p_security_deposit: params.securityDeposit ?? 0,
    p_is_deposit_paid: params.isDepositPaid ?? false,
    p_stay_duration_days: params.stayDurationDays ?? null,
    p_review_notes: params.reviewNotes ?? null,
  });

  if (error) throw error;
  return data;
}

export async function rejectJoinRequestDb(params: {
  requestId: string;
  reviewNotes?: string | null;
}) {
  const { error } = await supabase.rpc('reject_join_request', {
    p_request_id: params.requestId,
    p_review_notes: params.reviewNotes ?? null,
  });

  if (error) throw error;
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
      })
      .eq('id', hostelId);
    if (hostelError) throw hostelError;
  }
}

// =============================================================================
// File Upload Helpers
// All uploads go to the 'hostelrr-documents' bucket with RLS-protected paths.
// Path format: {type}/{hostel_id}/{category}/{filename}
// =============================================================================

/**
 * Upload a photo to storage and return the full path.
 * Supports join requests and resident profiles.
 * @param file The file to upload
 * @param hostelId The hostel ID (used in path for RLS)
 * @param type 'join-requests' or 'residents'
 * @returns The storage path for the uploaded file
 */
export async function uploadPhoto(
  file: File,
  hostelId: string,
  type: 'join-requests' | 'residents'
): Promise<string> {
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = `${type}/${hostelId}/photo/${fileName}`;

  const { data, error } = await supabase.storage
    .from('hostelrr-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return data.path;
}

/**
 * Upload an aadhar document and return the full path.
 * @param file The file to upload
 * @param hostelId The hostel ID (used in path for RLS)
 * @param type 'join-requests' or 'residents'
 * @returns The storage path for the uploaded file
 */
export async function uploadAadharDocument(
  file: File,
  hostelId: string,
  type: 'join-requests' | 'residents'
): Promise<string> {
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = `${type}/${hostelId}/aadhar/${fileName}`;

  const { data, error } = await supabase.storage
    .from('hostelrr-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Aadhar document upload failed: ${error.message}`);
  return data.path;
}

/**
 * Upload a hostel intake form (for residents only).
 * @param file The file to upload
 * @param hostelId The hostel ID (used in path for RLS)
 * @returns The storage path for the uploaded file
 */
export async function uploadHostelForm(
  file: File,
  hostelId: string
): Promise<string> {
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = `residents/${hostelId}/hostel-form/${fileName}`;

  const { data, error } = await supabase.storage
    .from('hostelrr-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Hostel form upload failed: ${error.message}`);
  return data.path;
}

/**
 * Batch upload multiple files (used for resident profile).
 * @param files Object mapping file type to File (e.g., { photo, aadhar, hostelForm })
 * @param hostelId The hostel ID
 * @returns Object with paths for each uploaded file
 */
export async function uploadResidentDocuments(
  files: {
    photo?: File;
    aadhar?: File;
    hostelForm?: File;
  },
  hostelId: string
): Promise<{
  photoPath?: string;
  aadharPath?: string;
  hostelFormPath?: string;
}> {
  const paths: any = {};

  if (files.photo) {
    paths.photoPath = await uploadPhoto(files.photo, hostelId, 'residents');
  }
  if (files.aadhar) {
    paths.aadharPath = await uploadAadharDocument(files.aadhar, hostelId, 'residents');
  }
  if (files.hostelForm) {
    paths.hostelFormPath = await uploadHostelForm(files.hostelForm, hostelId);
  }

  return paths;
}

/**
 * Batch upload for join request (photo and aadhar only).
 * @param files Object with { photo?, aadhar? }
 * @param hostelId The hostel ID
 * @returns Object with paths
 */
export async function uploadJoinRequestDocuments(
  files: {
    photo?: File;
    aadhar?: File;
  },
  hostelId: string
): Promise<{
  photoPath?: string;
  aadharPath?: string;
}> {
  const paths: any = {};

  if (files.photo) {
    paths.photoPath = await uploadPhoto(files.photo, hostelId, 'join-requests');
  }
  if (files.aadhar) {
    paths.aadharPath = await uploadAadharDocument(files.aadhar, hostelId, 'join-requests');
  }

  return paths;
}

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
    positions: t.positions,
    door: t.door,
    color: t.color,
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

  // If template has a non-empty ID, update it; otherwise insert (let DB generate UUID)
  if (template.id && template.id.length > 0) {
    const { data, error } = await supabase
      .from('bed_layout_templates')
      .update({
        sharing: template.sharing,
        positions: template.positions,
        door: template.door || null,
        color: template.color || 'Blue',
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
      positions: data.positions,
      door: data.door,
      color: data.color,
    };
  } else {
    // Insert new template
    const { data, error } = await supabase
      .from('bed_layout_templates')
      .insert({
        hostel_id: hostelId,
        sharing: template.sharing,
        positions: template.positions,
        door: template.door || null,
        color: template.color || 'Blue',
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
      positions: data.positions,
      door: data.door,
      color: data.color,
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


