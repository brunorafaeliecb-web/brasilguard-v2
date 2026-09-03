const form = document.getElementById('appointment-form');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('appointments');

const fields = {
  clientName: document.getElementById('clientName'),
  clientPhone: document.getElementById('clientPhone'),
  clientEmail: document.getElementById('clientEmail'),
  serviceName: document.getElementById('serviceName'),
  startsAt: document.getElementById('startsAt'),
  durationMinutes: document.getElementById('durationMinutes'),
  allowReschedule: document.getElementById('allowReschedule'),
  rescheduleLimitHours: document.getElementById('rescheduleLimitHours'),
  reminderEmail: document.getElementById('reminderEmail'),
  reminderWhatsapp: document.getElementById('reminderWhatsapp'),
  reminderBrowser: document.getElementById('reminderBrowser'),
  reminderMinutes: document.getElementById('reminderMinutes')
};

async function getAppointments(){
  const data = await browser.storage.local.get('appointments');
  return Array.isArray(data.appointments) ? data.appointments : [];
}

async function render(){
  const items = (await getAppointments()).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));
  listEl.innerHTML = items.length ? '' : '<small>Nenhum agendamento salvo.</small>';
  for(const item of items.slice(0,10)){
    const div = document.createElement('div');
    div.className='appointment';
    div.innerHTML = `<strong>${escapeHtml(item.clientName)}</strong>${escapeHtml(item.serviceName)}<br>${new Date(item.startsAt).toLocaleString('pt-BR')}<br><small>Reagendamento: ${item.allowReschedule ? 'permitido' : 'bloqueado'}</small>`;
    listEl.appendChild(div);
  }
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'\"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
}

function captureDraft(){
  return {
    clientName: fields.clientName.value,
    clientPhone: fields.clientPhone.value,
    clientEmail: fields.clientEmail.value,
    serviceName: fields.serviceName.value,
    startsAt: fields.startsAt.value,
    durationMinutes: fields.durationMinutes.value,
    allowReschedule: fields.allowReschedule.checked,
    rescheduleLimitHours: fields.rescheduleLimitHours.value,
    reminderEmail: fields.reminderEmail.checked,
    reminderWhatsapp: fields.reminderWhatsapp.checked,
    reminderBrowser: fields.reminderBrowser.checked,
    reminderMinutes: fields.reminderMinutes.value,
    savedAt: new Date().toISOString()
  };
}

let draftTimer = null;
function scheduleDraftSave(){
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async ()=>{
    await browser.storage.local.set({agendaDraft:captureDraft()});
    statusEl.textContent='Rascunho salvo automaticamente.';
  },250);
}

async function restoreDraft(){
  const {agendaDraft=null} = await browser.storage.local.get('agendaDraft');
  if(!agendaDraft) return;
  for(const [key,element] of Object.entries(fields)){
    if(!(key in agendaDraft)) continue;
    if(element.type==='checkbox') element.checked=Boolean(agendaDraft[key]);
    else element.value=agendaDraft[key] ?? '';
  }
  statusEl.textContent='Rascunho restaurado.';
}

form.addEventListener('input', scheduleDraftSave);
form.addEventListener('change', scheduleDraftSave);

form.addEventListener('submit', async (event)=>{
  event.preventDefault();
  const appointment = {
    id: crypto.randomUUID(),
    clientName: fields.clientName.value.trim(),
    clientPhone: fields.clientPhone.value.trim(),
    clientEmail: fields.clientEmail.value.trim(),
    serviceName: fields.serviceName.value.trim(),
    startsAt: new Date(fields.startsAt.value).toISOString(),
    durationMinutes: Number(fields.durationMinutes.value),
    allowReschedule: fields.allowReschedule.checked,
    rescheduleLimitHours: Number(fields.rescheduleLimitHours.value),
    reminders: {
      email: fields.reminderEmail.checked,
      whatsapp: fields.reminderWhatsapp.checked,
      browser: fields.reminderBrowser.checked,
      minutesBefore: Number(fields.reminderMinutes.value)
    },
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  const items = await getAppointments();
  items.push(appointment);
  await browser.storage.local.set({appointments:items});
  await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_CREATED', appointment});
  await browser.storage.local.remove('agendaDraft');
  statusEl.textContent='Agendamento salvo.';
  form.reset();
  fields.allowReschedule.checked = fields.reminderEmail.checked = fields.reminderWhatsapp.checked = fields.reminderBrowser.checked = true;
  fields.durationMinutes.value=60;
  fields.rescheduleLimitHours.value=6;
  fields.reminderMinutes.value=60;
  await render();
});

(async()=>{
  await restoreDraft();
  await render();
})();
