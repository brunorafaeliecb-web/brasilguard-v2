// BrasilGuard Agenda v0003.c — gate comercial.
// O backend é a fonte da verdade. A extensão nunca ativa licença por conta própria.
(() => {
  const $ = (id) => document.getElementById(id);
  async function token(){ const r=await browser.runtime.sendMessage({type:'BGD_GOOGLE_TOKEN'}); return r?.accessToken||null; }
  async function license(){
    const t=await token(); if(!t) return {licensed:false,status:'google_login_required'};
    const r=await fetch(`${String(BGD_CONFIG.COMMERCE_API_URL).replace(/\/$/,'')}/license`,{headers:{'apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-google-access-token':t}});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`http_${r.status}`); return d;
  }
  function shell(){
    let s=$('commerceGate'); if(s) return s;
    s=document.createElement('section'); s.id='commerceGate'; s.className='admin-panel'; s.innerHTML='<h2>Licença BrasilGuard Agenda</h2><p id="commerceStatus" class="muted">Verificando licença...</p><button id="commerceBuy" type="button" hidden>Comprar licença</button>';
    $('appContent')?.prepend(s); return s;
  }
  function protectedNodes(){ return ['premiumCalendar','appointment-form','catalogPanel','brandingPanel'].map($).filter(Boolean); }
  async function refresh(){
    if(!BGD_CONFIG.COMMERCE_ENFORCED) return;
    shell();
    try{
      const l=await license(); const status=$('commerceStatus');
      if(l.licensed){ if(status) status.textContent=`Licença ativa${l.plan_name?` — ${l.plan_name}`:''}${l.valid_until?` até ${new Date(l.valid_until).toLocaleDateString('pt-BR')}`:''}.`; protectedNodes().forEach(n=>n.hidden=false); return; }
      if(status) status.textContent='Esta conta ainda não possui uma licença ativa.'; protectedNodes().forEach(n=>n.hidden=true); const b=$('commerceBuy'); if(b) b.hidden=false;
    }catch(e){ if($('commerceStatus')) $('commerceStatus').textContent=`Não foi possível validar a licença: ${e.message}`; protectedNodes().forEach(n=>n.hidden=true); }
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(refresh,700),{once:true});
})();
