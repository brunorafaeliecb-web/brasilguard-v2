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
  let lastQueuedAt = 0;

  const storageGet = async (key, fallback) => (await browser.storage.local.get(key))[key] ?? fallback;
  const storageSet = async (key, value) => browser.storage.local.set({[key]: value});
  const nowIso = () => new Date().toISOString();

  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
  }

  async function evidence(type, data = {}) {
    const rows = await storageGet(EVIDENCE_KEY, []);
    const canonical = JSON.stringify(data);
    rows.push({at: nowIso(), type, hash: await sha256(canonical), data});
    if (rows.length > MAX_EVIDENCE) rows.splice(0, rows.length - MAX_EVIDENCE);
    await storageSet(EVIDENCE_KEY, rows);
  }

  function response(body, status = 200) {
    return new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
  }

  function bodyOf(init = {}) {
    try { return typeof init.body === 'string' ? JSON.parse(init.body) : {}; }
    catch { return {}; }
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input?.url || String(input || '');
  }

  function cacheSubKey(action, payload = {}) {
    if (action === 'professional_services') return `${action}:${payload.professionalId || payload.professional_id || ''}`;
    return action;
  }

  async function cacheApi(action, payload, data) {
    if (!READ_ACTIONS.has(action)) return;
    const cache = await storageGet(CACHE_KEY, {});
    cache[cacheSubKey(action,payload)] = {data, cachedAt: nowIso()};
    await storageSet(CACHE_KEY, cache);
  }

  async function cachedApi(action, payload = {}) {
    const cache = await storageGet(CACHE_KEY, {});
    const hit = cache[cacheSubKey(action,payload)];
    if (!hit) throw new Error(`offline_cache_miss:${action}`);
    return {...hit.data, offline:true, cachedAt:hit.cachedAt};
  }

  function appointmentIdFrom(item) {
    return item?.id || item?.appointment?.id || null;
  }

  function localAppointmentShape(a = {}) {
    return {
      ...a,
      id:a.id,
      client_name:a.client_name ?? a.clientName,
      client_phone:a.client_phone ?? a.clientPhone,
      client_email:a.client_email ?? a.clientEmail,
      professional_id:a.professional_id ?? a.professionalId,
      service_id:a.service_id ?? a.serviceId,
      service_name:a.service_name ?? a.serviceName,
      starts_at:a.starts_at ?? a.startsAt,
      duration_minutes:Number(a.duration_minutes ?? a.durationMinutes ?? 60),
      status:a.status || 'provisional_offline',
      _offline_status:'pending'
    };
  }

  async function applyLocalMutation(action, payload) {
    const cache = await storageGet(CACHE_KEY, {});
    const id = payload?.id || payload?.appointment?.id;
    for (const key of ['list_mine','list_all']) {
      const hit = cache[key];
      if (!hit?.data?.appointments) continue;
      let items = [...hit.data.appointments];
      if (action === 'create') {
        const a = localAppointmentShape(payload.appointment || {});
        items = items.filter(x => x.id !== a.id);
        items.push(a);
      } else if (action === 'update') {
        const a = localAppointmentShape(payload.appointment || {});
        items = items.map(x => x.id === id ? {...x,...a,_offline_status:'pending'} : x);
      } else if (action === 'cancel') {
        items = items.map(x => x.id === id ? {...x,status:'cancelled',_offline_status:'pending'} : x);
      }
      hit.data.appointments = items;
      hit.cachedAt = nowIso();
    }
    await storageSet(CACHE_KEY, cache);
  }

  async function queueMutation(action, payload) {
    const queue = await storageGet(QUEUE_KEY, []);
    const appointmentId = payload?.id || payload?.appointment?.id || crypto.randomUUID();
    const fingerprint = await sha256(JSON.stringify({action, appointmentId, payload}));
    const existing = queue.find(x => x.fingerprint === fingerprint && x.status === 'pending');
    if (!existing) {
      queue.push({
        queueId:crypto.randomUUID(), action, payload, appointmentId,
        fingerprint, status:'pending', attempts:0, createdAt:nowIso(), lastError:null
      });
      await storageSet(QUEUE_KEY, queue);
      await evidence('offline.queued', {action,appointmentId,fingerprint});
      await applyLocalMutation(action,payload);
    }
    lastQueuedAt = Date.now();
    updateBanner();
    setTimeout(() => {
      const s = document.getElementById('status');
      if (s) s.textContent = 'Salvo offline como PROVISÓRIO. Será confirmado automaticamente quando a conexão voltar.';
    }, 80);
    const a = payload?.appointment ? localAppointmentShape(payload.appointment) : null;
    return {ok:true, offline:true, provisional:true, appointment:a};
  }

  function toInterval(a) {
    const start = new Date(a.starts_at ?? a.startsAt);
    const mins = Number(a.duration_minutes ?? a.durationMinutes ?? 60);
    return [start, new Date(start.getTime() + mins*60000)];
  }

  async function localAvailability(payload) {
    const starts = new Date(payload.startsAt);
    const end = new Date(starts.getTime() + Number(payload.durationMinutes || 60)*60000);
    const professionalId = payload.professionalId || null;
    const excludeId = payload.excludeId || null;
    let items = [];
    try {
      const mine = await cachedApi('list_all'); items = mine.appointments || [];
    } catch {
      try { const mine = await cachedApi('list_mine'); items = mine.appointments || []; } catch {}
    }
    const conflict = items.some(a => {
      if (a.id === excludeId || a.status === 'cancelled') return false;
      const pid = a.professional_id ?? a.professionalId ?? null;
      if (professionalId && pid && professionalId !== pid) return false;
      const [s,e] = toInterval(a);
      return s < end && e > starts;
    });
    return {ok:true, available:!conflict, provisional:true, offline:true, reason:conflict?'local_cache_conflict':'offline_provisional'};
  }

  async function backendFallback(action, payload) {
    if (MUTATION_ACTIONS.has(action)) return queueMutation(action,payload);
    if (action === 'availability') return localAvailability(payload);
    if (READ_ACTIONS.has(action)) return cachedApi(action,payload);
    if (action === 'slots') return {ok:true,slots:[],offline:true,cached:true};
    throw new Error(`offline_action_unavailable:${action}`);
  }

  async function cachedProfile() {
    const cache = await storageGet(CACHE_KEY, {});
    const hit = cache.profile_get;
    if (!hit) throw new Error('offline_cache_miss:profile_get');
    return {...hit.data,offline:true,cachedAt:hit.cachedAt};
  }

  async function cachedLicense() {
    const cache = await storageGet(CACHE_KEY, {});
    const hit = cache.commerce_license;
    if (!hit?.data?.licensed) throw new Error('offline_license_unavailable');
    const ageHours = (Date.now() - new Date(hit.cachedAt).getTime()) / 3600000;
    if (ageHours > DEFAULT_LICENSE_GRACE_HOURS) throw new Error('offline_license_grace_expired');
    return {...hit.data,offline:true,offline_grace:true,cachedAt:hit.cachedAt};
  }

  async function cachedGoogleEvents() {
    const cache = await storageGet(CACHE_KEY, {});
    const hit = cache.google_events;
    if (!hit) throw new Error('offline_cache_miss:google_events');
    return {...hit.data,offline:true,cachedAt:hit.cachedAt};
  }

  async function captureResponse(url, init, clone) {
    if (!clone.ok) return;
    let data; try { data = await clone.json(); } catch { return; }
    const payload = bodyOf(init);
    if (url === BGD_CONFIG.BACKEND_URL && payload.action) {
      await cacheApi(String(payload.action), payload, data);
    } else if (url === BGD_CONFIG.PROFILE_API_URL && payload.action === 'profile_get') {
      const cache = await storageGet(CACHE_KEY, {}); cache.profile_get={data,cachedAt:nowIso()}; await storageSet(CACHE_KEY,cache);
    } else if (url.startsWith(String(BGD_CONFIG.COMMERCE_API_URL)) && /\/license(?:\?|$)/.test(url)) {
      const cache = await storageGet(CACHE_KEY, {}); cache.commerce_license={data,cachedAt:nowIso()}; await storageSet(CACHE_KEY,cache);
    } else if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events') && (init?.method || 'GET').toUpperCase() === 'GET') {
      const cache = await storageGet(CACHE_KEY, {}); cache.google_events={data,cachedAt:nowIso()}; await storageSet(CACHE_KEY,cache);
    }
  }

  async function offlineResponse(url, init = {}) {
    const payload = bodyOf(init);
    if (url === BGD_CONFIG.BACKEND_URL && payload.action) return response(await backendFallback(String(payload.action),payload));
    if (url === BGD_CONFIG.PROFILE_API_URL && payload.action === 'profile_get') return response(await cachedProfile());
    if (url.startsWith(String(BGD_CONFIG.COMMERCE_API_URL)) && /\/license(?:\?|$)/.test(url)) return response(await cachedLicense());
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events') && (init?.method || 'GET').toUpperCase() === 'GET') return response(await cachedGoogleEvents());
    throw new TypeError('offline_network_unavailable');
  }

  window.fetch = async function bgdOfflineFetch(input, init = {}) {
    const url = requestUrl(input);
    if (!navigator.onLine) return offlineResponse(url,init);
    try {
      const r = await nativeFetch(input,init);
      captureResponse(url,init,r.clone()).catch(()=>{});
      return r;
    } catch (err) {
      try { return await offlineResponse(url,init); }
      catch { throw err; }
    }
  };

  async function token() {
    try { const r = await browser.runtime.sendMessage({type:'BGD_GOOGLE_TOKEN'}); return r?.accessToken || null; }
    catch { return null; }
  }

  async function remoteHasAppointment(id, accessToken) {
    if (!id) return false;
    try {
      const r = await nativeFetch(BGD_CONFIG.BACKEND_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-google-access-token':accessToken},body:JSON.stringify({action:'list_mine'})});
      if (!r.ok) return false;
      const d = await r.json();
      return (d.appointments || []).some(a => a.id === id);
    } catch { return false; }
  }

  async function syncOne(item, accessToken) {
    const r = await nativeFetch(BGD_CONFIG.BACKEND_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-google-access-token':accessToken,'x-bgd-idempotency-key':item.fingerprint},body:JSON.stringify({action:item.action,...item.payload,idempotencyKey:item.fingerprint})});
    const data = await r.json().catch(()=>({}));
    if (r.ok && data.ok !== false) return {ok:true,data};
    if (item.action === 'create' && await remoteHasAppointment(item.appointmentId,accessToken)) return {ok:true,data:{ok:true,duplicateRecovered:true}};
    const error = data.error || `http_${r.status}`;
    if (['slot_unavailable','conflict'].includes(error) || [400,409,422].includes(r.status)) return {ok:false,terminal:true,error,data};
    return {ok:false,terminal:false,error,data};
  }

  async function notifyConflict(item, error) {
    try {
      await browser.notifications.create(`bgd-offline-conflict:${item.queueId}`,{type:'basic',title:'BrasilGuard Agenda — conflito de sincronização',message:`O agendamento offline não pôde ser confirmado (${error}). Abra a agenda e escolha outro horário.`});
    } catch {}
  }

  async function afterRemoteSync(item, data) {
    const appointment = data?.appointment || item.payload?.appointment || {id:item.appointmentId};
    try {
      if (item.action === 'create') await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_CREATED',appointment});
      else if (item.action === 'update') await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_UPDATED',appointment});
      else if (item.action === 'cancel') await browser.runtime.sendMessage({type:'BGD_APPOINTMENT_DELETED',appointment:{id:item.appointmentId}});
    } catch {}
    document.dispatchEvent(new CustomEvent('bgd:appointment-changed',{detail:{source:'offline-sync',action:item.action,id:item.appointmentId}}));
  }

  async function flushQueue() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      const accessToken = await token();
      if (!accessToken) return;
      let queue = await storageGet(QUEUE_KEY, []);
      const conflicts = await storageGet(CONFLICT_KEY, []);
      const remaining = [];
      for (const item of queue) {
        if (item.status !== 'pending') continue;
        try {
          const result = await syncOne(item,accessToken);
          if (result.ok) {
            await evidence('offline.synced',{queueId:item.queueId,action:item.action,appointmentId:item.appointmentId,fingerprint:item.fingerprint});
            await afterRemoteSync(item,result.data);
            continue;
          }
          if (result.terminal) {
            conflicts.push({...item,status:'conflict',resolvedAt:null,conflictAt:nowIso(),lastError:result.error});
            await evidence('offline.conflict',{queueId:item.queueId,action:item.action,appointmentId:item.appointmentId,error:result.error});
            await notifyConflict(item,result.error);
            continue;
          }
          remaining.push({...item,attempts:Number(item.attempts||0)+1,lastError:result.error,lastAttemptAt:nowIso()});
          break;
        } catch (e) {
          remaining.push({...item,attempts:Number(item.attempts||0)+1,lastError:String(e?.message||e),lastAttemptAt:nowIso()});
          break;
        }
      }
      // Preserva itens ainda não percorridos após uma falha transitória.
      const processedIds = new Set([...remaining,...conflicts].map(x=>x.queueId));
      for (const item of queue) if (!processedIds.has(item.queueId) && item.status==='pending') {
        // item foi sincronizado e não deve voltar; os itens posteriores a uma quebra já constam em remaining apenas se percorridos.
      }
      // Reconstrói pendências que não foram processadas depois do primeiro erro.
      if (remaining.length) {
        const firstPendingIndex = queue.findIndex(x=>x.queueId===remaining[remaining.length-1].queueId);
        for (let i=firstPendingIndex+1;i<queue.length;i++) if(queue[i].status==='pending') remaining.push(queue[i]);
      }
      await storageSet(QUEUE_KEY,remaining);
      await storageSet(CONFLICT_KEY,conflicts.slice(-200));
      updateBanner();
    } finally { flushing=false; }
  }

  function bannerElement() {
    let el = document.getElementById('offlineBanner');
    if (el) return el;
    el = document.createElement('section');
    el.id='offlineBanner';
    el.className='notice warning offline-banner';
    const anchor=document.querySelector('.integration-card');
    if(anchor) anchor.insertAdjacentElement('afterend',el); else document.querySelector('main')?.prepend(el);
    return el;
  }

  async function updateBanner() {
    const el=bannerElement();
    const queue=await storageGet(QUEUE_KEY,[]);
    const conflicts=await storageGet(CONFLICT_KEY,[]);
    const pending=queue.filter(x=>x.status==='pending').length;
    const unresolved=conflicts.filter(x=>!x.resolvedAt).length;
    if(!navigator.onLine){el.hidden=false;el.textContent=`Modo offline — ${pending} operação(ões) pendente(s). Novos agendamentos são provisórios até sincronizar.`;return;}
    if(unresolved){el.hidden=false;el.textContent=`Conectado — ${unresolved} conflito(s) offline precisam de revisão.`;return;}
    if(pending){el.hidden=false;el.textContent=`Conectado — sincronizando ${pending} operação(ões) pendente(s)...`;return;}
    el.hidden=true;
  }

  function observeProvisionalUi(){
    const target=document.getElementById('availabilityInline');
    if(target){new MutationObserver(()=>{if(!navigator.onLine && !/PROVISÓRIA/.test(target.textContent||'')) target.textContent='Disponibilidade local PROVISÓRIA — o servidor confirmará quando a conexão voltar.';}).observe(target,{childList:true,subtree:true,characterData:true});}
  }

  window.addEventListener('online',()=>{updateBanner();flushQueue();});
  window.addEventListener('offline',updateBanner);
  document.addEventListener('DOMContentLoaded',()=>{updateBanner();observeProvisionalUi();setTimeout(flushQueue,900);setInterval(flushQueue,60000);},{once:true});

  window.BGDOffline={flushQueue,updateBanner,getQueue:()=>storageGet(QUEUE_KEY,[]),getConflicts:()=>storageGet(CONFLICT_KEY,[]),getEvidence:()=>storageGet(EVIDENCE_KEY,[])};
})();
