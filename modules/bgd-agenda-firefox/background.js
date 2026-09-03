// BrasilGuard Agenda — orquestração local.
// O backend será a fonte de verdade em produção. A extensão mantém fallback local para MVP/testes.

browser.runtime.onMessage.addListener(async (message)=>{
  if(message?.type !== 'BGD_APPOINTMENT_CREATED') return;
  const a = message.appointment;
  const fireAt = new Date(a.startsAt).getTime() - (a.reminders.minutesBefore * 60000);

  if(a.reminders.browser && fireAt > Date.now()){
    browser.alarms.create(`bgd:${a.id}`, {when:fireAt});
  }

  await enqueueIntegrations(a);
});

browser.alarms.onAlarm.addListener(async (alarm)=>{
  if(!alarm.name.startsWith('bgd:')) return;
  const id = alarm.name.slice(4);
  const {appointments=[]} = await browser.storage.local.get('appointments');
  const a = appointments.find(x=>x.id===id);
  if(!a || a.status!=='scheduled') return;
  browser.notifications.create(`bgd-notify:${id}`, {
    type:'basic',
    title:'BrasilGuard Agenda',
    message:`${a.clientName}: ${a.serviceName} em ${new Date(a.startsAt).toLocaleString('pt-BR')}`
  });
});

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

  // Não bloqueia o MVP quando ainda não há backend configurado.
  if(!BGD_CONFIG.BACKEND_URL || BGD_CONFIG.BACKEND_URL==='MUDARASENHA') return;
  try{
    await fetch(`${BGD_CONFIG.BACKEND_URL}/api/appointments`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(appointment)
    });
  }catch(error){ console.warn('BGD Agenda: backend indisponível; item preservado na fila local.', error); }
}
