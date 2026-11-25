import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const res=(body:unknown,status=200)=>Response.json(body,{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return res({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!url||!anon||!service||!token)return res({error:'Unauthorized'},401);
 const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||user?.app_metadata?.platform_role!=='admin')return res({error:'Administrator access required'},403);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {action,params={}}=await req.json();
  if(action==='reminder_settings'){
   const [{data:settings,error:se},{data:hostels,error:he}]=await Promise.all([
    db.from('subscription_platform_settings').select('whatsapp_reminder_template').eq('singleton',true).single(),
    db.from('hostels').select('id,name,city,state,reminder_template').order('name')]);
   if(se)throw se;if(he)throw he;
   return res({reminderTemplate:settings.whatsapp_reminder_template,hostels});
  }
  if(action==='set_reminder_template'){
   const template=String(params.template||'').trim(),hostelId=String(params.hostelId||'');
   if(!template||template.length>5000)return res({error:'Template must contain 1–5000 characters.'},400);
   if(hostelId){
    const {data:hostel,error:he}=await db.from('hostels').select('id').eq('id',hostelId).single();if(he||!hostel)return res({error:'Hostel not found'},404);
    const {error:ue}=await db.from('hostels').update({reminder_template:template}).eq('id',hostelId);if(ue)throw ue;
    return res({success:true,affected:1});
   }
   const {error:se}=await db.from('subscription_platform_settings').update({whatsapp_reminder_template:template,updated_by:user.id,updated_at:new Date().toISOString()}).eq('singleton',true);if(se)throw se;
  const {data:hostels,error:he}=await db.from('hostels').select('id');if(he)throw he;
  const hostelIds=(hostels||[]).map((hostel:{id:string})=>hostel.id);
  let rows:{id:string}[]=[];
  if(hostelIds.length){
   const {data:updated,error:ue}=await db.from('hostels').update({reminder_template:template}).in('id',hostelIds).select('id');if(ue)throw ue;
   rows=updated||[];
  }
   return res({success:true,affected:rows?.length||0});
  }
  return res({error:'Unsupported action'},400);
}catch(error){
  console.error('reminder-admin failed',error);
  const detail=error as {message?:string;code?:string;hint?:string};
  return res({error:detail?.message||'Request failed',code:detail?.code,hint:detail?.hint},500);
 }
});
