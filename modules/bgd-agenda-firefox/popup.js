const form = document.getElementById('appointment-form');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('appointments');
const googleStatusEl = document.getElementById('googleStatus');
const connectGoogleBtn = document.getElementById('connectGoogle');
const saveAppointmentBtn = document.getElementById('saveAppointment');
const cancelEditBtn = document.getElementById('cancelEdit');
const editingIdEl = document.getElementById('editingId');

const fields = {
  clientName: document.getElementById('clientName'),
  clientPhone: document.getElementById('clientPhone'),
  clientEmail: document.getElementById('clientEmail'),
  serviceName: document.getElementById('serviceName'),
  startsAt: document.getElementById('startsAt'),
  durationMinutes: document.getElementById('durationMinutes'),
  allowEdit: document.getElementById('allowEdit'),
  allowDelete: document.getElementById('allowDelete'),
  allowReschedule: document.getElementById('allowReschedule'),
  rescheduleLimitHours: document.getElementById('rescheduleLimitHours'),
  reminderEmail: document.getElementById('reminderEmail'),
  reminderWhatsapp: document.getElementById('reminderWhatsapp'),
  reminderBrowser: document.getElementById('reminderBrowser'),
  reminderMinutes: document.getElementById('reminderMinutes')
};

const requiredFields = [
  ['clientName','Cliente'],
  ['clientPhone','WhatsApp'],
  ['serviceName','Serviço'],
  ['startsAt','Data e hora'],
  ['durationMinutes','Duração'],
  ['reminderMinutes','Minutos antes']
];

async function getAppointments(){
  const data = await browser.storage.local.get('appointments');
  return Array.isArray(data.appointments) ? data.appointments : [];
}

function permissionsOf(item){
  return {
    edit: item?.permissions?.edit !== false,
    delete: item?.permissions?.delete !== false,
    reschedule: item?.permissions?.reschedule !== false && item?.allowReschedule !== false,
    rescheduleLimitHours: Number(item?.permissions?.rescheduleLimitHours ?? item?.rescheduleLimitHours ?? 6)
  };
}

async function currentRole(){
  const {agendaRole='admin'} = await browser.storage.local.get('agendaRole');
  return agendaRole;
}

async function render(){
  const role = await currentRole();
  const items = (await getAppointments()).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));
  listEl.innerHTML = items.length ? '' : '<small>Nenhum agendamento salvo.</small>';

  for(const item of items.slice(0,30)){
    const p = permissionsOf(item);
    const isAdmin = role === 'admin';
    const div = document.createElement('div');
    div.className='appointment';
    div.innerHTML = `
      <strong>${escapeHtml(item.clientName)}</strong>
      ${escapeHtml(item.serviceName)}<br>
      ${new Date(item.startsAt).toLocaleString('pt-BR')}<br>
      <div class="permissions">Editar: ${p.edit?'sim':'não'} · Excluir: ${p.delete?'sim':'não'} · Reagendar: ${p.reschedule?'sim':'não'} · Limite: ${p.rescheduleLimitHours}h</div>
      <div class="appointment-actions"></div>`;

    const actions = div.querySelector('.appointment-actions');

    if(isAdmin || p.edit){
      const editBtn = document.createElement('button');
      editBtn.type='button';
      editBtn.textContent='Editar';
      editBtn.addEventListener('click',()=>startEdit(item.id));
      actions.appendChild(editBtn);
    }

    if(isAdmin || p.delete){
      const deleteBtn = document.createElement('button');
      deleteBtn.type='button';
      deleteBtn.textContent='Excluir';
      deleteBtn.className='danger';
      deleteBtn.addEventListener('click',()=>deleteAppointment(item.id));
      actions.appendChild(deleteBtn);
    }

    listEl.appendChild(div);
  }
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'\"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
}

function toDatetimeLocal(iso){
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

async function startEdit(id){
  const items = await getAppointments();
  const item = items.find(x=>x.id===id);
  if(!item) return;
  const p = permissionsOf(item);
  const role = await currentRole();
  if(role !== 'admin' && !p.edit){
    statusEl.textContent='Edição bloqueada pelas permissões deste agendamento.';
    return;
  }

  editingIdEl.value = item.id;
  fields.clientName.value = item.clientName || '';
  fields.clientPhone.value = item.clientPhone || '';
  fields.clientEmail.value = item.clientEmail || '';
  fields.serviceName.value = item.serviceName || '';
  fields.startsAt.value = toDatetimeLocal(item.startsAt);
  fields.durationMinutes.value = item.durationMinutes || 60;
  fields.allowEdit.checked = p.edit;
  fields.allowDelete.checked = p.delete;
  fields.allowReschedule.checked = p.reschedule;
  fields.rescheduleLimitHours.value = p.rescheduleLimitHours;
  fields.reminderEmail.checked = Boolean(item.reminders?.email);
  fields.reminderWhatsapp.checked = Boolean(item.reminders?.whatsapp);
  fields.reminderBrowser.checked = Boolean(item.reminders?.browser);
  fields.reminderMinutes.value = Number(item.reminders?.minutesBefore || 60);
  saveAppointmentBtn.textContent='Salvar alterações';
  cancelEditBtn.hidden=false;
  statusEl.textContent='Editando agendamento.';
  window.scrollTo({top:0,behavior:'smooth'});
}

function resetFormState(){
  editingIdEl.value='';
  form.reset();
  fields.allowEdit.checked = true;
  fields.allowDelete.checked = true;
  fields.allowReschedule.checked = true;
  fields.reminderEmail.checked = true;
  fields.reminderWhatsapp.checked = true;
  fields.reminderBrowser.checked = true;
  fields.durationMinutes.value=60;
  fields.rescheduleLimitHours.value=6;
  fields.reminderMinutes.value=60;
  saveAppointmentBtn.textContent='Salvar agendamento';
  cancelEditBtn.hidden=true;
}

cancelEditBtn.addEventListener('click', async ()=>{
  resetFormState();
  await browser.storage.local.remove('agendaDraft');
  statusEl.textContent='Edição cancelada.';
});

async function deleteAppointment(id){
  const items = await getAppointments();
  const item = items.find(x=>x.id===id);
  if(!item) return;
  const p = permissionsOf(item);
  const role = await currentRole();
  if(role !== 'admin' && !p.delete){
    statusEl.textContent='Exclusão bloqueada pelas permissões deste agendamento.';
    return;
  }
  if(!confirm(`Excluir o agendamento de ${item.clientName}?`)) return;

  const integrationResult = await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_DELETED', appointment:item});
  await browser.storage.local.set({appointments:items.filter(x=>x.id!==id)});
  if(editingIdEl.value===id) resetFormState();
  statusEl.textContent = integrationResult?.google?.ok === false
    ? 'Agendamento excluído localmente; atenção: falha ao excluir no Google Agenda.'
    : 'Agendamento excluído.';
  await render();
}

async function refreshGoogleStatus(){
  try{
    const result = await browser.runtime.sendMessage({type:'BGD_GOOGLE_STATUS'});
    const connected = Boolean(result?.connected);
    googleStatusEl.textContent = connected ? 'Conectado. Novos agendamentos serão enviados ao Google Agenda.' : 'Ainda não conectado.';
    connectGoogleBtn.textContent = connected ? 'Reconectar Google Agenda' : 'Conectar Google Agenda';
    googleStatusEl.classList.toggle('ok', connected);
  }catch(error){
    googleStatusEl.textContent='Não foi possível verificar a conexão com o Google.';
  }
}

connectGoogleBtn.addEventListener('click', async ()=>{
  connectGoogleBtn.disabled=true;
  googleStatusEl.textContent='Abrindo autorização do Google...';
  try{
    const result = await browser.runtime.sendMessage({type:'BGD_GOOGLE_CONNECT'});
    if(result?.ok){
      googleStatusEl.textContent='Google Agenda conectado com sucesso.';
      googleStatusEl.classList.add('ok');
      connectGoogleBtn.textContent='Reconectar Google Agenda';
    }else{
      googleStatusEl.textContent='Falha ao conectar Google Agenda: ' + (result?.error || 'erro desconhecido');
    }
  }catch(error){
    googleStatusEl.textContent='Falha ao conectar Google Agenda: ' + String(error?.message || error);
  }finally{
    connectGoogleBtn.disabled=false;
  }
});

function captureDraft(){
  return {
    editingId: editingIdEl.value || null,
    clientName: fields.clientName.value,
    clientPhone: fields.clientPhone.value,
    clientEmail: fields.clientEmail.value,
    serviceName: fields.serviceName.value,
    startsAt: fields.startsAt.value,
    durationMinutes: fields.durationMinutes.value,
    allowEdit: fields.allowEdit.checked,
    allowDelete: fields.allowDelete.checked,
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
  editingIdEl.value = agendaDraft.editingId || '';
  for(const [key,element] of Object.entries(fields)){
    if(!(key in agendaDraft)) continue;
    if(element.type==='checkbox') element.checked=Boolean(agendaDraft[key]);
    else element.value=agendaDraft[key] ?? '';
  }
  if(editingIdEl.value){
    saveAppointmentBtn.textContent='Salvar alterações';
    cancelEditBtn.hidden=false;
  }
  statusEl.textContent='Rascunho restaurado.';
}

function validateRequired(){
  const missing=[];
  for(const [key,label] of requiredFields){
    const element=fields[key];
    const raw=String(element.value ?? '').trim();
    const invalidNumber = element.type==='number' && (!Number.isFinite(Number(raw)) || Number(raw) < Number(element.min || 0));
    if(!raw || invalidNumber){
      missing.push(label);
      element.classList.add('field-error');
    }else{
      element.classList.remove('field-error');
    }
  }
  if(fields.clientEmail.value && !fields.clientEmail.checkValidity()){
    fields.clientEmail.classList.add('field-error');
    missing.push('E-mail válido');
  }else fields.clientEmail.classList.remove('field-error');

  if(missing.length){
    statusEl.textContent='Não foi salvo. Preencha: ' + missing.join(', ') + '.';
    const first = requiredFields.find(([key])=>fields[key].classList.contains('field-error'));
    if(first) fields[first[0]].focus();
    return false;
  }
  return true;
}

form.addEventListener('input', scheduleDraftSave);
form.addEventListener('change', scheduleDraftSave);

form.addEventListener('submit', async (event)=>{
  event.preventDefault();
  await browser.storage.local.set({agendaDraft:captureDraft()});
  if(!validateRequired()) return;

  const startDate = new Date(fields.startsAt.value);
  if(Number.isNaN(startDate.getTime())){
    fields.startsAt.classList.add('field-error');
    statusEl.textContent='Não foi salvo. Informe uma data e hora válidas.';
    fields.startsAt.focus();
    return;
  }

  const items = await getAppointments();
  const editingId = editingIdEl.value;
  const existing = editingId ? items.find(x=>x.id===editingId) : null;

  if(existing){
    const oldPermissions = permissionsOf(existing);
    const role = await currentRole();
    if(role !== 'admin' && !oldPermissions.edit){
      statusEl.textContent='Edição bloqueada pelas permissões deste agendamento.';
      return;
    }
    if(existing.startsAt !== startDate.toISOString() && role !== 'admin' && !oldPermissions.reschedule){
      statusEl.textContent='Reagendamento bloqueado pelas permissões deste agendamento.';
      return;
    }
    if(existing.startsAt !== startDate.toISOString() && role !== 'admin' && oldPermissions.rescheduleLimitHours > 0){
      const cutoff = new Date(existing.startsAt).getTime() - oldPermissions.rescheduleLimitHours*3600000;
      if(Date.now() > cutoff){
        statusEl.textContent=`Reagendamento bloqueado: limite de ${oldPermissions.rescheduleLimitHours}h antes do horário.`;
        return;
      }
    }
  }

  const appointment = {
    id: existing?.id || crypto.randomUUID(),
    clientName: fields.clientName.value.trim(),
    clientPhone: fields.clientPhone.value.trim(),
    clientEmail: fields.clientEmail.value.trim(),
    serviceName: fields.serviceName.value.trim(),
    startsAt: startDate.toISOString(),
    durationMinutes: Number(fields.durationMinutes.value),
    allowReschedule: fields.allowReschedule.checked,
    rescheduleLimitHours: Number(fields.rescheduleLimitHours.value || 0),
    permissions: {
      edit: fields.allowEdit.checked,
      delete: fields.allowDelete.checked,
      reschedule: fields.allowReschedule.checked,
      rescheduleLimitHours: Number(fields.rescheduleLimitHours.value || 0)
    },
    reminders: {
      email: fields.reminderEmail.checked,
      whatsapp: fields.reminderWhatsapp.checked,
      browser: fields.reminderBrowser.checked,
      minutesBefore: Number(fields.reminderMinutes.value)
    },
    status: existing?.status || 'scheduled',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if(existing){
    const index = items.findIndex(x=>x.id===existing.id);
    items[index] = appointment;
    await browser.storage.local.set({appointments:items});
    const integrationResult = await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_UPDATED', appointment, previous:existing});
    statusEl.textContent = integrationResult?.google?.ok === false
      ? 'Alterações salvas localmente; atenção: falha ao atualizar no Google Agenda.'
      : 'Agendamento atualizado.';
  }else{
    items.push(appointment);
    await browser.storage.local.set({appointments:items});
    const integrationResult = await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_CREATED', appointment});
    statusEl.textContent = integrationResult?.ok ? 'Agendamento salvo.' : 'Agendamento salvo localmente.';
  }

  await browser.storage.local.remove('agendaDraft');
  resetFormState();
  await render();
});

(async()=>{
  await restoreDraft();
  await refreshGoogleStatus();
  await render();
})();
