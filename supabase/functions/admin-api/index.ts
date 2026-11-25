import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

function getRecoveryAppOrigin(request: Request): string {
  const configured = (Deno.env.get('HOSTELRR_APP_URL') || 'https://hostelrr-app.vercel.app')
    .split(',')
    .map(value => value.trim().replace(/^["'`]|["'`]$/g, ''))
    .filter(Boolean);
  const allowedOrigins = configured.flatMap(value => {
    try {
      const url = new URL(value);
      const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
      if (url.protocol !== 'https:' && !localHttp) return [];
      return [url.origin];
    } catch {
      return [];
    }
  });
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const requestOrigin = new URL(origin).origin;
      if (allowedOrigins.includes(requestOrigin)) return requestOrigin;
    } catch {
      // Use configured production origin when Origin header is invalid.
    }
  }
  return allowedOrigins.find(value => value.startsWith('https://')) || allowedOrigins[0] || 'https://hostelrr-app.vercel.app';
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const bearer = request.headers.get('Authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!url || !anonKey || !serviceRoleKey || !token) return response({ error: 'Unauthorized' }, 401);

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData.user;
  if (authError || !user || user.app_metadata?.platform_role !== 'admin') {
    return response({ error: 'Administrator access required' }, 403);
  }

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const log = async (action: string, entityType: string, entityId: string | null = null, metadata: Record<string, unknown> = {}) => {
    const { error } = await db.from('subscription_admin_audit').insert({
      admin_id: user.id, action, entity_type: entityType, entity_id: entityId, metadata,
    });
    if (error) throw error;
  };
  const checked = async <T,>(query: PromiseLike<{ data: T; error: any }>): Promise<T> => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  const allAuthUsers = async () => {
    const users: any[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }
    return users;
  };
  const parseDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });

  try {
    const { action, params = {} } = await request.json();
    if (action === 'users' || action === 'dashboard' || action === 'admins') {
      const [authUsers, profiles, hostels, rooms, beds, residents, subscriptions, plans, submissions, logs, activityLogs] = await Promise.all([
        allAuthUsers(), checked(db.from('users').select('id,name,email,phone,created_at')),
        checked(db.from('hostels').select('id,user_id,name,city,state,total_beds,number_of_floors,created_at')),
        checked(db.from('rooms').select('id,hostel_id')),
        checked(db.from('beds').select('id,hostel_id,status')),
        checked(db.from('residents').select('id,hostel_id,status')),
        checked(db.from('hostel_subscriptions').select('id,hostel_id,status,trial_started_at,trial_ends_at,plan_id,current_period_start,current_period_end,created_at')),
        checked(db.from('subscription_plans').select('id,name,min_beds,max_beds,amount_inr,billing_days,active')),
        checked(db.from('subscription_payment_submissions').select('id,hostel_id,subscription_id,plan_id,claimed_amount_inr,claimed_paid_on,status,created_at,reviewed_at,review_reason,payment_reference').order('created_at', { ascending: false })),
        checked(db.from('subscription_admin_audit').select('id,admin_id,action,entity_type,entity_id,metadata,created_at').order('created_at', { ascending: false }).limit(12)),
        checked(db.from('activity_logs').select('hostel_id,created_at').order('created_at', { ascending: false }).limit(5000)),
      ]);
      const authMap = new Map(authUsers.map((u: any) => [u.id, u]));
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
      const planMap = new Map(plans.map((p: any) => [p.id, p]));
      const hostelMap = new Map(hostels.map((h: any) => [h.id, h]));
      const bedsByHostel = new Map<string, any[]>();
      for (const bed of beds) bedsByHostel.set(bed.hostel_id, [...(bedsByHostel.get(bed.hostel_id) || []), bed]);
      const residentsByHostel = new Map<string, any[]>();
      for (const resident of residents) residentsByHostel.set(resident.hostel_id, [...(residentsByHostel.get(resident.hostel_id) || []), resident]);
      const hostsByOwner = new Map<string, any[]>();
      for (const hostel of hostels) hostsByOwner.set(hostel.user_id, [...(hostsByOwner.get(hostel.user_id) || []), hostel]);
      const activityByOwner = new Map<string, string>();
      for (const event of activityLogs) {
        const hostel: any = hostelMap.get(event.hostel_id);
        if (hostel && !activityByOwner.has(hostel.user_id)) activityByOwner.set(hostel.user_id, event.created_at);
      }
      const subscriptionByHostel = new Map(subscriptions.map((s: any) => [s.hostel_id, s]));
      const now = Date.now();
      const withStatus = (s: any) => {
        if (s?.status === 'trialing' && new Date(s.trial_ends_at).getTime() <= now) return 'expired';
        if (s?.status === 'active' && (!s.current_period_end || new Date(s.current_period_end).getTime() <= now)) return 'expired';
        return s?.status || 'none';
      };
      const owners = authUsers.filter((u: any) => u.app_metadata?.platform_role !== 'admin').map((auth: any) => {
        const profile: any = profileMap.get(auth.id) || {};
        const owned: any[] = hostsByOwner.get(auth.id) || [];
        const ownerSubs = owned.map(h => subscriptionByHostel.get(h.id)).filter(Boolean);
        return {
          id: auth.id, name: profile.name || auth.user_metadata?.name || auth.email?.split('@')[0] || 'Owner',
          email: auth.email || profile.email || '', phone: profile.phone || auth.phone || '', created_at: auth.created_at,
          last_sign_in_at: auth.last_sign_in_at, last_activity_at: activityByOwner.get(auth.id) || null, status: auth.banned_until && new Date(auth.banned_until) > new Date() ? 'suspended' : 'active',
          hostel_count: owned.length, bed_count: owned.reduce((sum, h) => sum + (bedsByHostel.get(h.id)?.length || 0), 0),
          subscription_status: ownerSubs.map(withStatus).join(', ') || 'none', hostels: owned,
        };
      });
      const hostelRows = hostels.map((h: any) => {
        const profile: any = profileMap.get(h.user_id) || {};
        const sub: any = subscriptionByHostel.get(h.id);
        const hostelBeds: any[] = bedsByHostel.get(h.id) || [];
        const hostelResidents: any[] = residentsByHostel.get(h.id) || [];
        return {
          ...h, owner_name: profile.name || 'Owner', owner_email: profile.email || '', owner_phone: profile.phone || '',
        rooms_count: rooms.filter((r: any) => r.hostel_id === h.id).length, bed_count: hostelBeds.length, occupied_beds: hostelBeds.filter(b => b.status === 'occupied').length,
          resident_count: hostelResidents.filter(r => r.status === 'active').length, subscription_status: withStatus(sub),
          subscription: sub ? { ...sub, plan: planMap.get(sub.plan_id) || null } : null,
        };
      });
      const enrichedSubs = subscriptions.map((s: any) => ({ ...s, hostel: hostelMap.get(s.hostel_id), plan: planMap.get(s.plan_id) }));
      const paymentRows = submissions.map((p: any) => ({ ...p, hostel: hostelMap.get(p.hostel_id), plan: planMap.get(p.plan_id) }));
      const auditRows = logs.map((row: any) => ({ ...row, admin_email: authMap.get(row.admin_id)?.email || 'Administrator' }));
      if (action === 'users') return response({ owners });
      if (action === 'admins') return response({ admins: authUsers.filter((u: any) => u.app_metadata?.platform_role === 'admin').map((u: any) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, status: u.banned_until && new Date(u.banned_until) > new Date() ? 'suspended' : 'active' })) });
      const currentMonth = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
      const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const istMonth = (value: string) => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date(value)); return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`; };
      const ownerGrowth = Array.from({ length: 6 }, (_, i) => { const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5 + i, 1); const key = monthKey(d); return { month: key, owners: owners.filter(o => istMonth(o.created_at) === key).length, hostels: hostelRows.filter(h => istMonth(h.created_at) === key).length }; });
      const revenue = Array.from({ length: 6 }, (_, i) => { const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5 + i, 1); const key = monthKey(d); return { month: key, amount: paymentRows.filter(p => p.status === 'approved' && p.reviewed_at && istMonth(p.reviewed_at) === key).reduce((sum, p) => sum + Number(p.claimed_amount_inr || 0), 0) }; });
      return response({
        stats: { owners: owners.length, hostels: hostelRows.length, beds: beds.length, residents: residents.filter((r: any) => r.status === 'active').length,
          active_subscriptions: enrichedSubs.filter(s => withStatus(s) === 'active').length, trials: enrichedSubs.filter(s => withStatus(s) === 'trialing').length,
          expired: enrichedSubs.filter(s => withStatus(s) === 'expired').length, suspended: owners.filter(o => o.status === 'suspended').length,
          pending_payments: paymentRows.filter(p => p.status === 'pending').length,
          mrr: Math.round(enrichedSubs.filter(s => withStatus(s) === 'active').reduce((sum, s) => { const plan: any = planMap.get(s.plan_id); return sum + Number(plan?.amount_inr || 0) * 365.25 / 12 / Number(plan?.billing_days || 30); }, 0)),
          verified_revenue: paymentRows.filter(p => p.status === 'approved').reduce((sum, p) => sum + Number(p.claimed_amount_inr || 0), 0),
          pending_revenue: paymentRows.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.claimed_amount_inr || 0), 0) },
        ownerGrowth, revenue, subscriptions: enrichedSubs, payments: paymentRows, hostels: hostelRows,
        recentOwners: owners.slice().sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 6), audit: auditRows,
        subscriptionDistribution: ['active','trialing','expired','cancelled'].map(status => ({ status, count: enrichedSubs.filter(s => withStatus(s) === status).length })),
        bedsByHostel: hostelRows.slice(0, 8).map(h => ({ name: h.name, beds: h.bed_count, residents: h.resident_count })),
      });
    }

    if (action === 'demo_requests') {
      const requests = await checked(db.from('demo_requests')
        .select('id,name,phone,beds,pincode,source,created_at')
        .order('created_at', { ascending: false }).limit(500));
      return response({ requests });
    }

    if (action === 'hostels') {
      const [{ data: rows, error }, { data: profiles, error: profileError }, { data: beds }, { data: residents }, { data: subscriptions }] = await Promise.all([
        db.from('hostels').select('*').order('created_at', { ascending: false }), db.from('users').select('id,name,email,phone'),
        db.from('beds').select('id,hostel_id,status'), db.from('residents').select('id,hostel_id,status'), db.from('hostel_subscriptions').select('*'),
      ]);
      if (error || profileError) throw error || profileError;
      const profileMap = new Map(profiles.map((p: any) => [p.id,p]));
      const count = (list: any[], id: string) => list.filter(x => x.hostel_id === id);
      return response({ hostels: rows.map((h: any) => { const owner: any = profileMap.get(h.user_id) || {}; const bs = count(beds || [], h.id); const rs = count(residents || [], h.id); const sub: any = (subscriptions || []).find((s: any) => s.hostel_id === h.id); return { ...h, owner_name: owner.name || '', owner_email: owner.email || '', owner_phone: owner.phone || '', bed_count: bs.length, occupied_beds: bs.filter(b => b.status === 'occupied').length, resident_count: rs.filter(r => r.status === 'active').length, subscription_status: sub?.status || 'none', subscription: sub || null }; }) });
    }

    if (action === 'rent_payments') {
      const [payments, cycles, residents, hostels, profiles] = await Promise.all([
        checked(db.from('payments').select('id,cycle_id,resident_id,hostel_id,amount,method,transaction_ref,paid_on,created_at').order('paid_on', { ascending: false }).limit(500)),
        checked(db.from('payment_cycles').select('id,status,total_amount,paid_amount,due_date,cycle_start,cycle_end')),
        checked(db.from('residents').select('id,hostel_id,name,phone,status')),
        checked(db.from('hostels').select('id,user_id,name,city,state')),
        checked(db.from('users').select('id,name,email')),
      ]);
      const cycleMap = new Map(cycles.map((x: any) => [x.id, x]));
      const residentMap = new Map(residents.map((x: any) => [x.id, x]));
      const hostelMap = new Map(hostels.map((x: any) => [x.id, x]));
      const profileMap = new Map(profiles.map((x: any) => [x.id, x]));
      return response({ payments: payments.map((p: any) => {
        const cycle: any = cycleMap.get(p.cycle_id) || {}; const resident: any = residentMap.get(p.resident_id) || {};
        const hostel: any = hostelMap.get(p.hostel_id) || {}; const owner: any = profileMap.get(hostel.user_id) || {};
        return { ...p, cycle, resident_name: resident.name || 'Resident', resident_phone: resident.phone || '', hostel_name: hostel.name || 'Hostel', owner_name: owner.name || 'Owner', owner_email: owner.email || '', outstanding: Math.max(0, Number(cycle.total_amount || 0) - Number(cycle.paid_amount || 0)) };
      }) });
    }

    if (action === 'owner_detail') {
      const ownerId = String(params.id || '');
      const { data: authResult, error: authLookupError } = await db.auth.admin.getUserById(ownerId);
      if (authLookupError) throw authLookupError;
      if (!authResult.user || authResult.user.app_metadata?.platform_role === 'admin') return response({ error: 'Owner account not found' }, 404);
      const [profile, hostels, audits] = await Promise.all([
        checked(db.from('users').select('*').eq('id', ownerId).maybeSingle()),
        checked(db.from('hostels').select('*').eq('user_id', ownerId)),
        checked(db.from('subscription_admin_audit').select('*').eq('entity_type', 'owner').eq('entity_id', ownerId).order('created_at', { ascending: false }).limit(30)),
      ]);
      const host = await Promise.all(hostels.map(async (h: any) => {
        const [floors, rooms, beds, residents, subscriptions, cycles, payments, activities] = await Promise.all([
          checked(db.from('floors').select('*').eq('hostel_id', h.id)), checked(db.from('rooms').select('*').eq('hostel_id', h.id)),
          checked(db.from('beds').select('*').eq('hostel_id', h.id)), checked(db.from('residents').select('*').eq('hostel_id', h.id).order('created_at', { ascending: false }).limit(50)),
          checked(db.from('hostel_subscriptions').select('*,subscription_plans(*)').eq('hostel_id', h.id).maybeSingle()),
          checked(db.from('payment_cycles').select('id,status,total_amount,paid_amount,due_date,cycle_start,cycle_end').eq('hostel_id', h.id).order('due_date', { ascending: false }).limit(25)),
          checked(db.from('payments').select('id,cycle_id,amount,method,paid_on,created_at').eq('hostel_id', h.id).order('created_at', { ascending: false }).limit(25)),
          checked(db.from('activity_logs').select('*').eq('hostel_id', h.id).order('created_at', { ascending: false }).limit(20)),
        ]);
        return { ...h, floors, rooms, beds, residents, subscription: subscriptions, payment_cycles: cycles, rent_payments: payments, activity: activities };
      }));
      await log('owner_inspected', 'owner', ownerId, { mode: 'read_only' });
      const auth = authResult.user;
      return response({ owner: { id: ownerId, ...profile, name: profile?.name || auth.user_metadata?.name || '', email: auth.email, phone: profile?.phone || auth.phone, created_at: auth.created_at, last_sign_in_at: auth.last_sign_in_at, status: auth.banned_until && new Date(auth.banned_until) > new Date() ? 'suspended' : 'active' }, hostels: host, audit: audits });
    }

    if (action === 'hostel_detail') {
      const hostelId = String(params.id || '');
      const hostel = await checked(db.from('hostels').select('*').eq('id', hostelId).single());
      const [owner, floors, rooms, beds, residents, subscription, cycles, payments, activities, errorReports] = await Promise.all([
        checked(db.from('users').select('*').eq('id', hostel.user_id).single()), checked(db.from('floors').select('*').eq('hostel_id', hostelId)),
        checked(db.from('rooms').select('*').eq('hostel_id', hostelId)), checked(db.from('beds').select('*').eq('hostel_id', hostelId)),
        checked(db.from('residents').select('*').eq('hostel_id', hostelId).order('created_at', { ascending: false }).limit(100)),
        checked(db.from('hostel_subscriptions').select('*,subscription_plans(*)').eq('hostel_id', hostelId).maybeSingle()),
        checked(db.from('payment_cycles').select('id,status,total_amount,paid_amount,due_date,cycle_start,cycle_end').eq('hostel_id', hostelId).order('due_date', { ascending: false }).limit(25)),
        checked(db.from('payments').select('id,cycle_id,amount,method,paid_on,created_at').eq('hostel_id', hostelId).order('created_at', { ascending: false }).limit(25)),
        checked(db.from('activity_logs').select('*').eq('hostel_id', hostelId).order('created_at', { ascending: false }).limit(30)),
        checked(db.from('hostel_error_reports').select('id,reporter_id,comment,error_name,error_message,error_stack,component_stack,route,browser,environment,status,created_at').eq('hostel_id', hostelId).order('created_at', { ascending: false }).limit(100)),
      ]);
      await log('hostel_inspected', 'hostel', hostelId, { mode: 'read_only' });
      return response({ hostel: { ...hostel, floors, rooms, beds, residents, subscription, payment_cycles: cycles, rent_payments: payments, activity: activities }, owner, error_reports: errorReports });
    }

    if (action === 'audit') {
      const rows = await checked(db.from('subscription_admin_audit').select('*').order('created_at', { ascending: false }).limit(200));
      const ids = [...new Set(rows.map((r: any) => r.admin_id))];
      const authUsers = await allAuthUsers(); const byId = new Map(authUsers.filter((u: any) => ids.includes(u.id)).map((u: any) => [u.id,u.email]));
      return response({ audit: rows.map((r: any) => ({ ...r, admin_email: byId.get(r.admin_id) || 'Administrator' })) });
    }

    if (action === 'admin_event') {
      const event = String(params.event || '');
      if (!['admin_login', 'admin_logout'].includes(event)) return response({ error: 'Unsupported administrator event' }, 400);
      await log(event, 'platform');
      return response({ success: true });
    }

    if (action === 'settings') {
      const settings = await checked(authClient.rpc('admin_get_subscription_payment_settings'));
      const plans = await checked(authClient.rpc('admin_list_subscription_plans'));
      const [reminderDefaults, hostels] = await Promise.all([
        checked(db.from('subscription_platform_settings').select('whatsapp_reminder_template').eq('singleton', true).single()),
        checked(db.from('hostels').select('id,name,city,state,reminder_template').order('name')),
      ]);
      return response({ paymentSettings: settings?.[0] || { upi_vpa: '', payee_name: '' }, plans: plans || [], timezone: 'Asia/Kolkata', trialDays: 14, reminderTemplate: reminderDefaults.whatsapp_reminder_template, hostels, supported: ['subscription_pricing', 'subscription_upi', 'whatsapp_reminders'] });
    }

    if (action === 'set_reminder_template') {
      const template = String(params.template || '').trim();
      const hostelId = String(params.hostelId || '');
      if (!template || template.length > 5000) return response({ error: 'Template must contain 1–5000 characters.' }, 400);
      if (hostelId) {
        const hostel = await checked(db.from('hostels').select('id,name').eq('id', hostelId).single());
        await checked(db.from('hostels').update({ reminder_template: template }).eq('id', hostelId));
        await log('hostel_reminder_template_updated', 'hostel', hostelId, { hostel_name: hostel.name });
        return response({ success: true, affected: 1 });
      }
      await checked(db.from('subscription_platform_settings').update({ whatsapp_reminder_template: template, updated_by: user.id, updated_at: new Date().toISOString() }).eq('singleton', true));
      const { data: affected, error: updateError } = await db.from('hostels').update({ reminder_template: template }).select('id');
      if (updateError) throw updateError;
      await log('global_reminder_template_updated', 'platform', null, { affected_hostels: affected?.length || 0 });
      return response({ success: true, affected: affected?.length || 0 });
    }

    if (action === 'suspend_owner' || action === 'restore_owner' || action === 'revoke_sessions' || action === 'send_recovery') {
      const ownerId = String(params.id || '');
      if (!ownerId || ownerId === user.id) return response({ error: 'Invalid owner account' }, 400);
      const { data: targetResult, error: targetError } = await db.auth.admin.getUserById(ownerId);
      if (targetError || !targetResult.user || targetResult.user.app_metadata?.platform_role === 'admin') return response({ error: 'Owner account not found' }, 404);
      if (action === 'suspend_owner') {
        const { error } = await db.auth.admin.updateUserById(ownerId, { ban_duration: '876000h' }); if (error) throw error;
        await log('owner_suspended', 'owner', ownerId, { previous_status: 'active', new_status: 'suspended' });
        const { error: revokeError } = await db.auth.admin.signOut(ownerId, 'global');
        if (revokeError) console.error('Session revocation after owner suspension failed', revokeError.message);
      } else if (action === 'restore_owner') {
        const { error } = await db.auth.admin.updateUserById(ownerId, { ban_duration: 'none' }); if (error) throw error;
        await log('owner_restored', 'owner', ownerId, { previous_status: 'suspended', new_status: 'active' });
      } else if (action === 'revoke_sessions') {
        const { error } = await db.auth.admin.signOut(ownerId, 'global'); if (error) throw error;
        await log('owner_sessions_revoked', 'owner', ownerId);
      } else {
        const appOrigin = getRecoveryAppOrigin(request);
        const { error } = await authClient.auth.resetPasswordForEmail(targetResult.user.email || '', { redirectTo: `${appOrigin}/admin/login?recovery=1` });
        if (error) throw error;
        await log('owner_recovery_started', 'owner', ownerId);
      }
      return response({ success: true });
    }

    if (action === 'extend_subscription') {
      const hostelId = String(params.hostelId || '');
      const days = Number(params.days); const reason = String(params.reason || '').trim();
      const { error } = await authClient.rpc('admin_extend_hostel_subscription', { p_hostel_id: hostelId, p_days: days, p_reason: reason });
      if (error) throw error;
      return response({ success: true });
    }

    return response({ error: 'Unsupported admin operation' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : 'Admin operation failed';
    console.error('admin-api failed', message);
    return response({ error: message }, 500);
  }
});
