// BrasilGuard Agenda — orquestração local resiliente + Google Calendar OAuth.
// O backend será a fonte de verdade em produção. A extensão mantém fallback local para MVP/testes.

const HEARTBEAT_ALARM = 'bgd:heartbeat';
const HEARTBEAT_PERIOD_MINUTES = 1;
const REMINDER_GRACE_MS = 5 * 60 * 1000;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

browser.browserAction.onClicked.addListener(async ()=>{
  await browser.tabs.create({url: browser.runtime.getURL('popup.html')});
});

browser.runtime.onMessage.addListener((message)=>{
  if(message?.type === 'BGD_GOOGLE_CONNECT') return connectGoogleCalendar();
  if(message?.type === 'BGD_GOOGLE_STATUS') return getGoogleStatus();

  if(message?.type === 'BGD_APPOINTMENT_CREATED'){
    return (async()=>{
      const a = message.appointment;
      await scheduleAppointmentAlarm(a);
      await enqueueIntegrations(a);
      const google = await createGoogleCalendarEvent(a);
      return {ok:true, google};
    })();
  }

  if(message?.type === 'BGD_APPOINTMENT_UPDATED'){
    return (async()=>{
      const a = message.appointment;
      await browser.alarms.clear(`bgd:${a.id}`);
      await scheduleAppointmentAlarm(a);
      const google = await updateGoogleCalendarEvent(a);
      return {ok:true, google};
    })();
  }

  if(message?.type === 'BGD_APPOINTMENT_DELETED'){
    return (async()=>{
      const a = message.appointment;
      await browser.alarms.clear(`bgd:${a.id}`);
      const google = await deleteGoogleCalendarEvent(a.id);
      return {ok:true, google};
    })();
  }
});

browser.alarms.onAlarm.addListener(async (alarm)=>{
  if(alarm.name === HEARTBEAT_ALARM){
    await sweepDueReminders();
    return;
  }
  if(!alarm.name.startsWith('bgd:')) return;
  const id = alarm.name.slice(4);
  await dispatchReminderById(id);
});

browser.runtime.onStartup.addListener(async ()=>{
  await ensureHeartbeat();
  await rebuildAppointmentAlarms();
  await sweepDueReminders();
});

browser.runtime.onInstalled.addListener(async ()=>{
  await ensureHeartbeat();
  await rebuildAppointmentAlarms();
  await sweepDueReminders();
});

function base64Url(bytes){
  let binary='';
  for(const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function randomUrlSafe(size=32){
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value){
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function googleRedirectUri(){
  const firefoxRedirect = new URL(browser.identity.getRedirectURL());
  const subdomain = firefoxRedirect.hostname.split('.')[0];
  return `http://127.0.0.1/mozoauth2/${subdomain}`;
}

async function connectGoogleCalendar(){
  try{
    const verifier = randomUrlSafe(64);
    const challenge = await sha256Base64Url(verifier);
    const state = randomUrlSafe(24);
    const redirectUri = googleRedirectUri();

    const params = new URLSearchParams({
      client_id: BGD_CONFIG.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: BGD_CONFIG.GOOGLE_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    const responseUrl = await browser.identity.launchWebAuthFlow({
      interactive: true,
      url: `${GOOGLE_AUTH_URL}?${params.toString()}`
    });

    const callback = new URL(responseUrl);
    const returnedState = callback.searchParams.get('state');
    const error = callback.searchParams.get('error');
    const code = callback.searchParams.get('code');

    if(error) throw new Error(`google_oauth_${error}`);
    if(returnedState !== state) throw new Error('google_oauth_state_mismatch');
    if(!code) throw new Error('google_oauth_code_missing');

    const tokenBody = new URLSearchParams({
      client_id: BGD_CONFIG.GOOGLE_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: tokenBody.toString()
    });
    const tokenData = await tokenResponse.json();
    if(!tokenResponse.ok || !tokenData.access_token){
      throw new Error(tokenData.error_description || tokenData.error || `google_token_http_${tokenResponse.status}`);
    }

    const googleOAuth = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: Date.now() + (Number(tokenData.expires_in || 3600) * 1000),
      scope: tokenData.scope || BGD_CONFIG.GOOGLE_SCOPE,
      token_type: tokenData.token_type || 'Bearer',
      connected_at: new Date().toISOString()
    };
    await browser.storage.local.set({googleOAuth});
    return {ok:true, connected:true};
  }catch(error){
    console.error('BGD Agenda: falha OAuth Google.', error);
    return {ok:false, connected:false, error:String(error?.message || error)};
  }
}

async function getGoogleStatus(){
  const {googleOAuth=null} = await browser.storage.local.get('googleOAuth');
  return {connected:Boolean(googleOAuth?.access_token || googleOAuth?.refresh_token)};
}

async function validGoogleAccessToken(){
  const {googleOAuth=null} = await browser.storage.local.get('googleOAuth');
  if(!googleOAuth) return null;
  if(googleOAuth.access_token && Number(googleOAuth.expires_at || 0) > Date.now() + 60000){
    return googleOAuth.access_token;
  }
  if(!googleOAuth.refresh_token) return null;

  const body = new URLSearchParams({
    client_id: BGD_CONFIG.GOOGLE_CLIENT_ID,
    refresh_token: googleOAuth.refresh_token,
    grant_type: 'refresh_token'
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:body.toString()
  });
  const data = await response.json();
  if(!response.ok || !data.access_token){
    console.warn('BGD Agenda: refresh token Google falhou.', data);
    return null;
  }

  const updated = {
    ...googleOAuth,
    access_token:data.access_token,
    expires_at:Date.now() + (Number(data.expires_in || 3600) * 1000),
    scope:data.scope || googleOAuth.scope,
    token_type:data.token_type || googleOAuth.token_type
  };
  await browser.storage.local.set({googleOAuth:updated});
  return updated.access_token;
}

function googleEventPayload(appointment){
  const start = new Date(appointment.startsAt);
  const end = new Date(start.getTime() + Number(appointment.durationMinutes || 60) * 60000);
  return {
    summary: appointment.serviceName,
    description: `Cliente: ${appointment.clientName}\nWhatsApp: ${appointment.clientPhone}${appointment.clientEmail ? `\nE-mail: ${appointment.clientEmail}` : ''}\nOrigem: BrasilGuard Agenda`,
    start:{dateTime:start.toISOString()},
    end:{dateTime:end.toISOString()},
    reminders:{
      useDefault:false,
      overrides:[{method:'popup', minutes:Number(appointment.reminders?.minutesBefore || 60)}]
    }
  };
}

async function createGoogleCalendarEvent(appointment){
  const accessToken = await validGoogleAccessToken();
  if(!accessToken) return {ok:false, skipped:true, reason:'google_not_connected'};

  const {googleCalendarEvents={}} = await browser.storage.local.get('googleCalendarEvents');
  if(googleCalendarEvents[appointment.id]) return {ok:true, duplicatePrevented:true};

  const response = await fetch(GOOGLE_CALENDAR_EVENTS_URL, {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${accessToken}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(googleEventPayload(appointment))
  });
  const data = await response.json();
  if(!response.ok){
    console.warn('BGD Agenda: criação no Google Calendar falhou.', data);
    return {ok:false, error:data?.error?.message || `google_calendar_http_${response.status}`};
  }

  googleCalendarEvents[appointment.id] = {
    eventId:data.id,
    htmlLink:data.htmlLink || null,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  await browser.storage.local.set({googleCalendarEvents});
  return {ok:true, eventId:data.id, htmlLink:data.htmlLink || null};
}

async function updateGoogleCalendarEvent(appointment){
  const accessToken = await validGoogleAccessToken();
  if(!accessToken) return {ok:false, skipped:true, reason:'google_not_connected'};

  const {googleCalendarEvents={}} = await browser.storage.local.get('googleCalendarEvents');
  const mapping = googleCalendarEvents[appointment.id];
  if(!mapping?.eventId) return createGoogleCalendarEvent(appointment);

  const url = `${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(mapping.eventId)}`;
  const response = await fetch(url, {
    method:'PATCH',
    headers:{
      'Authorization':`Bearer ${accessToken}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(googleEventPayload(appointment))
  });
  const data = await response.json();
  if(!response.ok){
    console.warn('BGD Agenda: atualização no Google Calendar falhou.', data);
    return {ok:false, error:data?.error?.message || `google_calendar_http_${response.status}`};
  }

  googleCalendarEvents[appointment.id] = {
    ...mapping,
    eventId:data.id || mapping.eventId,
    htmlLink:data.htmlLink || mapping.htmlLink || null,
    updatedAt:new Date().toISOString()
  };
  await browser.storage.local.set({googleCalendarEvents});
  return {ok:true, eventId:googleCalendarEvents[appointment.id].eventId};
}

async function deleteGoogleCalendarEvent(appointmentId){
  const {googleCalendarEvents={}} = await browser.storage.local.get('googleCalendarEvents');
  const mapping = googleCalendarEvents[appointmentId];
  if(!mapping?.eventId) return {ok:true, skipped:true, reason:'no_google_mapping'};

  const accessToken = await validGoogleAccessToken();
  if(!accessToken) return {ok:false, skipped:true, reason:'google_not_connected'};

  const url = `${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(mapping.eventId)}`;
  const response = await fetch(url, {
    method:'DELETE',
    headers:{'Authorization':`Bearer ${accessToken}`}
  });

  if(!response.ok && response.status !== 404 && response.status !== 410){
    let data={};
    try{ data=await response.json(); }catch(_error){}
    console.warn('BGD Agenda: exclusão no Google Calendar falhou.', data);
    return {ok:false, error:data?.error?.message || `google_calendar_http_${response.status}`};
  }

  delete googleCalendarEvents[appointmentId];
  await browser.storage.local.set({googleCalendarEvents});
  return {ok:true};
}

async function ensureHeartbeat(){
  const current = await browser.alarms.get(HEARTBEAT_ALARM);
  if(current) return;
  browser.alarms.create(HEARTBEAT_ALARM, {
    delayInMinutes: HEARTBEAT_PERIOD_MINUTES,
    periodInMinutes: HEARTBEAT_PERIOD_MINUTES
  });
}

async function scheduleAppointmentAlarm(a){
  if(!a?.reminders?.browser) return;
  const fireAt = new Date(a.startsAt).getTime() - (Number(a.reminders.minutesBefore || 0) * 60000);
  if(!Number.isFinite(fireAt)) return;
  if(fireAt > Date.now()) browser.alarms.create(`bgd:${a.id}`, {when:fireAt});
}

async function rebuildAppointmentAlarms(){
  const {appointments=[]} = await browser.storage.local.get('appointments');
  for(const a of appointments){
    if(a.status !== 'scheduled') continue;
    await scheduleAppointmentAlarm(a);
  }
}

async function dispatchReminderById(id){
  const {appointments=[]} = await browser.storage.local.get('appointments');
  const a = appointments.find(x=>x.id===id);
  if(!a) return;
  await dispatchReminder(a);
}

async function sweepDueReminders(){
  const {appointments=[]} = await browser.storage.local.get('appointments');
  const now = Date.now();
  for(const a of appointments){
    if(a.status !== 'scheduled' || !a?.reminders?.browser) continue;
    const fireAt = new Date(a.startsAt).getTime() - (Number(a.reminders.minutesBefore || 0) * 60000);
    if(!Number.isFinite(fireAt)) continue;
    if(fireAt <= now && fireAt >= now - REMINDER_GRACE_MS){
      await dispatchReminder(a);
    }
  }
}

async function dispatchReminder(a){
  if(a.status !== 'scheduled' || !a?.reminders?.browser) return;
  const key = `browser:${a.id}:${a.startsAt}:${Number(a.reminders.minutesBefore || 0)}`;
  const {reminderDispatch={}} = await browser.storage.local.get('reminderDispatch');
  if(reminderDispatch[key]) return;

  try{
    await browser.notifications.create(`bgd-notify:${a.id}`, {
      type:'basic',
      title:'BrasilGuard Agenda',
      message:`${a.clientName}: ${a.serviceName} em ${new Date(a.startsAt).toLocaleString('pt-BR')}`
    });
    reminderDispatch[key] = new Date().toISOString();
    await browser.storage.local.set({reminderDispatch});
  }catch(error){
    console.error('BGD Agenda: falha ao exibir notificação.', error);
  }
}

async function enqueueIntegrations(appointment){
  const {integrationQueue=[]} = await browser.storage.local.get('integrationQueue');
  const channels=[];
  if(appointment.reminders.email) channels.push('email');
  if(appointment.reminders.whatsapp) channels.push('whatsapp');
  channels.push('google_calendar');
  integrationQueue.push({
    id:crypto.randomUUID(),
    appointmentId:appointment.id,
    channels,
    status:'pending',
    createdAt:new Date().toISOString()
  });
  await browser.storage.local.set({integrationQueue});

  const {bgdSession=null} = await browser.storage.local.get('bgdSession');
  if(!BGD_CONFIG.BACKEND_URL || !bgdSession?.access_token) return;

  try{
    const response = await fetch(BGD_CONFIG.BACKEND_URL, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,
        'Authorization':'Bearer ' + bgdSession.access_token
      },
      body:JSON.stringify(appointment)
    });
    if(!response.ok) throw new Error('backend_http_' + response.status);
  }catch(error){
    console.warn('BGD Agenda: backend indisponível; item preservado na fila local.', error);
  }
}

ensureHeartbeat();
rebuildAppointmentAlarms();
sweepDueReminders();
