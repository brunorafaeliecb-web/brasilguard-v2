const form=document.getElementById('settings');
const statusEl=document.getElementById('status');

(async()=>{
  const {agendaSettings={}}=await browser.storage.local.get('agendaSettings');
  defaultReminderMinutes.value=agendaSettings.defaultReminderMinutes ?? 60;
  defaultRescheduleLimitHours.value=agendaSettings.defaultRescheduleLimitHours ?? 6;
})();

form.addEventListener('submit',async(e)=>{
  e.preventDefault();
  await browser.storage.local.set({agendaSettings:{
    defaultReminderMinutes:Number(defaultReminderMinutes.value),
    defaultRescheduleLimitHours:Number(defaultRescheduleLimitHours.value)
  }});
  statusEl.textContent='Configurações salvas.';
});
