// BrasilGuard Agenda v0003.d — offline-first governado.
// Cache local autorizado + fila de mutações + reconciliação ao reconectar.
// Regra: operação criada offline é PROVISÓRIA até o backend confirmar.
(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const QUEUE_KEY = 'bgdOfflineQueueV1';
  const CACHE_KEY = 'bgdOfflineCacheV1';
  const EVIDENCE_KEY = 'bgdOfflineEvidenceV1';
  const CONFLICT_KEY = 'bgdOfflineConflictsV1';
  const MAX_EVIDENCE = 500;
  const READ_ACTIONS = new Set(['whoami','branding_get','professionals','services','professional_services','list_mine','list_all']);
  const MUTATION_ACTIONS = new Set(['create','update','cancel']);
  const DEFAULT_LICENSE_GRACE_HOURS = Number(BGD_CONFIG.OFFLINE_LICENSE_GRACE_HOURS || 72);
  let flushing = false;

  const storageGet = async (key, fallback) => (await browser.storage.local.get(key))[key] ?? fallback;
  const storageSet = async (key, value) => browser.storage.local.set({[key]: value});
  const nowIso = () => new Date().toISOString();

  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
  }

  async function evidence(type, data = {}) {
    const rows = await storageGet(EVIDENCE_KEY, []);
    rows.push({at:nowIso(),type,hash:await sha256(JSON.stringify(data)),data});
    if(rows.length>MAX_EVIDENCE) rows.splice(0,rows.length-MAX_EVIDENCE);
    await storageSet(EVIDENCE_KEY,rows);
  }

  function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}
  function bodyOf(init={}){try{return typeof init.body==='string'?JSON.parse(init.body):{};}catch{return {};}}
  function requestUrl(input){if(typeof input==='string')return input;if(input instanceof URL)return input.toString();return input?.url||String(input||'');}
  function cacheSubKey(action,payload={}){return action==='professional_services'?`${action}:${payload.professionalId||payload.professional_id||''}`:action;}

  async function cacheApi(action,payload,data){
    if(!READ_ACTIONS.has(action))return;
    const cache=await storageGet(CACHE_KEY,{});
    cache[cacheSubKey(action,payload)]={data,cachedAt:nowIso()};
    await storageSet(CACHE_KEY,cache);
  }
  async function cachedApi(action,payload={}){
    const cache=await storageGet(CACHE_KEY,{}),hit=cache[cacheSubKey(action,payload)];
    if(!hit)throw new Error(`offline_cache_miss:${action}`);
    return {...hit.data,offline:true,cachedAt:hit.cachedAt};
  }

  function localAppointmentShape(a={}){
    return {...a,id:a.id,client_name:a.client_name??a.clientName,client_phone:a.client_phone??a.clientPhone,client_email:a.client_email??a.clientEmail,professional_id:a.professional_id??a.professionalId,service_id:a.service_id??a.serviceId,service_name:a.service_name??a.serviceName,starts_at:a.starts_at??a.startsAt,duration_minutes:Number(a.duration_minutes??a.durationMinutes??60),status:a.status||'provisional_offline',_offline_status:'pending'};
  }

  async function applyLocalMutation(action,payload){
    const cache=await storageGet(CACHE_KEY,{}),id=payload?.id||payload?.appointment?.id;
    for(const key of ['list_mine','list_all']){
      const hit=cache[key];if(!hit?.data?.appointments)continue;
      let items=[...hit.data.appointments];
      if(action==='create'){
        const a=localAppointmentShape(payload.appointment||{});items=items.filter(x=>x.id!==a.id);items.push(a);
      }else if(action==='update'){
        const a=localAppointmentShape(payload.appointment||{});items=items.map(x=>x.id===id?{...x,...a,_offline_status:'pending'}:x);
      }else if(action==='cancel') items=items.map(x=>x.id===id?{...x,status:'cancelled',_offline_status:'pending'}:x);
      hit.data.appointments=items;hit.cachedAt=nowIso();
    }
    await storageSet(CACHE_KEY,cache);
  }

  async function markLocalConflict(id,error){
    const cache=await storageGet(CACHE_KEY,{});
    for(const key of ['list_mine','list_all']){
      const hit=cache[key];if(!hit?.data?.appointments)continue;
      hit.data.appointments=hit.data.appointments.map(x=>x.id===id?{...x,status:'conflict_offline',_offline_status:'conflict',_offline_error:error}:x);
      hit.cachedAt=nowIso();
    }
    await storageSet(CACHE_KEY,cache);
  }

  async function fingerprintFor(action,appointmentId,payload){return sha256(JSON.stringify({action,appointmentId,payload}));}

  async function queueMutation(action,payload){
    let queue=await storageGet(QUEUE_KEY,[]);
    const appointmentId=payload?.id||payload?.appointment?.id||crypto.randomUUID();
    const same=queue.filter(x=>x.status==='pending'&&x.appointmentId===appointmentId);

    // Coalescência: CREATE + UPDATE vira um CREATE com a versão mais nova.
    if(action==='update'){
      const create=same.find(x=>x.action==='create');
      if(create){
        const nextPayload={...create.payload,appointment:payload.appointment||create.payload.appointment};
        const next={...create,payload:nextPayload,fingerprint:await fingerprintFor('create',appointmentId,nextPayload),updatedAt:nowIso()};
        queue=queue.map(x=>x.queueId===create.queueId?next:x).filter(x=>x.appointmentId!==appointmentId||x.queueId===create.queueId||x.action!=='update');
        await storageSet(QUEUE_KEY,queue);await applyLocalMutation('update',payload);await evidence('offline.coalesced',{from:'create+update',appointmentId,queueId:create.queueId});
        updateBanner();scheduleProvisionalStatus();return {ok:true,offline:true,provisional:true,appointment:localAppointmentShape(payload.appointment||{})};
      }
      // múltiplos UPDATEs: mantém só o mais recente.
      queue=queue.filter(x=>!(x.status==='pending'&&x.appointmentId===appointmentId&&x.action==='update'));
    }

    // CREATE ainda não sincronizado + CANCEL = nada precisa ir ao servidor.
    if(action==='cancel'){
      const create=same.find(x=>x.action==='create');
      if(create){
        queue=queue.filter(x=>x.appointmentId!==appointmentId);
        await storageSet(QUEUE_KEY,queue);await applyLocalMutation('cancel',payload);await evidence('offline.coalesced',{from:'create+cancel',appointmentId,net:'no_remote_operation'});
        updateBanner();scheduleProvisionalStatus('Cancelamento local concluído. O agendamento ainda não havia sido enviado ao servidor.');return {ok:true,offline:true,provisional:false,localOnly:true};
      }
      // CANCEL substitui UPDATE pendente do mesmo agendamento.
      queue=queue.filter(x=>!(x.status==='pending'&&x.appointmentId===appointmentId&&x.action==='update'));
    }

    const fingerprint=await fingerprintFor(action,appointmentId,payload);
    const existing=queue.find(x=>x.fingerprint===fingerprint&&x.status==='pending');
    if(!existing){
      queue.push({queueId:crypto.randomUUID(),action,payload,appointmentId,fingerprint,status:'pending',attempts:0,createdAt:nowIso(),lastError:null});
      await storageSet(QUEUE_KEY,queue);await evidence('offline.queued',{action,appointmentId,fingerprint});await applyLocalMutation(action,payload);
    }
    updateBanner();scheduleProvisionalStatus();
    return {ok:true,offline:true,provisional:true,appointment:payload?.appointment?localAppointmentShape(payload.appointment):null};
  }

  function scheduleProvisionalStatus(message='Salvo offline como PROVISÓRIO. Será confirmado automaticamente quando a conexão voltar.'){
    setTimeout(()=>{const s=document.getElementById('status');if(s&&!navigator.onLine)s.textContent=message;},350);
  }

  function toInterval(a){const start=new Date(a.starts_at??a.startsAt),mins=Number(a.duration_minutes??a.durationMinutes??60);return[start,new Date(start.getTime()+mins*60000)];}
  async function localAvailability(payload){
    const starts=new Date(payload.startsAt),end=new Date(starts.getTime()+Number(payload.durationMinutes||60)*60000),professionalId=payload.professionalId||null,excludeId=payload.excludeId||null;
    let items=[];try{items=(await cachedApi('list_all')).appointments||[];}catch{try{items=(await cachedApi('list_mine')).appointments||[];}catch{}}
    let conflict=items.some(a=>{if(a.id===excludeId||a.status==='cancelled')return false;const pid=a.professional_id??a.professionalId??null;if(professionalId&&pid&&professionalId!==pid)return false;const[s,e]=toInterval(a);return s<end&&e>starts;});
    // O Google cacheado é um bloqueio conservador: evita confirmar localmente sobre um compromisso já conhecido.
    try{
      const cache=await storageGet(CACHE_KEY,{}),g=cache.google_events?.data?.items||[];
      if(!conflict)conflict=g.some(x=>{if(x.status==='cancelled')return false;const s=new Date(x.start?.dateTime||`${x.start?.date}T00:00:00`),e=new Date(x.end?.dateTime||`${x.end?.date}T00:00:00`);return s<end&&e>starts;});
    }catch{}
    return {ok:true,available:!conflict,provisional:true,offline:true,reason:conflict?'local_cache_conflict':'offline_provisional'};
  }

  async function backendFallback(action,payload){
    if(MUTATION_ACTIONS.has(action))return queueMutation(action,payload);
    if(action==='availability')return localAvailability(payload);
    if(READ_ACTIONS.has(action))return cachedApi(action,payload);
    if(action==='slots')return {ok:true,slots:[],offline:true,cached:true};
    throw new Error(`offline_action_unavailable:${action}`);
  }

  async function cachedProfile(){const cache=await storageGet(CACHE_KEY,{}),hit=cache.profile_get;if(!hit)throw new Error('offline_cache_miss:profile_get');return {...hit.data,offline:true,cachedAt:hit.cachedAt};}
  async function cachedLicense(){const cache=await storageGet(CACHE_KEY,{}),hit=cache.commerce_license;if(!hit?.data?.licensed)throw new Error('offline_license_unavailable');const ageHours=(Date.now()-new Date(hit.cachedAt).getTime())/3600000;if(ageHours>DEFAULT_LICENSE_GRACE_HOURS)throw new Error('offline_license_grace_expired');return {...hit.data,offline:true,offline_grace:true,cachedAt:hit.cachedAt};}
  async function cachedGoogleEvents(){const cache=await storageGet(CACHE_KEY,{}),hit=cache.google_events;if(!hit)throw new Error('offline_cache_miss:google_events');return {...hit.data,offline:true,cachedAt:hit.cachedAt};}

  async function captureResponse(url,init,clone){
    if(!clone.ok)return;let data;try{data=await clone.json();}catch{return;}const payload=bodyOf(init);
    if(url===BGD_CONFIG.BACKEND_URL&&payload.action)await cacheApi(String(payload.action),payload,data);
    else if(url===BGD_CONFIG.PROFILE_API_URL&&payload.action==='profile_get'){const cache=await storageGet(CACHE_KEY,{});cache.profile_get={data,cachedAt:nowIso()};await storageSet(CACHE_KEY,cache);}
    else if(url.startsWith(String(BGD_CONFIG.COMMERCE_API_URL))&&/\/license(?:\?|$)/.test(url)){const cache=await storageGet(CACHE_KEY,{});cache.commerce_license={data,cachedAt:nowIso()};await storageSet(CACHE_KEY,cache);}
    else if(url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')&&(init?.method||'GET').toUpperCase()==='GET'){const cache=await storageGet(CACHE_KEY,{});cache.google_events={data,cachedAt:nowIso()};await storageSet(CACHE_KEY,cache);}
  }

  async function offlineResponse(url,init={}){
    const payload=bodyOf(init);
    if(url===BGD_CONFIG.BACKEND_URL&&payload.action)return response(await backendFallback(String(payload.action),payload));
    if(url===BGD_CONFIG.PROFILE_API_URL&&payload.action==='profile_get')return response(await cachedProfile());
    if(url.startsWith(String(BGD_CONFIG.COMMERCE_API_URL))&&/\/license(?:\?|$)/.test(url))return response(await cachedLicense());
    if(url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')&&(init?.method||'GET').toUpperCase()==='GET')return response(await cachedGoogleEvents());
    throw new TypeError('offline_network_unavailable');
  }

  window.fetch=async function bgdOfflineFetch(input,init={}){
    const url=requestUrl(input);if(!navigator.onLine)return offlineResponse(url,init);
    try{const r=await nativeFetch(input,init);captureResponse(url,init,r.clone()).catch(()=>{});return r;}
    catch(err){try{return await offlineResponse(url,init);}catch{throw err;}}
  };

  async function token(){try{const r=await browser.runtime.sendMessage({type:'BGD_GOOGLE_TOKEN'});return r?.accessToken||null;}catch{return null;}}
  async function remoteList(accessToken,action){try{const r=await nativeFetch(BGD_CONFIG.BACKEND_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-google-access-token':accessToken},body:JSON.stringify({action})});if(!r.ok)return[];const d=await r.json();return d.appointments||[];}catch{return[];}}
  async function remoteHasAppointment(id,accessToken){if(!id)return false;let rows=await remoteList(accessToken,'list_mine');if(rows.some(a=>a.id===id))return true;rows=await remoteList(accessToken,'list_all');return rows.some(a=>a.id===id);}

  async function syncOne(item,accessToken){
    const r=await nativeFetch(BGD_CONFIG.BACKEND_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-google-access-token':accessToken,'x-bgd-idempotency-key':item.fingerprint},body:JSON.stringify({action:item.action,...item.payload,idempotencyKey:item.fingerprint})});
    const data=await r.json().catch(()=>({}));
    if(r.ok&&data.ok!==false)return{ok:true,data};
    if(item.action==='create'&&await remoteHasAppointment(item.appointmentId,accessToken))return{ok:true,data:{ok:true,duplicateRecovered:true}};
    const error=data.error||`http_${r.status}`;
    if(['slot_unavailable','conflict'].includes(error)||[400,409,422].includes(r.status))return{ok:false,terminal:true,error,data};
    return{ok:false,terminal:false,error,data};
  }

  async function notifyConflict(item,error){try{await browser.notifications.create(`bgd-offline-conflict:${item.queueId}`,{type:'basic',title:'BrasilGuard Agenda — conflito de sincronização',message:`O agendamento offline não pôde ser confirmado (${error}). Abra a agenda e escolha outro horário.`});}catch{}}
  async function afterRemoteSync(item,data){
    const appointment=data?.appointment||item.payload?.appointment||{id:item.appointmentId};
    try{if(item.action==='create')await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_CREATED',appointment});else if(item.action==='update')await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_UPDATED',appointment});else if(item.action==='cancel')await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_DELETED',appointment:{id:item.appointmentId}});}catch{}
    document.dispatchEvent(new CustomEvent('bgd:appointment-changed',{detail:{source:'offline-sync',action:item.action,id:item.appointmentId}}));
  }

  async function flushQueue(){
    if(flushing||!navigator.onLine)return;flushing=true;
    try{
      const accessToken=await token();if(!accessToken)return;
      const queue=await storageGet(QUEUE_KEY,[]),conflicts=await storageGet(CONFLICT_KEY,[]),remaining=[];
      let brokeAt=-1;
      for(let i=0;i<queue.length;i++){
        const item=queue[i];if(item.status!=='pending')continue;
        try{
          const result=await syncOne(item,accessToken);
          if(result.ok){await evidence('offline.synced',{queueId:item.queueId,action:item.action,appointmentId:item.appointmentId,fingerprint:item.fingerprint});await afterRemoteSync(item,result.data);continue;}
          if(result.terminal){conflicts.push({...item,status:'conflict',resolvedAt:null,conflictAt:nowIso(),lastError:result.error});await markLocalConflict(item.appointmentId,result.error);await evidence('offline.conflict',{queueId:item.queueId,action:item.action,appointmentId:item.appointmentId,error:result.error});await notifyConflict(item,result.error);continue;}
          remaining.push({...item,attempts:Number(item.attempts||0)+1,lastError:result.error,lastAttemptAt:nowIso()});brokeAt=i;break;
        }catch(e){remaining.push({...item,attempts:Number(item.attempts||0)+1,lastError:String(e?.message||e),lastAttemptAt:nowIso()});brokeAt=i;break;}
      }
      if(brokeAt>=0)for(let i=brokeAt+1;i<queue.length;i++)if(queue[i].status==='pending')remaining.push(queue[i]);
      await storageSet(QUEUE_KEY,remaining);await storageSet(CONFLICT_KEY,conflicts.slice(-200));updateBanner();
    }finally{flushing=false;}
  }

  function bannerElement(){let el=document.getElementById('offlineBanner');if(el)return el;el=document.createElement('section');el.id='offlineBanner';el.className='notice warning offline-banner';const anchor=document.querySelector('.integration-card');if(anchor)anchor.insertAdjacentElement('afterend',el);else document.querySelector('main')?.prepend(el);return el;}
  async function updateBanner(){const el=bannerElement(),queue=await storageGet(QUEUE_KEY,[]),conflicts=await storageGet(CONFLICT_KEY,[]),pending=queue.filter(x=>x.status==='pending').length,unresolved=conflicts.filter(x=>!x.resolvedAt).length;if(!navigator.onLine){el.hidden=false;el.textContent=`Modo offline — ${pending} operação(ões) pendente(s). Novos agendamentos são provisórios até sincronizar.`;return;}if(unresolved){el.hidden=false;el.textContent=`Conectado — ${unresolved} conflito(s) offline precisam de revisão.`;return;}if(pending){el.hidden=false;el.textContent=`Conectado — sincronizando ${pending} operação(ões) pendente(s)...`;return;}el.hidden=true;}
  function observeProvisionalUi(){const target=document.getElementById('availabilityInline');if(target)new MutationObserver(()=>{if(!navigator.onLine&&!/PROVISÓRIA/.test(target.textContent||''))target.textContent='Disponibilidade local PROVISÓRIA — o servidor confirmará quando a conexão voltar.';}).observe(target,{childList:true,subtree:true,characterData:true});}

  window.addEventListener('online',()=>{updateBanner();flushQueue();});
  window.addEventListener('offline',updateBanner);
  document.addEventListener('DOMContentLoaded',()=>{updateBanner();observeProvisionalUi();setTimeout(flushQueue,900);setInterval(flushQueue,60000);},{once:true});
  window.BGDOffline={flushQueue,updateBanner,getQueue:()=>storageGet(QUEUE_KEY,[]),getConflicts:()=>storageGet(CONFLICT_KEY,[]),getEvidence:()=>storageGet(EVIDENCE_KEY,[])};
})();
