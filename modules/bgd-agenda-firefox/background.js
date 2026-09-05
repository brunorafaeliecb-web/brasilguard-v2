// BrasilGuard Agenda — OAuth Google, Google Calendar, offline sync e lembretes locais.
// Fonte de verdade operacional: backend Supabase. A extensão mantém cache/local reminders e filas transitórias.

const HEARTBEAT_ALARM = 'bgd:heartbeat';
const HEARTBEAT_PERIOD_MINUTES = 1;
const REMINDER_GRACE_MS = 5 * 60 * 1000;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_SYNC_QUEUE_KEY = 'bgdGoogleSyncQueueV1';
const GOOGLE_SYNC_EVIDENCE_KEY = 'bgdGoogleSyncEvidenceV1';
let flushingGoogleQueue = false;

browser.browserAction.onClicked.addListener(async ()=>{
  await browser.tabs.create({url: browser.runtime.getURL('popup.html')});
});

browser.runtime.onMessage.addListener((message)=>{
  if(message?.type === 'BGD_GOOGLE_CONNECT') return connectGoogle();
  if(message?.type === 'BGD_GOOGLE_STATUS') return getGoogleStatus();
  if(message?.type === 'BGD_GOOGLE_TOKEN') return validGoogleAccessToken().then(accessToken=>({accessToken}));

  if(message?.type === 'BGD_APPOINTMENT_CREATED') return handleCreated(message.appointment);
  if(message?.type === 'BGD_APPOINTMENT_UPDATED') return handleUpdated(message.appointment);
  if(message?.type === 'BGD_APPOINTMENT_DELETED') return handleDeleted(message.appointment);
});

async function appendGoogleEvidence(type,data={}){
  const { [GOOGLE_SYNC_EVIDENCE_KEY]: rows=[] } = await browser.storage.local.get(GOOGLE_SYNC_EVIDENCE_KEY);
  rows.push({at:new Date().toISOString(),type,data});
  if(rows.length>300) rows.splice(0,rows.length-300);
  await browser.storage.local.set({[GOOGLE_SYNC_EVIDENCE_KEY]:rows});
}

async function enqueueGoogleSync(action,appointment,error){
  const { [GOOGLE_SYNC_QUEUE_KEY]: queue=[] } = await browser.storage.local.get(GOOGLE_SYNC_QUEUE_KEY);
  const id=appointment?.id;
  if(!id) return {ok:false,error:'appointment_id_missing'};
  const existingIndex=queue.findIndex(x=>x.appointmentId===id);
  const item={queueId:crypto.randomUUID(),appointmentId:id,action,appointment,createdAt:new Date().toISOString(),attempts:0,lastError:String(error||'offline')};
  if(existingIndex>=0){
    const existing=queue[existingIndex];
    if(action==='delete') queue[existingIndex]=item;
    else if(existing.action==='create' && action==='update') queue[existingIndex]={...item,action:'create'};
    else if(existing.action!=='delete') queue[existingIndex]=item;
  }else queue.push(item);
  await browser.storage.local.set({[GOOGLE_SYNC_QUEUE_KEY]:queue});
  await appendGoogleEvidence('google_sync.queued',{action,appointmentId:id,error:String(error||'offline')});
  return {ok:true,queued:true,offline:true};
}

async function safeGoogleMutation(action,appointment){
  // Se a própria operação BrasilGuard ainda está offline/provisória, não toque no Google.
  // A sincronização Google só é disparada por offline-sync.js DEPOIS que o backend confirmar.
  if((typeof navigator!=='undefined' && navigator.onLine===false) || appointment?.status==='provisional_offline'){
    return {ok:true,deferred:true,reason:'backend_confirmation_pending'};
  }
  try{
    let result;
    if(action==='create') result=await createGoogleCalendarEvent(appointment);
    else if(action==='update') result=await updateGoogleCalendarEvent(appointment);
    else result=await deleteGoogleCalendarEvent(appointment.id);
    if(result?.ok) return result;
    if(result?.reason==='google_not_connected') return result;
    return enqueueGoogleSync(action,appointment,result?.error||result?.reason||'google_sync_failed');
  }catch(error){
    return enqueueGoogleSync(action,appointment,error?.message||error);
  }
}

async function handleCreated(a){
  await scheduleAppointmentAlarm(a);
  const google = await safeGoogleMutation('create',a);
  return {ok:true,google};
}
async function handleUpdated(a){
  await browser.alarms.clear(`bgd:${a.id}`);
  await scheduleAppointmentAlarm(a);
  const google = await safeGoogleMutation('update',a);
  return {ok:true,google};
}
async function handleDeleted(a){
  await browser.alarms.clear(`bgd:${a.id}`);
  const google = await safeGoogleMutation('delete',a);
  return {ok:true,google};
}

browser.alarms.onAlarm.addListener(async (alarm)=>{
  if(alarm.name === HEARTBEAT_ALARM){ await sweepDueReminders(); await flushGoogleSyncQueue(); return; }
  if(!alarm.name.startsWith('bgd:')) return;
  await dispatchReminderById(alarm.name.slice(4));
});

browser.runtime.onStartup.addListener(async ()=>{
  await ensureHeartbeat(); await rebuildAppointmentAlarms(); await sweepDueReminders(); await flushGoogleSyncQueue();
});
browser.runtime.onInstalled.addListener(async ()=>{
  await ensureHeartbeat(); await rebuildAppointmentAlarms(); await sweepDueReminders(); await flushGoogleSyncQueue();
});

function base64Url(bytes){
  let binary='';
  for(const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function randomUrlSafe(size=32){
  const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return base64Url(bytes);
}
async function sha256Base64Url(value){
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}
function googleRedirectUri(){
  const firefoxRedirect = new URL(browser.identity.getRedirectURL());
  const subdomain = firefoxRedirect.hostname.split('.')[0];
  return `http://127.0.0.1/mozoauth2/${subdomain}`;
}

async function oauthBackend(payload){
  const response=await fetch(BGD_CONFIG.GOOGLE_OAUTH_API_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data?.ok) throw new Error(data?.error_description || data?.error || `google_oauth_backend_http_${response.status}`);
  return data;
}

async function connectGoogle(){
  try{
    if(!BGD_CONFIG.GOOGLE_OAUTH_API_URL) throw new Error('google_oauth_backend_pending');
    const verifier=randomUrlSafe(64);
    const challenge=await sha256Base64Url(verifier);
    const state=randomUrlSafe(24);
    const redirectUri=googleRedirectUri();
    const params=new URLSearchParams({
      client_id:BGD_CONFIG.GOOGLE_CLIENT_ID,
      redirect_uri:redirectUri,
      response_type:'code',
      scope:BGD_CONFIG.GOOGLE_SCOPE,
      code_challenge:challenge,
      code_challenge_method:'S256',
      access_type:'offline',
      prompt:'consent',
      state
    });
    const responseUrl=await browser.identity.launchWebAuthFlow({interactive:true,url:`${GOOGLE_AUTH_URL}?${params}`});
    const callback=new URL(responseUrl);
    if(callback.searchParams.get('error')) throw new Error(`google_oauth_${callback.searchParams.get('error')}`);
    if(callback.searchParams.get('state')!==state) throw new Error('google_oauth_state_mismatch');
    const code=callback.searchParams.get('code');
    if(!code) throw new Error('google_oauth_code_missing');

    const tokenData=await oauthBackend({action:'exchange',code,codeVerifier:verifier,redirectUri});
    if(!tokenData.access_token) throw new Error('google_oauth_access_token_missing');

    const profileResponse=await fetch(GOOGLE_USERINFO_URL,{headers:{Authorization:`Bearer ${tokenData.access_token}`}});
    const profile=profileResponse.ok ? await profileResponse.json() : {};
    const googleOAuth={
      access_token:tokenData.access_token,
      refresh_token:tokenData.refresh_token || null,
      id_token:tokenData.id_token || null,
      expires_at:Date.now()+Number(tokenData.expires_in || 3600)*1000,
      scope:tokenData.scope || BGD_CONFIG.GOOGLE_SCOPE,
      token_type:tokenData.token_type || 'Bearer',
      connected_at:new Date().toISOString(),
      profile:{sub:profile.sub || null,email:profile.email || null,name:profile.name || profile.email || null,picture:profile.picture || null}
    };
    await browser.storage.local.set({googleOAuth});
    return {ok:true,connected:true,profile:googleOAuth.profile};
  }catch(error){
    console.error('BGD Agenda: falha OAuth Google.',error);
    return {ok:false,connected:false,error:String(error?.message || error)};
  }
}

async function getGoogleStatus(){
  const {googleOAuth=null}=await browser.storage.local.get('googleOAuth');
  return {connected:Boolean(googleOAuth?.access_token || googleOAuth?.refresh_token),profile:googleOAuth?.profile || null};
}

async function validGoogleAccessToken(){
  const {googleOAuth=null}=await browser.storage.local.get('googleOAuth');
  if(!googleOAuth) return null;
  if(googleOAuth.access_token && Number(googleOAuth.expires_at || 0)>Date.now()+60000) return googleOAuth.access_token;
  if(googleOAuth.access_token && typeof navigator!=='undefined' && navigator.onLine===false) return googleOAuth.access_token;
  if(!googleOAuth.refresh_token || !BGD_CONFIG.GOOGLE_OAUTH_API_URL) return null;
  try{
    const data=await oauthBackend({action:'refresh',refreshToken:googleOAuth.refresh_token});
    if(!data.access_token) return null;
    const updated={...googleOAuth,access_token:data.access_token,expires_at:Date.now()+Number(data.expires_in || 3600)*1000,scope:data.scope || googleOAuth.scope,token_type:data.token_type || googleOAuth.token_type};
    await browser.storage.local.set({googleOAuth:updated});
    return updated.access_token;
  }catch(error){
    console.error('BGD Agenda: falha ao renovar token Google.',error);
    if(googleOAuth.access_token && Number(googleOAuth.expires_at || 0)>Date.now()) return googleOAuth.access_token;
    return null;
  }
}

function googleEventPayload(a){
  const start=new Date(a.startsAt || a.starts_at);
  const duration=Number(a.durationMinutes || a.duration_minutes || 60);
  const end=new Date(start.getTime()+duration*60000);
  const clientName=a.clientName || a.client_name || '';
  const clientPhone=a.clientPhone || a.client_phone || '';
  const clientEmail=a.clientEmail || a.client_email || '';
  const serviceName=a.serviceName || a.service_name || 'Agendamento';
  const minutes=Number(a.reminders?.minutesBefore || a.reminders?.minutes_before || 60);
  return {
    summary:serviceName,
    description:`Cliente: ${clientName}\nWhatsApp: ${clientPhone}${clientEmail?`\nE-mail: ${clientEmail}`:''}\nOrigem: BrasilGuard Agenda`,
    start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()},
    reminders:{useDefault:false,overrides:[{method:'popup',minutes}]},
    extendedProperties:{private:{bgdAppointmentId:String(a.id || '')}}
  };
}
async function createGoogleCalendarEvent(a){
  const accessToken=await validGoogleAccessToken();
  if(!accessToken) return {ok:false,skipped:true,reason:'google_not_connected'};
  const {googleCalendarEvents={}}=await browser.storage.local.get('googleCalendarEvents');
  if(googleCalendarEvents[a.id]) return {ok:true,duplicatePrevented:true};
  const response=await fetch(GOOGLE_CALENDAR_EVENTS_URL,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(googleEventPayload(a))});
  const data=await response.json();
  if(!response.ok) return {ok:false,error:data?.error?.message || `google_calendar_http_${response.status}`};
  googleCalendarEvents[a.id]={eventId:data.id,htmlLink:data.htmlLink || null,createdAt:new Date().toISOString()};
  await browser.storage.local.set({googleCalendarEvents});
  return {ok:true,eventId:data.id,htmlLink:data.htmlLink || null};
}
async function updateGoogleCalendarEvent(a){
  const accessToken=await validGoogleAccessToken();
  if(!accessToken) return {ok:false,skipped:true,reason:'google_not_connected'};
  const {googleCalendarEvents={}}=await browser.storage.local.get('googleCalendarEvents');
  const mapping=googleCalendarEvents[a.id];
  if(!mapping?.eventId) return createGoogleCalendarEvent(a);
  const response=await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(mapping.eventId)}`,{method:'PATCH',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(googleEventPayload(a))});
  const data=await response.json();
  if(!response.ok) return {ok:false,error:data?.error?.message || `google_calendar_http_${response.status}`};
  googleCalendarEvents[a.id]={...mapping,eventId:data.id || mapping.eventId,htmlLink:data.htmlLink || mapping.htmlLink || null,updatedAt:new Date().toISOString()};
  await browser.storage.local.set({googleCalendarEvents});
  return {ok:true,eventId:googleCalendarEvents[a.id].eventId};
}
async function deleteGoogleCalendarEvent(id){
  const {googleCalendarEvents={}}=await browser.storage.local.get('googleCalendarEvents');
  const mapping=googleCalendarEvents[id];
  if(!mapping?.eventId) return {ok:true,skipped:true};
  const accessToken=await validGoogleAccessToken();
  if(!accessToken) return {ok:false,reason:'google_not_connected'};
  const response=await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(mapping.eventId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${accessToken}`}});
  if(!response.ok && ![404,410].includes(response.status)) return {ok:false,error:`google_calendar_http_${response.status}`};
  delete googleCalendarEvents[id]; await browser.storage.local.set({googleCalendarEvents}); return {ok:true};
}

async function flushGoogleSyncQueue(){
  if(flushingGoogleQueue || (typeof navigator!=='undefined' && navigator.onLine===false)) return;
  flushingGoogleQueue=true;
  try{
    const accessToken=await validGoogleAccessToken();
    if(!accessToken) return;
    const { [GOOGLE_SYNC_QUEUE_KEY]: queue=[] } = await browser.storage.local.get(GOOGLE_SYNC_QUEUE_KEY);
    if(!queue.length) return;
    const remaining=[];
    for(let i=0;i<queue.length;i++){
      const item=queue[i];
      try{
        let result;
        if(item.action==='create') result=await createGoogleCalendarEvent(item.appointment);
        else if(item.action==='update') result=await updateGoogleCalendarEvent(item.appointment);
        else result=await deleteGoogleCalendarEvent(item.appointmentId);
        if(result?.ok){
          await appendGoogleEvidence('google_sync.synced',{action:item.action,appointmentId:item.appointmentId,queueId:item.queueId});
          continue;
        }
        remaining.push({...item,attempts:Number(item.attempts||0)+1,lastError:result?.error||result?.reason||'google_sync_failed',lastAttemptAt:new Date().toISOString()});
        for(let j=i+1;j<queue.length;j++) remaining.push(queue[j]);
        break;
      }catch(error){
        remaining.push({...item,attempts:Number(item.attempts||0)+1,lastError:String(error?.message||error),lastAttemptAt:new Date().toISOString()});
        for(let j=i+1;j<queue.length;j++) remaining.push(queue[j]);
        break;
      }
    }
    await browser.storage.local.set({[GOOGLE_SYNC_QUEUE_KEY]:remaining});
  }finally{flushingGoogleQueue=false;}
}

async function ensureHeartbeat(){
  if(await browser.alarms.get(HEARTBEAT_ALARM)) return;
  browser.alarms.create(HEARTBEAT_ALARM,{delayInMinutes:1,periodInMinutes:HEARTBEAT_PERIOD_MINUTES});
}
async function scheduleAppointmentAlarm(a){
  if(!a?.reminders?.browser) return;
  const startsAt=a.startsAt || a.starts_at;
  const fireAt=new Date(startsAt).getTime()-Number(a.reminders.minutesBefore || 0)*60000;
  if(Number.isFinite(fireAt) && fireAt>Date.now()) browser.alarms.create(`bgd:${a.id}`,{when:fireAt});
}
async function rebuildAppointmentAlarms(){
  const {appointments=[]}=await browser.storage.local.get('appointments');
  for(const a of appointments) if(['scheduled','confirmed','rescheduled','provisional_offline'].includes(a.status)) await scheduleAppointmentAlarm(a);
}
async function dispatchReminderById(id){
  const {appointments=[]}=await browser.storage.local.get('appointments');
  const a=appointments.find(x=>x.id===id); if(a) await dispatchReminder(a);
}
async function sweepDueReminders(){
  const {appointments=[]}=await browser.storage.local.get('appointments');
  const now=Date.now();
  for(const a of appointments){
    if(!['scheduled','confirmed','rescheduled','provisional_offline'].includes(a.status) || !a?.reminders?.browser) continue;
    const startsAt=a.startsAt || a.starts_at;
    const fireAt=new Date(startsAt).getTime()-Number(a.reminders?.minutesBefore || 0)*60000;
    if(fireAt<=now && fireAt>=now-REMINDER_GRACE_MS) await dispatchReminder(a);
  }
}
async function dispatchReminder(a){
  const startsAt=a.startsAt || a.starts_at;
  const key=`browser:${a.id}:${startsAt}:${Number(a.reminders?.minutesBefore || 0)}`;
  const {reminderDispatch={}}=await browser.storage.local.get('reminderDispatch');
  if(reminderDispatch[key]) return;
  const client=a.clientName || a.client_name || 'Cliente';
  const service=a.serviceName || a.service_name || 'Agendamento';
  await browser.notifications.create(`bgd-notify:${a.id}`,{type:'basic',title:'BrasilGuard Agenda',message:`${client}: ${service} em ${new Date(startsAt).toLocaleString('pt-BR')}`});
  reminderDispatch[key]=new Date().toISOString(); await browser.storage.local.set({reminderDispatch});
}

ensureHeartbeat(); rebuildAppointmentAlarms(); sweepDueReminders(); flushGoogleSyncQueue();