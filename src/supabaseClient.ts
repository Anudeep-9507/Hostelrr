import { createClient } from '@supabase/supabase-js';

// Use the project URL as the base. Supabase JS adds its own /rest/v1 path.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lfgouwvdwxlkirqqlwmt.supabase.co";
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_4XK3ENhifAMlr8et2XhXDg_8PHaErrq";

// Normalize old deployments that configured the REST endpoint instead of the project URL.
const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');

export const supabase = createClient(baseUrl, SUPABASE_PUBLIC_KEY);
