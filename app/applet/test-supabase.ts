import { createClient } from '@supabase/supabase-js';
const supabase = createClient("https://lfgouwvdwxlkirqqlwmt.supabase.co", "sb_publishable_4XK3ENhifAMlr8et2XhXDg_8PHaErrq");
console.log("Before");
supabase.auth.signUp({email: "c@gmail.com", password: "password123"}).then(res => console.log("Done", res)).catch(console.error);
