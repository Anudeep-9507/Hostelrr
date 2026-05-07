// @ts-nocheck
// supabase/functions/tag-late-cycles/index.ts
// Cron: Daily at midnight — marks overdue pending/partial cycles as 'late'
// Deploy: supabase functions deploy tag-late-cycles
// Schedule in Supabase Dashboard → Edge Functions → Schedules → "0 0 * * *"

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

  const { data, error } = await supabase.rpc('tag_late_cycles');

  if (error) {
    console.error('tag_late_cycles RPC failed:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('tag_late_cycles completed:', data);
  return new Response(JSON.stringify({ success: true, result: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
