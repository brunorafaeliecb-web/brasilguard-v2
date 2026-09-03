const form = document.getElementById('appointment-form');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('appointments');

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
  return value.replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

form.addEventListener('submit', async (event)=>{
  event.preventDefault();
  const appointment = {
    id: crypto.randomUUID(),
    clientName: clientName.value.trim(),
    clientPhone: clientPhone.value.trim(),
    clientEmail: clientEmail.value.trim(),
    serviceName: serviceName.value.trim(),
    startsAt: new Date(startsAt.value).toISOString(),
    durationMinutes: Number(durationMinutes.value),
    allowReschedule: allowReschedule.checked,
    rescheduleLimitHours: Number(rescheduleLimitHours.value),
    reminders: {
      email: reminderEmail.checked,
      whatsapp: reminderWhatsapp.checked,
      browser: reminderBrowser.checked,
      minutesBefore: Number(reminderMinutes.value)
    },
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  const items = await getAppointments();
  items.push(appointment);
  await browser.storage.local.set({appointments:items});
  await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_CREATED', appointment});
  statusEl.textContent='Agendamento salvo.';
  form.reset();
  allowReschedule.checked = reminderEmail.checked = reminderWhatsapp.checked = reminderBrowser.checked = true;
  durationMinutes.value=60; rescheduleLimitHours.value=6; reminderMinutes.value=60;
  await render();
});

render();
