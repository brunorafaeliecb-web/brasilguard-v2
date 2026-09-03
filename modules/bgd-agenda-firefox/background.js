// BrasilGuard Agenda — orquestração local resiliente.
// O backend será a fonte de verdade em produção. A extensão mantém fallback local para MVP/testes.

const HEARTBEAT_ALARM = 'bgd:heartbeat';
const HEARTBEAT_PERIOD_MINUTES = 1;
const REMINDER_GRACE_MS = 5 * 60 * 1000;

browser.browserAction.onClicked.addListener(async ()=>{
  await browser.tabs.create({url: browser.runtime.getURL('popup.html')});
});

browser.runtime.onMessage.addListener(async (message)=>{
  if(message?.type !== 'BGD_APPOINTMENT_CREATED') return;
  const a = message.appointment;
  await scheduleAppointmentAlarm(a);
  await enqueueIntegrations(a);
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

// Inicialização da página de background/event page.
ensureHeartbeat();
rebuildAppointmentAlarms();
sweepDueReminders();
