import { createClient } from '@supabase/supabase-js';

// Use environment variables if provided, otherwise fallback to the dummy placeholders
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lfgouwvdwxlkirqqlwmt.supabase.co/rest/v1/";
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_4XK3ENhifAMlr8et2XhXDg_8PHaErrq";

// createClient expects the base URL (without /rest/v1/)
const baseUrl = SUPABASE_URL.replace('/rest/v1/', '');

export const supabase = createClient(baseUrl, SUPABASE_PUBLIC_KEY);
