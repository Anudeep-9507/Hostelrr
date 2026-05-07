// @ts-nocheck
// supabase/functions/generate-payment-cycles/index.ts
// Cron: Monthly on 1st at 00:05 — generates next payment cycle for all active residents
// Deploy: supabase functions deploy generate-payment-cycles
// Schedule in Supabase Dashboard → Edge Functions → Schedules → "5 0 1 * *"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all hostels and run generate_payment_cycles per hostel
  const { data: hostels, error: hostelErr } = await supabase
    .from('hostels')
    .select('id, name');

  if (hostelErr) {
    console.error('Failed to fetch hostels:', hostelErr);
    return new Response(JSON.stringify({ success: false, error: hostelErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: { hostel_id: string; success: boolean; error?: string }[] = [];

  for (const hostel of (hostels || [])) {
    const { data, error } = await supabase.rpc('generate_payment_cycles', {
      p_hostel_id: hostel.id,
    });

    if (error) {
      console.error(`generate_payment_cycles failed for hostel ${hostel.id}:`, error);
      results.push({ hostel_id: hostel.id, success: false, error: error.message });
    } else {
      console.log(`generate_payment_cycles OK for hostel ${hostel.id}:`, data);
      results.push({ hostel_id: hostel.id, success: true });
    }
  }

  const allOk = results.every((r) => r.success);
  return new Response(JSON.stringify({ success: allOk, results }), {
    status: allOk ? 200 : 207,
    headers: { 'Content-Type': 'application/json' },
  });
});
