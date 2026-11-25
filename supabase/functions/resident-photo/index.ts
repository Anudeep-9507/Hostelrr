import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateImage } from './photo-validation.ts';
import { finalizeOrCleanup, promoteValidatedObject } from './staged-upload.ts';

// Match existing production bucket ceiling; frontend may enforce a smaller UX limit.
const MAX_RESIDENT_SIZE = 3 * 1024 * 1024;
const MAX_JOIN_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objectPattern = (prefix: string) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[0-9a-f-]+\\.(jpg|png|webp)$`, 'i');

const env = (name: string) => Deno.env.get(name) || '';
const allowedOrigins = (env('APP_ALLOWED_ORIGINS') || '').split(',').map((value) => {
  const candidate = value.trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : '';
  } catch { return ''; }
}).filter(Boolean);
function corsHeadersFor(origin: string | null): HeadersInit {
  const allowed = origin && allowedOrigins.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const config = () => {
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET_NAME') || 'hostelrr-resident-photos';
  const endpoint = env('R2_ENDPOINT') || `https://${accountId}.r2.cloudflarestorage.com`;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) throw new Error('R2 is not configured');
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
};

const r2Client = () => {
  const r2 = config();
  const aws = new AwsClient({ accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey, service: 's3', region: 'auto' });
  const objectUrl = (key: string) => `${r2.endpoint.replace(/\/$/, '')}/${r2.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return {
    exists: async (key: string) => {
      const res = await aws.fetch(objectUrl(key), { method: 'HEAD' });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`R2 object check failed (${res.status})`);
      return true;
    },
    presign: async (key: string, method: 'PUT' | 'GET') => {
      const signedUrl = new URL(objectUrl(key));
      signedUrl.searchParams.set('X-Amz-Expires', method === 'PUT' ? '300' : '600');
      const signed = await aws.sign(signedUrl, { method, aws: { signQuery: true } });
      return signed.url;
    },
    get: async (key: string, maxSize: number) => {
      // Bound response bytes even if a reusable PUT URL was overwritten with a
      // much larger object after its earlier HEAD check.
      const res = await aws.fetch(objectUrl(key), { method: 'GET', headers: { Range: `bytes=0-${maxSize}` } });
      if (res.status !== 206) throw new Error('R2 did not honor the bounded photo read');
      const range = res.headers.get('content-range') || '';
      const total = Number(range.match(/^bytes 0-\d+\/(\d+)$/i)?.[1]);
      if (!Number.isInteger(total) || total <= 0 || total > maxSize) throw new Error('Uploaded photo exceeds size limit');
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        size: total,
        contentType: (res.headers.get('content-type') || '').split(';')[0].toLowerCase(),
        etag: res.headers.get('etag') || '',
      };
    },
    copy: async (sourceKey: string, finalKey: string, contentType: string, sourceEtag: string) => {
      if (!sourceEtag) throw new Error('Staging object has no ETag');
      const source = `/${r2.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;
      const res = await aws.fetch(objectUrl(finalKey), { method: 'PUT', headers: {
        'x-amz-copy-source': source,
        'x-amz-copy-source-if-match': sourceEtag,
        'x-amz-metadata-directive': 'REPLACE',
        'Content-Type': contentType,
      } });
      const xml = await res.text();
      if (!res.ok || /<Error[\s>]/i.test(xml) || !/<CopyObjectResult[\s>]/i.test(xml)) throw new Error(`R2 conditional copy failed (${res.status})`);
      const head = await aws.fetch(objectUrl(finalKey), { method: 'HEAD' });
      if (!head.ok || Number(head.headers.get('content-length')) <= 0 || head.headers.get('content-type')?.split(';')[0].toLowerCase() !== contentType) throw new Error('Promoted photo metadata verification failed');
      return { size: Number(head.headers.get('content-length')), contentType: head.headers.get('content-type')!.split(';')[0].toLowerCase() };
    },
    delete: async (key: string) => {
      const res = await aws.fetch(objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        if (await (async () => {
          const head = await aws.fetch(objectUrl(key), { method: 'HEAD' });
          if (head.status === 404) return false;
          if (!head.ok) throw new Error(`R2 object check failed (${head.status})`);
          return true;
        })()) throw new Error(`R2 delete failed (${res.status})`);
        return;
      }
      const head = await aws.fetch(objectUrl(key), { method: 'HEAD' });
      if (head.status === 404) return;
      if (!head.ok) throw new Error(`R2 post-delete check failed (${head.status})`);
      throw new Error('R2 object remains after delete');
    },
  };
};

async function queueStatus(admin: ReturnType<typeof createClient>) {
  const counts = await Promise.all([
    admin.from('r2_photo_delete_queue').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).is('claimed_at', null).eq('attempt_count', 0),
    admin.from('r2_photo_delete_queue').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).not('claimed_at', 'is', null),
    admin.from('r2_photo_delete_queue').select('id', { count: 'exact', head: true })
      .is('deleted_at', null).is('claimed_at', null).gt('attempt_count', 0),
    admin.from('r2_photo_delete_queue').select('id', { count: 'exact', head: true })
      .not('deleted_at', 'is', null),
  ]);
  const error = counts.find((result) => result.error)?.error;
  if (error) throw error;
  return {
    pending: counts[0].count || 0,
    claimed: counts[1].count || 0,
    retryable: counts[2].count || 0,
    completed: counts[3].count || 0,
  };
}

async function processDeleteQueue(admin: ReturnType<typeof createClient>, r2: ReturnType<typeof r2Client>, limit = 200) {
  const { data: rows, error } = await admin.rpc('claim_r2_photo_delete_queue', { p_limit: limit });
  if (error) throw error;
  let deleted = 0;
  let failed = 0;
  for (const row of rows || []) {
    try {
      await r2.delete(row.object_key);
      const result = await admin.rpc('finish_r2_photo_delete', {
        p_queue_id: row.id, p_claim_token: row.claim_token, p_deleted: true, p_error: null,
      });
      if (result.error || !result.data) throw result.error || new Error('Delete claim expired before completion');
      deleted++;
    } catch (error) {
      const message = errorMessage(error);
      const result = await admin.rpc('finish_r2_photo_delete', {
        p_queue_id: row.id, p_claim_token: row.claim_token, p_deleted: false, p_error: message,
      });
      if (result.error || !result.data) {
        console.error('R2 delete retry state failed', { queueId: row.id, error: result.error?.message || 'claim no longer active' });
      }
      console.error('R2 object deletion failed', { queueId: row.id, error: message });
      failed++;
    }
  }
  return { claimed: rows?.length || 0, deleted, failed };
}

const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
async function verifyJoinPhotoChallenge(value: string, ip: string, origin: string) {
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret) throw new Error('Public photo verification is not configured');
  if (!value || value.length > 2048) return false;
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: value, remoteip: ip }),
  });
  if (!result.ok) throw new Error('Public photo verification is temporarily unavailable');
  const data = await result.json().catch(() => null);
  let hostname = '';
  try { hostname = new URL(origin).hostname; } catch { return false; }
  return data?.success === true && data?.action === 'join_photo_upload' && data?.hostname === hostname;
}
const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'unknown error';
};
const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

Deno.serve(async (req: Request) => {
  const requestStartedAt = Date.now();
  const origin = req.headers.get('Origin');
  const cors = corsHeadersFor(origin);
  const response = (body: unknown, status = 200, headers: HeadersInit = {}) =>
    Response.json(body, { status, headers: { ...cors, ...headers } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405, cors);

  let requestAction = '';
  try {
    const body = await req.json();
    const action = String(body.action || '');
    requestAction = action;
    if (action !== 'cleanup' && (!origin || !allowedOrigins.includes(origin))) return response({ error: 'Origin not allowed' }, 403, cors);
    const url = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) throw new Error('Supabase function is not configured');
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = req.headers.get('Authorization') || '';
    if (action === 'cleanup' && bearer !== `Bearer ${serviceKey}`) {
      const tokenValue = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
      const { data: authorized, error } = await admin.rpc('authorize_r2_photo_cleanup', { p_token: tokenValue });
      if (error || authorized !== true) return response({ error: 'Unauthorized' }, 401);
    }
    const isPublic = action === 'join-intent' || action === 'join-submit' || action === 'join-abort' || action === 'cleanup';
    let userId = '';
    let authenticatedClient: ReturnType<typeof createClient> | null = null;
    if (!isPublic) {
      const tokenValue = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
      if (!tokenValue) return response({ error: 'Unauthorized' }, 401);
      authenticatedClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${tokenValue}` } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await authenticatedClient.auth.getUser(tokenValue);
      if (error || !data.user) return response({ error: 'Unauthorized' }, 401);
      userId = data.user.id;
    }

    // Public join requests without a photo must not depend on R2 credentials.
    // Initialize storage only when an action actually reads or writes an object.
    let r2: ReturnType<typeof r2Client> | undefined;
    const getR2 = () => (r2 ??= r2Client());
    if (action === 'join-reject') {
      const requestId = String(body.requestId || '');
      if (!UUID.test(requestId)) return response({ error: 'Invalid join request' }, 400);
      if (!authenticatedClient) return response({ error: 'Unauthorized' }, 401);
      const { error: rejectError } = await authenticatedClient.rpc('reject_join_request', {
        p_request_id: requestId,
        p_review_notes: typeof body.reviewNotes === 'string' ? body.reviewNotes : null,
      });
      if (rejectError) throw rejectError;
      try {
        await processDeleteQueue(admin, getR2());
      } catch (cleanupError) {
        console.error('Prompt photo cleanup failed after join request rejection', cleanupError instanceof Error ? cleanupError.message : 'unknown error');
      }
      return response({ ok: true });
    }
    if (action === 'resident-intent') {
      const residentId = String(body.residentId || '');
      const contentType = String(body.contentType || '').toLowerCase();
      const size = Number(body.size);
      if (!UUID.test(residentId) || !ALLOWED_TYPES.has(contentType) || !Number.isInteger(size) || size <= 0 || size > MAX_RESIDENT_SIZE) return response({ error: 'Invalid image type or size' }, 400);
      const { data: resident } = await admin.from('residents').select('id,hostel_id').eq('id', residentId).maybeSingle();
      if (!resident) return response({ error: 'Resident not found' }, 404, cors);
      const { data: hostel } = await admin.from('hostels').select('id').eq('id', resident.hostel_id).eq('user_id', userId).maybeSingle();
      if (!hostel) return response({ error: 'Access denied' }, 403, cors);
      const uploadId = crypto.randomUUID();
      const key = `staging/residents/${resident.hostel_id}/${resident.id}/${uploadId}.${EXTENSIONS[contentType]}`;
      const { error } = await admin.from('resident_photo_uploads').insert({ id: uploadId, resident_id: resident.id, hostel_id: resident.hostel_id, object_key: key, content_type: contentType, expected_size: size, created_by: userId });
      if (error) throw error;
      return response({ uploadId, url: await getR2().presign(key, 'PUT'), headers: { 'Content-Type': contentType }, expiresIn: 300 });
    }

    if (action === 'resident-finalize' || action === 'resident-abort') {
      const uploadId = String(body.uploadId || '');
      if (!UUID.test(uploadId)) return response({ error: 'Invalid upload' }, 400);
      const { data: upload } = await admin.from('resident_photo_uploads').select('*').eq('id', uploadId).eq('created_by', userId).maybeSingle();
      if (!upload) return response({ error: 'Upload not found' }, 404);
      if (action === 'resident-finalize' && upload.aborted_at) return response({ error: 'Upload was aborted' }, 409);
      const { data: hostel } = await admin.from('hostels').select('id').eq('id', upload.hostel_id).eq('user_id', userId).maybeSingle();
      if (!hostel) return response({ error: 'Access denied' }, 403);
      if (action === 'resident-abort') {
        const { data: aborted, error: abortError } = await admin.rpc('abort_resident_photo_upload', { p_upload_id: uploadId, p_user_id: userId });
        if (abortError) throw abortError;
        if (!aborted) return response({ error: 'Upload is already finalized or unavailable' }, 409);
        return response({ ok: true });
      }
      if (new Date(upload.expires_at).getTime() < Date.now()) return response({ error: 'Upload intent expired' }, 410);
      let object: Awaited<ReturnType<ReturnType<typeof r2Client>['get']>>;
      try {
        object = await getR2().get(upload.object_key, MAX_RESIDENT_SIZE);
      } catch (readError) {
        if (readError instanceof Error && /size limit|bounded photo read/i.test(readError.message)) {
          const { error: queueError } = await admin.rpc('enqueue_r2_photo_delete', { p_object_key: upload.object_key, p_reason: 'oversized_resident_upload' });
          if (queueError) throw queueError;
          return response({ error: 'Uploaded image failed validation' }, 400);
        }
        throw readError;
      }
      if (object.size !== upload.expected_size || object.bytes.length !== object.size || object.contentType !== upload.content_type || !await validateImage(object.bytes, upload.content_type, upload.object_key.replace(/^staging\/residents\//, 'residents/'), MAX_RESIDENT_SIZE)) {
        const { error: queueError } = await admin.rpc('enqueue_r2_photo_delete', { p_object_key: upload.object_key, p_reason: 'invalid_resident_upload' });
        if (queueError) throw queueError;
        return response({ error: 'Uploaded image failed validation' }, 400);
      }
      const promoted = await promoteValidatedObject({
        read: async () => object,
        validate: (value) => validateImage(value.bytes, upload.content_type, upload.object_key.replace(/^staging\/residents\//, 'residents/'), MAX_RESIDENT_SIZE),
        reserveFinal: async () => {
          const candidate = `residents/${upload.hostel_id}/${upload.resident_id}/${crypto.randomUUID()}.${EXTENSIONS[upload.content_type]}`;
          const result = await admin.rpc('reserve_resident_photo_final_key', { p_upload_id: uploadId, p_user_id: userId, p_final_object_key: candidate });
          if (result.error || !result.data) throw result.error || new Error('Upload expired or unavailable');
          return result.data as string;
        },
        copy: (key, etag) => getR2().copy(upload.object_key, key, upload.content_type, etag),
        expectedSize: upload.expected_size, expectedType: upload.content_type,
      }).catch(async (e) => {
        const candidateFinal = upload.final_object_key;
        if (candidateFinal) await admin.rpc('enqueue_r2_photo_delete', { p_object_key: candidateFinal, p_reason: 'failed_resident_promotion' });
        throw e;
      });
      const finalKey = promoted.finalKey;
      await finalizeOrCleanup(async () => {
        const result = await admin.rpc('finalize_resident_photo_upload_staged', { p_upload_id: uploadId, p_user_id: userId, p_final_object_key: finalKey });
        if (result.error) throw result.error;
        return result.data;
      }, async () => {
        await Promise.all([
          admin.rpc('enqueue_r2_photo_delete', { p_object_key: upload.object_key, p_reason: 'failed_resident_finalize' }),
          admin.rpc('enqueue_r2_photo_delete', { p_object_key: finalKey, p_reason: 'failed_resident_finalize' }),
        ]);
      });
      try {
        await processDeleteQueue(admin, getR2());
      } catch (cleanupError) {
        console.error('Prompt photo cleanup failed after resident replacement', cleanupError instanceof Error ? cleanupError.message : 'unknown error');
      }
      return response({ ok: true });
    }

    if (action === 'resident-read' || action === 'resident-delete' || action === 'resident-history-delete') {
      const residentId = String(body.residentId || '');
      if (!UUID.test(residentId)) return response({ error: 'Invalid resident' }, 400);
      const { data: resident } = await admin.from('residents').select('id,hostel_id,photo_path,status,deleted_at,personal_data_deleted_at').eq('id', residentId).maybeSingle();
      if (!resident) return response({ error: 'Resident not found' }, 404);
      const { data: hostel } = await admin.from('hostels').select('id').eq('id', resident.hostel_id).eq('user_id', userId).maybeSingle();
      if (!hostel) return response({ error: 'Access denied' }, 403);
      if (action === 'resident-history-delete') {
        if (!authenticatedClient) return response({ error: 'Unauthorized' }, 401);
        const { data: disposition, error: deleteError } = await authenticatedClient.rpc('delete_past_resident', { p_resident_id: residentId });
        if (deleteError) throw deleteError;
        try {
          await processDeleteQueue(admin, getR2());
        } catch (cleanupError) {
          console.error('Prompt photo cleanup failed after resident history deletion', cleanupError instanceof Error ? cleanupError.message : 'unknown error');
        }
        return response({ ok: true, disposition });
      }
      if (action === 'resident-read') {
        if (resident.personal_data_deleted_at) return response({ expiresIn: 600 });
        const residentKey = Boolean(resident.photo_path && objectPattern(`residents/${resident.hostel_id}/${resident.id}/`).test(resident.photo_path));
        if (residentKey && await getR2().exists(resident.photo_path)) {
          return response({ url: await getR2().presign(resident.photo_path, 'GET'), expiresIn: 600 });
        }
        // Approval retains the join request's R2 key. If a stale resident key
        // points at no object, serve the still-linked approved request object.
        const { data: linked } = await admin.from('join_requests').select('id,photo_path')
          .eq('resident_id', residentId).eq('status', 'approved').maybeSingle();
        // The resident row is authoritative after approval. Old approval flows
        // may have removed the request row while retaining its private R2 key.
        const linkedKey = linked?.photo_path || resident.photo_path;
        const linkedRequestId = linked?.id || linkedKey?.match(/^join-requests\/([0-9a-f-]+)\/([0-9a-f-]+)\//i)?.[2];
        const linkedKeyValid = Boolean(linkedKey && linkedRequestId
          && objectPattern(`join-requests/${resident.hostel_id}/${linkedRequestId}/`).test(linkedKey));
        if (linkedKeyValid && await getR2().exists(linkedKey)) {
          return response({ url: await getR2().presign(linkedKey, 'GET'), expiresIn: 600 });
        }
        return response({ expiresIn: 600 });
      }
      if (resident.photo_path) {
        const { error: updateError } = await admin.from('residents').update({ photo_path: null }).eq('id', residentId).eq('hostel_id', resident.hostel_id);
        if (updateError) throw updateError;
      }
      try {
        await processDeleteQueue(admin, getR2());
      } catch (cleanupError) {
        console.error('Prompt photo cleanup failed after resident photo removal', cleanupError instanceof Error ? cleanupError.message : 'unknown error');
      }
      return response({ ok: true });
    }

    if (action === 'join-intent') {
      const hostelId = String(body.hostelId || '');
      const contentType = String(body.contentType || '').toLowerCase();
      const size = Number(body.size);
      if (!UUID.test(hostelId) || !ALLOWED_TYPES.has(contentType) || !Number.isInteger(size) || size <= 0 || size > MAX_JOIN_SIZE) return response({ error: 'Invalid image type or size' }, 400);
      // The deployed schema has no hostel enabled/accepting flag; the existing
      // public join flow permits every existing hostel, so preserve that rule.
      const { data: hostel, error: hostelError } = await admin.from('hostels').select('id').eq('id', hostelId).maybeSingle();
      if (hostelError) throw hostelError;
      if (!hostel) return response({ error: 'Hostel not found' }, 404);
      // Supabase's public endpoint is served through Cloudflare, which supplies
      // CF-Connecting-IP to the origin for rate limiting.
      const ip = req.headers.get('CF-Connecting-IP')?.trim();
      if (!ip || ip.length > 128 || ip.includes(',')) return response({ error: 'Trusted client IP unavailable; photo upload is temporarily unavailable.' }, 503);
      const ipHash = await sha256(ip);
      const challenge = String(body.turnstileToken || '');
      let challengeValid: boolean;
      try {
        challengeValid = await verifyJoinPhotoChallenge(challenge, ip, origin!);
      } catch (error) {
        console.error('Join photo challenge verification unavailable', errorMessage(error));
        return response({ error: 'Photo verification is temporarily unavailable. Try again shortly.' }, 503);
      }
      if (!challengeValid) return response({ error: 'Complete the photo verification and try again.' }, 403);
      const turnstileTokenHash = await sha256(challenge);
      const { error: expiredClaimsError } = await admin.from('join_photo_turnstile_claims')
        .delete().lt('claimed_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());
      if (expiredClaimsError) throw expiredClaimsError;
      const { error: claimError } = await admin.from('join_photo_turnstile_claims').insert({ token_hash: turnstileTokenHash });
      if (claimError?.code === '23505') return response({ error: 'This photo verification was already used. Complete a new verification.' }, 403);
      if (claimError) throw claimError;
      const { data: hits, error: limitError } = await admin.rpc('consume_join_photo_rate_limit', { p_ip_hash: ipHash });
      if (limitError) throw limitError;
      if (Number(hits) > 10) return response({ error: 'Too many photo uploads. Try again later.' }, 429);
      const requestId = crypto.randomUUID();
      const uploadId = crypto.randomUUID();
      const secret = token();
      const key = `staging/join-requests/${hostelId}/${requestId}/${uploadId}.${EXTENSIONS[contentType]}`;
      const { error } = await admin.from('join_photo_upload_intents').insert({ id: uploadId, request_id: requestId, hostel_id: hostelId, object_key: key, content_type: contentType, expected_size: size, token_hash: await sha256(secret), ip_hash: ipHash });
      if (error) throw error;
      return response({ requestId, uploadId, token: secret, url: await getR2().presign(key, 'PUT'), headers: { 'Content-Type': contentType }, expiresIn: 300 });
    }

    if (action === 'join-abort') {
      const uploadId = String(body.uploadId || '');
      if (!UUID.test(uploadId)) return response({ error: 'Invalid upload' }, 400);
      const tokenHash = await sha256(String(body.token || ''));
      const { data: aborted, error } = await admin.rpc('abort_join_photo_upload', { p_upload_id: uploadId, p_token_hash: tokenHash });
      if (error) throw error;
      if (!aborted) return response({ error: 'Upload is already consumed or unavailable' }, 409);
      return response({ ok: true });
    }

    if (action === 'join-submit') {
      const request = body.request || {};
      const uploadId = String(body.uploadId || '');
      if (uploadId && !UUID.test(uploadId)) return response({ error: 'Invalid upload intent' }, 400);
      const { data: intent, error: intentError } = uploadId ? await admin.from('join_photo_upload_intents').select('*').eq('id', uploadId).maybeSingle() : { data: null, error: null };
      if (intentError) throw intentError;
      if (uploadId && !intent) return response({ error: 'Upload intent expired or invalid' }, 403);
      let photoPath: string | null = null;
      let requestId = crypto.randomUUID();
      const submitTokenHash = await sha256(String(body.token || ''));
      if (intent) {
        if (intent.consumed_at || intent.aborted_at || intent.token_hash !== submitTokenHash || new Date(intent.expires_at).getTime() <= Date.now() || intent.hostel_id !== request.hostelId) return response({ error: 'Upload intent expired or invalid' }, 403);
        requestId = intent.request_id;
        let object: Awaited<ReturnType<ReturnType<typeof r2Client>['get']>>;
        try {
          object = await getR2().get(intent.object_key, MAX_JOIN_SIZE);
        } catch (readError) {
          if (readError instanceof Error && /size limit|bounded photo read/i.test(readError.message)) {
            const { error: queueError } = await admin.rpc('enqueue_r2_photo_delete', { p_object_key: intent.object_key, p_reason: 'oversized_join_upload' });
            if (queueError) throw queueError;
            return response({ error: 'Uploaded image failed validation' }, 400);
          }
          throw readError;
        }
        if (object.size !== intent.expected_size || object.bytes.length !== object.size || object.contentType !== intent.content_type || !await validateImage(object.bytes, intent.content_type, intent.object_key.replace(/^staging\/join-requests\//, 'join-requests/'), MAX_JOIN_SIZE)) {
          const { error: queueError } = await admin.rpc('enqueue_r2_photo_delete', { p_object_key: intent.object_key, p_reason: 'invalid_join_upload' });
          if (queueError) throw queueError;
          return response({ error: 'Uploaded image failed validation' }, 400);
        }
        const promoted = await promoteValidatedObject({
          read: async () => object,
          validate: (value) => validateImage(value.bytes, intent.content_type, intent.object_key.replace(/^staging\/join-requests\//, 'join-requests/'), MAX_JOIN_SIZE),
          reserveFinal: async () => {
            const candidate = `join-requests/${intent.hostel_id}/${intent.request_id}/${crypto.randomUUID()}.${EXTENSIONS[intent.content_type]}`;
            const result = await admin.rpc('reserve_join_photo_final_key', { p_upload_id: intent.id, p_token_hash: submitTokenHash, p_hostel_id: intent.hostel_id, p_final_object_key: candidate });
            if (result.error || !result.data) throw result.error || new Error('Upload intent expired or unavailable');
            return result.data as string;
          },
          copy: (key, etag) => getR2().copy(intent.object_key, key, intent.content_type, etag),
          expectedSize: intent.expected_size, expectedType: intent.content_type,
        });
        photoPath = promoted.finalKey;
      }
      const { data, error } = await admin.rpc('create_join_request_with_photo_intent', {
        p_upload_id: intent?.id || null, p_token_hash: intent ? submitTokenHash : null,
        p_request_id: requestId, p_hostel_id: request.hostelId, p_name: request.name, p_phone: request.phone,
        p_emergency_contact: request.emergencyContact || null, p_occupation: request.occupation || null,
        p_preferred_room: request.preferredRoom || null, p_aadhar_number: request.aadharNumber || null,
        p_photo_path: photoPath, p_area_and_city: request.areaAndCity || null,
        p_state: request.state || null, p_country: request.country || 'India', p_preferred_sharing: request.preferredSharing || null,
      });
      if (error) {
        if (intent && photoPath) {
          await admin.rpc('enqueue_r2_photo_delete', { p_object_key: intent.object_key, p_reason: 'failed_join_finalize' });
          await admin.rpc('enqueue_r2_photo_delete', { p_object_key: photoPath, p_reason: 'failed_join_finalize' });
        }
        throw error;
      }
      return response({ requestId: data });
    }

    if (action === 'join-read') {
      const requestId = String(body.requestId || '');
      if (!UUID.test(requestId)) return response({ error: 'Invalid request' }, 400);
      const { data: request } = await admin.from('join_requests').select('id,hostel_id,photo_path').eq('id', requestId).maybeSingle();
      if (!request) {
        const { data: intents } = await admin.from('join_photo_upload_intents')
          .select('hostel_id,final_object_key').eq('request_id', requestId)
          .not('final_object_key', 'is', null).order('created_at', { ascending: false }).limit(5);
        for (const intent of intents || []) {
          const { data: owner } = await admin.from('hostels').select('id')
            .eq('id', intent.hostel_id).eq('user_id', userId).maybeSingle();
          const key = intent.final_object_key;
          if (!owner || !key || !objectPattern(`join-requests/${intent.hostel_id}/${requestId}/`).test(key)) continue;
          if (await getR2().exists(key)) return response({ url: await getR2().presign(key, 'GET'), expiresIn: 600 });
        }
        // Approval may remove the request row. Recover only from an owner
        // resident record whose persisted key contains this exact request id.
        const { data: residents } = await admin.from('residents').select('id,hostel_id,photo_path')
          .like('photo_path', `join-requests/%/${requestId}/%`).limit(20);
        for (const resident of residents || []) {
          const { data: owner } = await admin.from('hostels').select('id')
            .eq('id', resident.hostel_id).eq('user_id', userId).maybeSingle();
          if (!owner || !resident.photo_path
              || !objectPattern(`join-requests/${resident.hostel_id}/${requestId}/`).test(resident.photo_path)) continue;
          if (await getR2().exists(resident.photo_path)) {
            return response({ url: await getR2().presign(resident.photo_path, 'GET'), expiresIn: 600 });
          }
        }
        return response({ error: 'Request photo not found' }, 404);
      }
      const { data: hostel } = await admin.from('hostels').select('id').eq('id', request.hostel_id).eq('user_id', userId).maybeSingle();
      if (!hostel) return response({ error: 'Access denied' }, 403);
      const validKey = Boolean(request.photo_path && objectPattern(`join-requests/${request.hostel_id}/${request.id}/`).test(request.photo_path));
      return response({ url: validKey ? await getR2().presign(request.photo_path, 'GET') : undefined, expiresIn: 600 });
    }

    if (action === 'cleanup') {
      const startedAt = Date.now();
      const { data: purgedResidents, error: purgeError } = await admin.rpc('purge_expired_resident_history');
      if (purgeError) throw purgeError;
      const { error: abandonedError } = await admin.rpc('cleanup_abandoned_photo_uploads');
      if (abandonedError) throw abandonedError;
      const { error: retentionError } = await admin.rpc('claim_expired_join_photo_cleanup');
      if (retentionError) throw retentionError;
      const queue = await processDeleteQueue(admin, getR2());
      const { error: rateCleanupError } = await admin.from('join_photo_rate_limits').delete().lt('window_start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (rateCleanupError) throw rateCleanupError;
      const status = await queueStatus(admin);
      const result = {
        ok: true,
        purgedResidents: purgedResidents || 0,
        ...queue,
        queueStatus: status,
        elapsedMs: Date.now() - startedAt,
      };
      console.info('R2 photo cleanup completed', JSON.stringify(result));
      return response(result);
    }

    return response({ error: 'Unknown action' }, 400);
  } catch (error) {
    const message = errorMessage(error);
    if (requestAction === 'cleanup') {
      console.error('R2 photo cleanup failed', JSON.stringify({ elapsedMs: Date.now() - requestStartedAt, error: message }));
    } else {
      console.error('resident-photo failed:', message);
    }
    return response({ error: error instanceof Error ? error.message : 'Photo operation failed' }, 500);
  }
});
