import { supabase } from '../supabaseClient';
import { Floor, Room, Bed, Resident, JoinRequest } from '../data/mock';

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
  const { data: joinRequestsData } = await supabase
    .from('join_requests')
    .select('*')
    .eq('hostel_id', hostelId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Build the nested structure Floor[] -> Room[] -> Bed[]
  const floors: Floor[] = (floorsData || []).map((f: any) => {
    const floorRooms = (roomsData || [])
      .filter((r: any) => r.floor_id === f.id)
      .map((r: any) => {
        const roomBeds = (bedsData || [])
          .filter((b: any) => b.room_id === r.id)
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

  const mappedResidents = (residentsData || []).map((r: any) => {
    const resCycles = (cyclesData || []).filter((c: any) => c.resident_id === r.id);
    let paymentStatus = 'paid';
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
      dueDate: pendingCycles.length > 0 ? pendingCycles.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0].due_date : '',
      documentsComplete: true,
      photoUrl: undefined,
      emergencyPhone: r.emergency_contact || '',
      aadhar: r.aadhar_number || '',
      stayTime,
      securityDeposit: r.security_deposit || 0,
      isDepositPaid: r.is_deposit_paid || false,
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
            method: p.method === 'cash' ? 'Cash' : 'UPI',
            title: `Rent Payment`
          };
        })
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  });

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

  const mappedPastResidents = uniquePastResidents.map((r: any) => ({
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    roomId: r.room_id || '',
    bedId: r.bed_id || '',
    joinDate: r.join_date || '',
    vacateDate: r.actual_leave_date || r.updated_at || '',
    reason: r.notes || 'Vacated',
    photoUrl: undefined,
    emergencyPhone: r.emergency_contact || '',
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
          method: p.method === 'cash' ? 'Cash' : 'UPI',
          title: `Rent Payment`
        };
      })
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  }));

  const mappedActivities = (activityLogsData || []).map((a: any) => {
    let icon = 'CheckCircle';
    if (a.action.includes('resident')) icon = 'UserPlus';
    if (a.action.includes('payment')) icon = 'IndianRupee';
    if (a.action.includes('vacate') || a.action === 'resident_vacated') icon = 'LogOut';
    
    // basic time ago
    const diff = Date.now() - new Date(a.created_at).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    let timeAgo = 'Just now';
    if (days > 0) timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
    else if (hours > 0) timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;

    let text = a.notes || a.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
  }));

  return { hostel: mappedHostel, floors, residents: mappedResidents, pastResidents: mappedPastResidents, activities: mappedActivities, joinRequests: mappedJoinRequests };
}

export async function createHostelData(userId: string, data: any) {
  // Ensure user exists in public.users to prevent FK violations
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    const { error: userError } = await supabase
      .from('users')
      .update({
        name: data.ownerName || userData.user.user_metadata?.name || 'Hostel Owner',
      })
      .eq('id', userId);
    if (userError) console.error('Failed to update user:', userError);
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
        phone: data.phone || '',
        rent_cycle_type: data.rentDueType === '1st_of_month' ? 'monthly_fixed' : 'joining_based',
        rent_due_day: data.rentDueDate || 1,
        grace_period_days: data.gracePeriod || 5,
        security_deposit: data.securityDeposit ? parseInt(data.securityDeposit) : 0,
        total_beds: data.totalBeds || 0,
      })
      .eq('id', existingHostels[0].id)
      .select()
      .single();
      
    if (updateError) {
      throw updateError;
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
      phone: data.phone || '',
      rent_cycle_type: data.rentDueType === '1st_of_month' ? 'monthly_fixed' : 'joining_based',
      rent_due_day: data.rentDueDate || 1,
      grace_period_days: data.gracePeriod || 5,
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
      
      const { data: roomObj } = await supabase
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
    p_aadhar_number: residentData.aadhar,
    p_email: residentData.email
  });
  if (error) throw error;
  
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
        p_paid_on: (() => {
          if (!paymentDate) return new Date().toISOString();
          // If paymentDate is just YYYY-MM-DD, append the current time
          if (/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
            const currentTime = new Date().toISOString().split('T')[1];
            return `${paymentDate}T${currentTime}`;
          }
          return paymentDate;
        })()
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
  if (updatedData.monthlyRent !== undefined) updatePayload.monthly_rent = updatedData.monthlyRent;
  if (updatedData.isDepositPaid !== undefined) updatePayload.is_deposit_paid = updatedData.isDepositPaid;

  const { data, error } = await supabase
    .from('residents')
    .update(updatePayload)
    .eq('id', residentId)
    .select()
    .single();
  if (error) throw error;
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
      console.log('Inserting beds:', bedsToInsert);
      const { error: insErr } = await supabase.from('beds').insert(bedsToInsert);
      if (insErr) console.error('insErr:', insErr);
    }
  }
  console.log('updateRoomSetupDb DONE');
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

  const { data: existingBeds } = await supabase.from('beds').select('label').eq('room_id', targetRoomId);
  const existingCount = existingBeds ? existingBeds.length : 0;

  for (let i = 0; i < bedIds.length; i++) {
    const newLabel = String.fromCharCode(65 + existingCount + i);
    await supabase.from('beds').update({
      room_id: targetRoomId,
      label: newLabel
    }).eq('id', bedIds[i]);
  }
}

export async function vacateResidentDb(residentId: string) {
  const { data, error } = await supabase.rpc('vacate_resident', {
    p_resident_id: residentId,
  });
  if (error) throw error;
  return data;
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
        address: updatedProfile.address,
        city: updatedProfile.city,
        state: updatedProfile.state,
      })
      .eq('id', hostelId);
    if (hostelError) throw hostelError;
  }
}


