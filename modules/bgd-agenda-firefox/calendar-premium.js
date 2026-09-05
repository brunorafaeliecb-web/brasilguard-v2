// BrasilGuard Agenda v0003.a build03 — calendário premium integrado.
// Combina visualmente eventos do Google Calendar e agendamentos BrasilGuard.
// Segurança: títulos são renderizados via textContent; eventos espelhados no Google são deduplicados.
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { view: 'week', anchor: new Date(), bgd: [], google: [], professionals: [], googleMappings: {} };

  async function googleToken() {
    const r = await browser.runtime.sendMessage({ type: 'BGD_GOOGLE_TOKEN' });
    return r?.accessToken || null;
  }

  async function bgdApi(action, payload = {}) {
    const token = await googleToken();
    if (!token) throw new Error('google_login_required');
    const r = await fetch(BGD_CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY, 'x-google-access-token': token },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || `http_${r.status}`);
    return data;
  }

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; return addDays(x, -day); }
  function range() {
    if (state.view === 'day') return [startOfDay(state.anchor), addDays(startOfDay(state.anchor), 1)];
    if (state.view === 'week') { const s = monday(state.anchor); return [s, addDays(s, 7)]; }
    const first = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1); const s = monday(first); return [s, addDays(s, 42)];
  }
  function fmtDate(d, opts) { return new Intl.DateTimeFormat('pt-BR', opts).format(d); }
  function eventStart(e) { return new Date(e.start); }
  function eventEnd(e) { return new Date(e.end); }
  function overlap(ev, s, e) { return eventStart(ev) < e && eventEnd(ev) > s; }
  function cleanText(v) { return String(v ?? '').trim(); }

  async function loadMappings() {
    const { googleCalendarEvents = {} } = await browser.storage.local.get('googleCalendarEvents');
    state.googleMappings = googleCalendarEvents || {};
  }

  function mappedGoogleEventIds() {
    return new Set(Object.values(state.googleMappings || {}).map(x => x?.eventId).filter(Boolean));
  }

  async function loadGoogle(s, e) {
    const token = await googleToken();
    if (!token) throw new Error('google_login_required');
    const u = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    u.searchParams.set('timeMin', s.toISOString());
    u.searchParams.set('timeMax', e.toISOString());
    u.searchParams.set('singleEvents', 'true');
    u.searchParams.set('orderBy', 'startTime');
    u.searchParams.set('maxResults', '500');
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`google_calendar_${r.status}`);
    const data = await r.json();
    const mirrored = mappedGoogleEventIds();
    state.google = (data.items || [])
      .filter(x => x.status !== 'cancelled')
      .map(x => ({
        id: `g:${x.id}`,
        googleEventId: x.id,
        mirroredFromBgd: mirrored.has(x.id),
        source: 'google',
        title: cleanText(x.summary) || 'Evento Google',
        start: x.start?.dateTime || `${x.start?.date}T00:00:00`,
        end: x.end?.dateTime || `${x.end?.date}T00:00:00`,
        htmlLink: x.htmlLink || '',
        allDay: Boolean(x.start?.date),
      }));
  }

  async function loadBgd() {
    const who = await bgdApi('whoami');
    const internal = ['operator', 'manager', 'admin'].includes(who.user?.role);
    const [ar, pr] = await Promise.all([bgdApi(internal ? 'list_all' : 'list_mine'), bgdApi('professionals')]);
    state.professionals = pr.professionals || [];
    const sel = $('calendarProfessional');
    if (sel) {
      const old = sel.value;
      sel.innerHTML = '';
      const all = document.createElement('option'); all.value = ''; all.textContent = 'Todos'; sel.appendChild(all);
      for (const p of state.professionals) {
        const o = document.createElement('option'); o.value = p.id; o.textContent = cleanText(p.name) || 'Profissional'; sel.appendChild(o);
      }
      sel.value = old;
    }
    state.bgd = (ar.appointments || []).filter(a => a.status !== 'cancelled').map(a => ({
      id: `b:${a.id}`,
      source: 'bgd',
      title: `${cleanText(a.client_name) || 'Cliente'} — ${cleanText(a.service_name) || 'Serviço'}`,
      start: a.starts_at,
      end: new Date(new Date(a.starts_at).getTime() + Number(a.duration_minutes || 60) * 60000).toISOString(),
      professionalId: a.professional_id || '',
      status: a.status || 'scheduled',
      appointment: a,
    }));
  }

  function visibleEvents() {
    const src = $('calendarSource')?.value || 'all';
    const pid = $('calendarProfessional')?.value || '';
    let ev = [];
    if (src !== 'google') ev.push(...state.bgd.filter(x => !pid || x.professionalId === pid));
    if (src !== 'bgd') {
      const google = src === 'all' ? state.google.filter(x => !x.mirroredFromBgd) : state.google;
      ev.push(...google);
    }
    return ev.sort((a, b) => eventStart(a) - eventStart(b));
  }

  function setLabel() {
    const [s, e] = range(); const el = $('calendarPeriodLabel'); if (!el) return;
    if (state.view === 'day') el.textContent = fmtDate(s, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    else if (state.view === 'week') el.textContent = `${fmtDate(s, { day: '2-digit', month: 'short' })} – ${fmtDate(addDays(e, -1), { day: '2-digit', month: 'short', year: 'numeric' })}`;
    else el.textContent = fmtDate(state.anchor, { month: 'long', year: 'numeric' });
  }

  function eventCard(ev) {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = `cal-event ${ev.source}`;
    const showGoogle = $('calendarPrivateTitles')?.checked !== false;
    const title = ev.source === 'google' && !showGoogle ? 'OCUPADO — Google' : ev.title;

    const strong = document.createElement('strong'); strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = ev.allDay ? 'Dia inteiro' : `${fmtDate(eventStart(ev), { hour: '2-digit', minute: '2-digit' })}–${fmtDate(eventEnd(ev), { hour: '2-digit', minute: '2-digit' })}`;
    const small = document.createElement('small'); small.textContent = ev.source === 'google' ? 'Google Calendar' : 'BrasilGuard';
    div.append(strong, span, small);

    div.addEventListener('click', () => {
      if (ev.source === 'google' && ev.htmlLink) {
        browser.tabs.create({ url: ev.htmlLink });
        return;
      }
      if (ev.appointment) {
        const f = $('startsAt');
        if (f) {
          const d = eventStart(ev);
          f.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        $('appointment-form')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
    return div;
  }

  function renderDay() {
    const host = $('calendarCanvas'); if (!host) return; host.innerHTML = '';
    const day = startOfDay(state.anchor); const grid = document.createElement('div'); grid.className = 'cal-day';
    for (let h = 0; h < 24; h++) {
      const row = document.createElement('div'); row.className = 'cal-hour-row';
      const hs = new Date(day); hs.setHours(h, 0, 0, 0); const he = new Date(hs.getTime() + 3600000);
      const label = document.createElement('div'); label.className = 'cal-hour-label'; label.textContent = `${String(h).padStart(2, '0')}:00`;
      const bucket = document.createElement('div'); bucket.className = 'cal-hour-events';
      visibleEvents().filter(ev => overlap(ev, hs, he)).forEach(ev => bucket.appendChild(eventCard(ev)));
      row.append(label, bucket); grid.appendChild(row);
    }
    host.appendChild(grid);
  }

  function renderWeek() {
    const host = $('calendarCanvas'); if (!host) return; host.innerHTML = '';
    const s = monday(state.anchor); const grid = document.createElement('div'); grid.className = 'cal-week';
    for (let i = 0; i < 7; i++) {
      const d = addDays(s, i), col = document.createElement('section'); col.className = 'cal-day-col';
      const header = document.createElement('header');
      const strong = document.createElement('strong'); strong.textContent = fmtDate(d, { weekday: 'short' });
      const span = document.createElement('span'); span.textContent = fmtDate(d, { day: '2-digit', month: '2-digit' });
      header.append(strong, span);
      const bucket = document.createElement('div'); bucket.className = 'cal-day-events'; const end = addDays(d, 1);
      visibleEvents().filter(ev => overlap(ev, d, end)).forEach(ev => bucket.appendChild(eventCard(ev)));
      bucket.addEventListener('dblclick', () => prefillSlot(d));
      col.append(header, bucket); grid.appendChild(col);
    }
    host.appendChild(grid);
  }

  function renderMonth() {
    const host = $('calendarCanvas'); if (!host) return; host.innerHTML = '';
    const [s] = range(); const grid = document.createElement('div'); grid.className = 'cal-month';
    for (let i = 0; i < 42; i++) {
      const d = addDays(s, i), cell = document.createElement('section'); cell.className = 'cal-month-cell';
      if (d.getMonth() !== state.anchor.getMonth()) cell.classList.add('outside');
      const header = document.createElement('header'); header.textContent = String(d.getDate());
      const bucket = document.createElement('div'); bucket.className = 'cal-month-events'; const end = addDays(d, 1);
      const events = visibleEvents().filter(ev => overlap(ev, d, end));
      events.slice(0, 4).forEach(ev => bucket.appendChild(eventCard(ev)));
      if (events.length > 4) { const sm = document.createElement('small'); sm.textContent = `+${events.length - 4} eventos`; bucket.appendChild(sm); }
      cell.addEventListener('dblclick', () => prefillSlot(d));
      cell.append(header, bucket); grid.appendChild(cell);
    }
    host.appendChild(grid);
  }

  function prefillSlot(d) {
    const f = $('startsAt'); if (!f) return;
    const x = new Date(d); x.setHours(9, 0, 0, 0);
    f.value = new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('appointment-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  function render() { setLabel(); if (state.view === 'day') renderDay(); else if (state.view === 'week') renderWeek(); else renderMonth(); }

  async function refresh() {
    const status = $('calendarStatus'), sync = $('calendarSyncState');
    if (status) status.textContent = 'Sincronizando agenda...';
    try {
      const [s, e] = range();
      await loadMappings();
      await Promise.all([loadBgd(), loadGoogle(s, e)]);
      if (sync) sync.textContent = 'Google: conectado ✓';
      if (status) {
        const mirrored = state.google.filter(x => x.mirroredFromBgd).length;
        status.textContent = `${state.bgd.length} BrasilGuard · ${state.google.length} Google${mirrored ? ` · ${mirrored} sincronizado(s) sem duplicar` : ''}`;
      }
      render();
    } catch (err) {
      if (sync) sync.textContent = 'Google: falha';
      if (status) status.textContent = `Falha ao carregar agenda: ${err.message}`;
    }
  }

  function wire() {
    $('openGoogleCalendar')?.addEventListener('click', () => browser.tabs.create({ url: 'https://calendar.google.com/calendar/u/0/r' }));
    $('calendarRefresh')?.addEventListener('click', refresh);
    $('calendarSource')?.addEventListener('change', render);
    $('calendarProfessional')?.addEventListener('change', render);
    $('calendarPrivateTitles')?.addEventListener('change', render);
    $('calendarToday')?.addEventListener('click', () => { state.anchor = new Date(); refresh(); });
    $('calendarPrev')?.addEventListener('click', () => { state.anchor = state.view === 'day' ? addDays(state.anchor, -1) : state.view === 'week' ? addDays(state.anchor, -7) : new Date(state.anchor.getFullYear(), state.anchor.getMonth() - 1, 1); refresh(); });
    $('calendarNext')?.addEventListener('click', () => { state.anchor = state.view === 'day' ? addDays(state.anchor, 1) : state.view === 'week' ? addDays(state.anchor, 7) : new Date(state.anchor.getFullYear(), state.anchor.getMonth() + 1, 1); refresh(); });
    document.querySelectorAll('[data-calendar-view]').forEach(b => b.addEventListener('click', () => {
      state.view = b.dataset.calendarView;
      document.querySelectorAll('[data-calendar-view]').forEach(x => { x.classList.toggle('active', x === b); x.classList.toggle('secondary', x !== b); });
      refresh();
    }));

    // popup.js salva no backend e depois altera o texto de status. Atualizamos o calendário sem acoplamento direto.
    const statusNode = $('status');
    if (statusNode) {
      const observer = new MutationObserver(() => {
        const text = statusNode.textContent || '';
        if (/confirmado|atualizado|cancelado/i.test(text)) setTimeout(refresh, 250);
      });
      observer.observe(statusNode, { childList: true, subtree: true, characterData: true });
    }
  }

  async function init() {
    wire();
    const status = await browser.runtime.sendMessage({ type: 'BGD_GOOGLE_STATUS' });
    if (!status?.connected) return;
    setTimeout(refresh, 450);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
