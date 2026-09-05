// BrasilGuard Agenda v0003.g — painel de comissões e rateio.
// Hierarquia: profissional+serviço > serviço > profissional > empresa.
// Rateio de execução é independente da taxa de comissão.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const MANAGER_ROLES = new Set(['manager','admin','owner']);
  let overview = null;

  async function token(){
    const r = await browser.runtime.sendMessage({type:'BGD_GOOGLE_TOKEN'});
    return r?.accessToken || null;
  }
  async function call(action,payload={}){
    const accessToken = await token();
    if(!accessToken) throw new Error('google_login_required');
    const r = await fetch(BGD_CONFIG.BACKEND_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-google-access-token':accessToken},
      body:JSON.stringify({action,...payload})
    });
    const data = await r.json().catch(()=>({}));
    if(!r.ok || data.ok===false) throw new Error(data.error || `http_${r.status}`);
    return data;
  }
  function numOrNull(v){
    const raw=String(v??'').trim();
    if(raw==='') return null;
    const n=Number(raw);
    if(!Number.isFinite(n)||n<0||n>100) throw new Error('percentual_invalido');
    return Math.round(n*100)/100;
  }
  function pctText(v){return v===null||v===undefined?'herdado':`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`;}
  function money(v){return v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function sourceLabel(v){return ({professional_service:'Profissional + serviço',service:'Serviço',professional:'Profissional',company:'Empresa'})[v] || v || '—';}
  function status(msg){const el=$('commissionStatus');if(el)el.textContent=msg;const global=$('status');if(global)global.textContent=msg;}

  function addStyles(){
    if($('commissionStyles')) return;
    const style=document.createElement('style');style.id='commissionStyles';style.textContent=`
      .commission-panel{margin-top:22px}.commission-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0}
      .commission-card{border:1px solid #d9dee8;border-radius:12px;padding:12px;background:#fff}.commission-card h3{margin:0 0 8px}
      .commission-table-wrap{overflow:auto;margin-top:12px}.commission-table{width:100%;border-collapse:collapse;min-width:980px}
      .commission-table th,.commission-table td{padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:middle;white-space:nowrap}
      .commission-table th{font-size:12px;text-transform:uppercase;letter-spacing:.03em}.commission-table input{min-width:92px}
      .commission-source{font-size:12px;padding:3px 7px;border-radius:999px;background:#eef2ff}.commission-effective{font-weight:700}
      .commission-note{padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0}.commission-inline{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
      .commission-inline label{min-width:150px;flex:1}.commission-empty{padding:18px;text-align:center;border:1px dashed #cbd5e1;border-radius:10px}
    `;document.head.appendChild(style);
  }

  function injectCatalogFields(){
    const pf=$('professionalCatalogForm');
    if(pf && !$('catalogProfessionalCommission')){
      const label=document.createElement('label');label.innerHTML='Comissão padrão (%)<input id="catalogProfessionalCommission" type="number" min="0" max="100" step="0.01" placeholder="Herdar da empresa" />';
      pf.insertBefore(label,pf.querySelector('button[type="submit"]'));
    }
    const sf=$('serviceCatalogForm');
    if(sf && !$('catalogServiceCommission')){
      const label=document.createElement('label');label.innerHTML='Comissão do serviço (%)<input id="catalogServiceCommission" type="number" min="0" max="100" step="0.01" placeholder="Herdar" />';
      sf.insertBefore(label,sf.querySelector('button[type="submit"]'));
    }
    const af=$('assignmentCatalogForm');
    if(af && !$('catalogAssignmentCommission')){
      const rate=document.createElement('label');rate.innerHTML='Comissão específica (%)<input id="catalogAssignmentCommission" type="number" min="0" max="100" step="0.01" placeholder="Herdar" />';
      const split=document.createElement('label');split.innerHTML='Rateio padrão da execução (%)<input id="catalogAssignmentSplit" type="number" min="0.01" max="100" step="0.01" value="100" />';
      af.insertBefore(rate,af.querySelector('button[type="submit"]'));af.insertBefore(split,af.querySelector('button[type="submit"]'));
    }
  }

  function buildPanel(){
    if($('commissionPanel')) return;
    const panel=document.createElement('section');panel.id='commissionPanel';panel.className='admin-panel commission-panel';panel.hidden=true;
    panel.innerHTML=`<div class="section-title-row"><div><h2>Comissões e rateio</h2><p class="muted">A regra mais específica prevalece. O rateio define a parcela executada; depois aplica-se a comissão.</p></div><button id="commissionReload" type="button" class="secondary compact">Atualizar</button></div>
      <div class="commission-note"><strong>Fórmula:</strong> valor comissionável × rateio da execução × taxa efetiva de comissão.</div>
      <div class="commission-inline">
        <label>Comissão padrão da empresa (%)<input id="companyCommissionRate" type="number" min="0" max="100" step="0.01" value="0" /></label>
        <label>Base<select id="companyCommissionBase"><option value="gross">Valor bruto</option><option value="net">Valor líquido</option></select></label>
        <button id="saveCompanyCommission" type="button">Salvar padrão</button>
      </div>
      <p id="commissionStatus" class="muted" role="status"></p>
      <div id="commissionDefaults" class="commission-grid"></div>
      <div class="commission-table-wrap"><table class="commission-table"><thead><tr><th>Profissional</th><th>Serviço</th><th>Preço</th><th>Padrão prof.</th><th>Padrão serviço</th><th>Override</th><th>Rateio</th><th>Taxa efetiva</th><th>Regra</th><th>Exemplo</th><th></th></tr></thead><tbody id="commissionRows"></tbody></table></div>`;
    const branding=$('brandingPanel');if(branding)branding.insertAdjacentElement('beforebegin',panel);else $('appContent')?.appendChild(panel);
    $('commissionReload').addEventListener('click',loadOverview);
    $('saveCompanyCommission').addEventListener('click',saveCompanySettings);
  }

  async function getRole(){const r=await call('whoami');return r.user?.role||'customer';}
  async function saveCompanySettings(){
    try{const rate=numOrNull($('companyCommissionRate').value)??0;await call('commission_settings_update',{defaultCommissionRatePct:rate,commissionBase:$('companyCommissionBase').value});status('Padrão de comissão da empresa salvo.');await loadOverview();}
    catch(e){status(`Falha ao salvar comissão da empresa: ${e.message}`);}
  }
  async function saveAssignment(row,tr){
    try{
      const rate=numOrNull(tr.querySelector('[data-role="override"]').value);
      const split=numOrNull(tr.querySelector('[data-role="split"]').value);
      if(split===null||split<=0)throw new Error('rateio_invalido');
      await call('commission_assignment_update',{professionalId:row.professional_id,serviceId:row.service_id,commissionRatePct:rate,splitDefaultPct:split});
      status(`Rateio de ${row.professional_name} / ${row.service_name} atualizado.`);await loadOverview();
    }catch(e){status(`Falha ao atualizar rateio: ${e.message}`);}
  }
  function renderOverview(data){
    overview=data;
    $('companyCommissionRate').value=Number(data.settings?.default_commission_rate_pct||0);
    $('companyCommissionBase').value=data.settings?.commission_base||'gross';
    const defaults=$('commissionDefaults');defaults.innerHTML='';
    for(const p of data.professionals||[]){const c=document.createElement('div');c.className='commission-card';c.innerHTML=`<h3>${escapeHtml(p.name)}</h3><div>Comissão padrão: <strong>${pctText(p.commission_rate_pct)}</strong></div><small class="muted">Profissional</small>`;defaults.appendChild(c);}
    for(const s of data.services||[]){const c=document.createElement('div');c.className='commission-card';c.innerHTML=`<h3>${escapeHtml(s.name)}</h3><div>Comissão padrão: <strong>${pctText(s.commission_rate_pct)}</strong></div><small class="muted">Serviço</small>`;defaults.appendChild(c);}
    const body=$('commissionRows');body.innerHTML='';
    if(!(data.assignments||[]).length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="11"><div class="commission-empty">Vincule um serviço a um profissional para configurar comissão específica e rateio.</div></td>';body.appendChild(tr);return;}
    for(const row of data.assignments){const tr=document.createElement('tr');tr.innerHTML=`<td>${escapeHtml(row.professional_name)}</td><td>${escapeHtml(row.service_name)}</td><td>${money(row.price)}</td><td>${pctText(row.professional_commission_rate_pct)}</td><td>${pctText(row.service_commission_rate_pct)}</td><td><input data-role="override" type="number" min="0" max="100" step="0.01" placeholder="Herdar" value="${row.commission_rate_pct??''}" /></td><td><input data-role="split" type="number" min="0.01" max="100" step="0.01" value="${row.split_default_pct??100}" /></td><td class="commission-effective">${pctText(row.effective_commission_rate_pct)}</td><td><span class="commission-source">${sourceLabel(row.rule_source)}</span></td><td>${money(row.commission_example)}</td><td><button type="button" class="secondary compact">Salvar</button></td>`;tr.querySelector('button').addEventListener('click',()=>saveAssignment(row,tr));body.appendChild(tr);}
  }
  async function loadOverview(){
    try{status('Carregando regras de comissão...');const data=await call('commission_overview');renderOverview(data);status('Comissões carregadas.');}
    catch(e){status(`Falha ao carregar comissões: ${e.message}`);}
  }

  function overrideCatalogSubmits(){
    const pf=$('professionalCatalogForm');
    pf?.addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();try{await call('professional_upsert',{professional:{name:$('catalogProfessionalName').value.trim(),specialty:$('catalogProfessionalSpecialty').value.trim(),phone:$('catalogProfessionalPhone').value.trim(),email:$('catalogProfessionalEmail').value.trim(),photoUrl:$('catalogProfessionalPhoto').value.trim(),commissionRatePct:numOrNull($('catalogProfessionalCommission').value)}});e.target.reset();if(typeof loadCatalogs==='function')await loadCatalogs();status('Profissional salvo com regra de comissão.');await loadOverview();}catch(err){status(`Falha ao salvar profissional: ${err.message}`);}},true);
    const sf=$('serviceCatalogForm');
    sf?.addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();try{await call('service_upsert',{service:{name:$('catalogServiceName').value.trim(),durationMinutes:Number($('catalogServiceDuration').value),bufferBeforeMinutes:Number($('catalogServiceBefore').value||0),bufferAfterMinutes:Number($('catalogServiceAfter').value||0),commissionRatePct:numOrNull($('catalogServiceCommission').value)}});e.target.reset();$('catalogServiceDuration').value=60;$('catalogServiceBefore').value=0;$('catalogServiceAfter').value=0;if(typeof loadCatalogs==='function')await loadCatalogs();status('Serviço salvo com regra de comissão.');await loadOverview();}catch(err){status(`Falha ao salvar serviço: ${err.message}`);}},true);
    const af=$('assignmentCatalogForm');
    af?.addEventListener('submit',async e=>{e.preventDefault();e.stopImmediatePropagation();try{const split=numOrNull($('catalogAssignmentSplit').value);if(split===null||split<=0)throw new Error('rateio_invalido');await call('professional_service_upsert',{assignment:{professionalId:$('catalogAssignmentProfessional').value,serviceId:$('catalogAssignmentService').value,durationMinutes:Number($('catalogAssignmentDuration').value),price:$('catalogAssignmentPrice').value,bufferBeforeMinutes:Number($('catalogAssignmentBefore').value||0),bufferAfterMinutes:Number($('catalogAssignmentAfter').value||0),onlineBookingEnabled:$('catalogAssignmentOnline').checked,commissionRatePct:numOrNull($('catalogAssignmentCommission').value),splitDefaultPct:split}});status('Serviço vinculado com comissão/rateio.');await loadOverview();}catch(err){status(`Falha ao vincular serviço: ${err.message}`);}},true);
  }

  async function init(){
    addStyles();buildPanel();
    try{
      const role=await getRole();
      if(role==='owner'){if($('permissionFieldset'))$('permissionFieldset').hidden=false;if($('brandingPanel'))$('brandingPanel').hidden=false;if($('catalogPanel'))$('catalogPanel').hidden=false;}
      if(!MANAGER_ROLES.has(role))return;
      injectCatalogFields();overrideCatalogSubmits();$('commissionPanel').hidden=false;await loadOverview();
    }catch(e){console.warn('BGD Agenda: painel de comissões indisponível.',e);}
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(init,1100),{once:true});
})();
