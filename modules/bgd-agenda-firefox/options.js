const form=document.getElementById('settings');
const loginForm=document.getElementById('login-form');
const logoutButton=document.getElementById('logout');
const statusEl=document.getElementById('status');
const authState=document.getElementById('auth-state');

async function refreshAuthState(){
  const {bgdSession=null}=await browser.storage.local.get('bgdSession');
  if(bgdSession?.access_token){
    authState.textContent='Autenticado: ' + (bgdSession.user?.email || 'operador');
  }else{
    authState.textContent='Não autenticado.';
  }
}

(async()=>{
  const {agendaSettings={}}=await browser.storage.local.get('agendaSettings');
  defaultReminderMinutes.value=agendaSettings.defaultReminderMinutes ?? 60;
  defaultRescheduleLimitHours.value=agendaSettings.defaultRescheduleLimitHours ?? 6;
  await refreshAuthState();
})();

form.addEventListener('submit',async(e)=>{
  e.preventDefault();
  await browser.storage.local.set({agendaSettings:{
    defaultReminderMinutes:Number(defaultReminderMinutes.value),
    defaultRescheduleLimitHours:Number(defaultRescheduleLimitHours.value)
  }});
  statusEl.textContent='Configurações salvas.';
});

loginForm.addEventListener('submit', async(e)=>{
  e.preventDefault();
  statusEl.textContent='Autenticando...';
  try{
    const response=await fetch(BGD_CONFIG.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY
      },
      body:JSON.stringify({
        email:loginEmail.value.trim(),
        password:loginPassword.value
      })
    });
    const payload=await response.json();
    if(!response.ok || !payload.access_token){
      throw new Error(payload.error_description || payload.msg || 'Falha na autenticação');
    }
    await browser.storage.local.set({bgdSession:payload});
    loginPassword.value='';
    statusEl.textContent='Login realizado.';
    await refreshAuthState();
  }catch(error){
    statusEl.textContent='Erro de login: ' + error.message;
  }
});

logoutButton.addEventListener('click', async()=>{
  await browser.storage.local.remove('bgdSession');
  loginPassword.value='';
  statusEl.textContent='Sessão encerrada.';
  await refreshAuthState();
});
