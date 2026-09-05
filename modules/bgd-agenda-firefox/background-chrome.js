// BrasilGuard Agenda v0004.c — Chrome/Edge Manifest V3 service worker nativo.
// Não carrega o background legado do Firefox e não usa client_secret.
// OAuth é delegado ao chrome.identity; backend BrasilGuard permanece a fonte de verdade.

'use strict';

const HEARTBEAT_ALARM = 'bgd:heartbeat';
const HEARTBEAT_PERIOD_MINUTES = 1;
const REMINDER_GRACE_MS = 5 * 60 * 1000;
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_SYNC_QUEUE_KEY = 'bgdGoogleSyncQueueV1';
const GOOGLE_SYNC_EVIDENCE_KEY = 'bgdGoogleSyncEvidenceV1';
let flushingGoogleQueue = false;

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'BGD_GOOGLE_CONNECT': return connectGoogle();
      case 'BGD_GOOGLE_STATUS': return getGoogleStatus();
      case 'BGD_GOOGLE_TOKEN': return { accessToken: await validGoogleAccessToken() };
      case 'BGD_APPOINTMENT_CREATED': return handleCreated(message.appointment);
      case 'BGD_APPOINTMENT_UPDATED': return handleUpdated(message.appointment);
      case 'BGD_APPOINTMENT_DELETED': return handleDeleted(message.appointment);
      default: return null;
    }
  })().then(sendResponse).catch((error) => {
    console.error('BGD Agenda MV3 message error', error);
    sendResponse({ ok: false, error: String(error?.message || error) });
  });
  return true;
});

async function chromeAccessToken(interactive = false) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    return typeof result === 'string' ? result : (result?.token || null);
  } catch (error) {
    if (!interactive) return null;
    throw error;
  }
}

async function chromeProfile(accessToken) {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

async function connectGoogle() {
  try {
    const accessToken = await chromeAccessToken(true);
    if (!accessToken) throw new Error('chrome_oauth_token_missing');
    const profile = await chromeProfile(accessToken);
    const googleOAuth = {
      access_token: accessToken,
      refresh_token: null,
      id_token: null,
      expires_at: Date.now() + 45 * 60 * 1000,
      token_type: 'Bearer',
      connected_at: new Date().toISOString(),
      provider: 'chrome.identity',
      profile: {
        sub: profile.sub || null,
        email: profile.email || null,
        name: profile.name || profile.email || null,
        picture: profile.picture || null
      }
    };
    await chrome.storage.local.set({ googleOAuth });
    return { ok: true, connected: true, profile: googleOAuth.profile };
  } catch (error) {
    console.error('BGD Agenda: falha OAuth Chrome.', error);
    return { ok: false, connected: false, error: String(error?.message || error) };
  }
}

async function getGoogleStatus() {
  const { googleOAuth = null } = await chrome.storage.local.get('googleOAuth');
  const token = await chromeAccessToken(false);
  return {
    connected: Boolean(token),
    profile: googleOAuth?.profile || null
  };
}

async function validGoogleAccessToken() {
  return chromeAccessToken(false);
}

async function appendGoogleEvidence(type, data = {}) {
  const stored = await chrome.storage.local.get(GOOGLE_SYNC_EVIDENCE_KEY);
  const rows = stored[GOOGLE_SYNC_EVIDENCE_KEY] || [];
  rows.push({ at: new Date().toISOString(), type, data });
  if (rows.length > 300) rows.splice(0, rows.length - 300);
  await chrome.storage.local.set({ [GOOGLE_SYNC_EVIDENCE_KEY]: rows });
}

async function enqueueGoogleSync(action, appointment, error) {
  const stored = await chrome.storage.local.get(GOOGLE_SYNC_QUEUE_KEY);
  const queue = stored[GOOGLE_SYNC_QUEUE_KEY] || [];
  const id = appointment?.id;
  if (!id) return { ok: false, error: 'appointment_id_missing' };
  const existingIndex = queue.findIndex((x) => x.appointmentId === id);
  const item = {
    queueId: crypto.randomUUID(),
    appointmentId: id,
    action,
    appointment,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: String(error || 'offline')
  };
  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    if (action === 'delete') queue[existingIndex] = item;
    else if (existing.action === 'create' && action === 'update') queue[existingIndex] = { ...item, action: 'create' };
    else if (existing.action !== 'delete') queue[existingIndex] = item;
  } else {
    queue.push(item);
  }
  await chrome.storage.local.set({ [GOOGLE_SYNC_QUEUE_KEY]: queue });
  await appendGoogleEvidence('google_sync.queued', { action, appointmentId: id, error: String(error || 'offline') });
  return { ok: true, queued: true };
}

function googleEventPayload(a) {
  const start = new Date(a.startsAt || a.starts_at);
  const duration = Number(a.durationMinutes || a.duration_minutes || 60);
  const end = new Date(start.getTime() + duration * 60000);
  const clientName = a.clientName || a.client_name || '';
  const clientPhone = a.clientPhone || a.client_phone || '';
  const clientEmail = a.clientEmail || a.client_email || '';
  const serviceName = a.serviceName || a.service_name || 'Agendamento';
  const minutes = Number(a.reminders?.minutesBefore || a.reminders?.minutes_before || 60);
  return {
    summary: serviceName,
    description: `Cliente: ${clientName}\nWhatsApp: ${clientPhone}${clientEmail ? `\nE-mail: ${clientEmail}` : ''}\nOrigem: BrasilGuard Agenda`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes }] },
    extendedProperties: { private: { bgdAppointmentId: String(a.id || '') } }
  };
}

async function createGoogleCalendarEvent(a) {
  const accessToken = await validGoogleAccessToken();
  if (!accessToken) return { ok: false, reason: 'google_not_connected' };
  const { googleCalendarEvents = {} } = await chrome.storage.local.get('googleCalendarEvents');
  if (googleCalendarEvents[a.id]) return { ok: true, duplicatePrevented: true };
  const response = await fetch(GOOGLE_CALENDAR_EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(googleEventPayload(a))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data?.error?.message || `google_calendar_http_${response.status}` };
  googleCalendarEvents[a.id] = { eventId: data.id, htmlLink: data.htmlLink || null, createdAt: new Date().toISOString() };
  await chrome.storage.local.set({ googleCalendarEvents });
  return { ok: true, eventId: data.id, htmlLink: data.htmlLink || null };
}

async function updateGoogleCalendarEvent(a) {
  const accessToken = await validGoogleAccessToken();
  if (!accessToken) return { ok: false, reason: 'google_not_connected' };
  const { googleCalendarEvents = {} } = await chrome.storage.local.get('googleCalendarEvents');
  const mapping = googleCalendarEvents[a.id];
  if (!mapping?.eventId) return createGoogleCalendarEvent(a);
  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(mapping.eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(googleEventPayload(a))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data?.error?.message || `google_calendar_http_${response.status}` };
  googleCalendarEvents[a.id] = { ...mapping, eventId: data.id || mapping.eventId, htmlLink: data.htmlLink || mapping.htmlLink || null, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ googleCalendarEvents });
  return { ok: true, eventId: googleCalendarEvents[a.id].eventId };
}

async function deleteGoogleCalendarEvent(id) {
  const { googleCalendarEvents = {} } = await chrome.storage.local.get('googleCalendarEvents');
  const mapping = googleCalendarEvents[id];
  if (!mapping?.eventId) return { ok: true, skipped: true };
  const accessToken = await validGoogleAccessToken();
  if (!accessToken) return { ok: false, reason: 'google_not_connected' };
  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(mapping.eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && ![404, 410].includes(response.status)) return { ok: false, error: `google_calendar_http_${response.status}` };
  delete googleCalendarEvents[id];
  await chrome.storage.local.set({ googleCalendarEvents });
  return { ok: true };
}

async function safeGoogleMutation(action, appointment) {
  if (appointment?.status === 'provisional_offline') return { ok: true, deferred: true, reason: 'backend_confirmation_pending' };
  try {
    let result;
    if (action === 'create') result = await createGoogleCalendarEvent(appointment);
    else if (action === 'update') result = await updateGoogleCalendarEvent(appointment);
    else result = await deleteGoogleCalendarEvent(appointment.id);
    if (result?.ok || result?.reason === 'google_not_connected') return result;
    return enqueueGoogleSync(action, appointment, result?.error || result?.reason || 'google_sync_failed');
  } catch (error) {
    return enqueueGoogleSync(action, appointment, error?.message || error);
  }
}

async function handleCreated(a) {
  await scheduleAppointmentAlarm(a);
  return { ok: true, google: await safeGoogleMutation('create', a) };
}

async function handleUpdated(a) {
  await chrome.alarms.clear(`bgd:${a.id}`);
  await scheduleAppointmentAlarm(a);
  return { ok: true, google: await safeGoogleMutation('update', a) };
}

async function handleDeleted(a) {
  await chrome.alarms.clear(`bgd:${a.id}`);
  return { ok: true, google: await safeGoogleMutation('delete', a) };
}

async function flushGoogleSyncQueue() {
  if (flushingGoogleQueue) return;
  flushingGoogleQueue = true;
  try {
    const accessToken = await validGoogleAccessToken();
    if (!accessToken) return;
    const stored = await chrome.storage.local.get(GOOGLE_SYNC_QUEUE_KEY);
    const queue = stored[GOOGLE_SYNC_QUEUE_KEY] || [];
    if (!queue.length) return;
    const remaining = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        let result;
        if (item.action === 'create') result = await createGoogleCalendarEvent(item.appointment);
        else if (item.action === 'update') result = await updateGoogleCalendarEvent(item.appointment);
        else result = await deleteGoogleCalendarEvent(item.appointmentId);
        if (result?.ok) {
          await appendGoogleEvidence('google_sync.synced', { action: item.action, appointmentId: item.appointmentId, queueId: item.queueId });
          continue;
        }
        remaining.push({ ...item, attempts: Number(item.attempts || 0) + 1, lastError: result?.error || result?.reason || 'google_sync_failed', lastAttemptAt: new Date().toISOString() });
        remaining.push(...queue.slice(i + 1));
        break;
      } catch (error) {
        remaining.push({ ...item, attempts: Number(item.attempts || 0) + 1, lastError: String(error?.message || error), lastAttemptAt: new Date().toISOString() });
        remaining.push(...queue.slice(i + 1));
        break;
      }
    }
    await chrome.storage.local.set({ [GOOGLE_SYNC_QUEUE_KEY]: remaining });
  } finally {
    flushingGoogleQueue = false;
  }
}

async function ensureHeartbeat() {
  const existing = await chrome.alarms.get(HEARTBEAT_ALARM);
  if (!existing) chrome.alarms.create(HEARTBEAT_ALARM, { delayInMinutes: 1, periodInMinutes: HEARTBEAT_PERIOD_MINUTES });
}

async function scheduleAppointmentAlarm(a) {
  if (!a?.reminders?.browser) return;
  const startsAt = a.startsAt || a.starts_at;
  const fireAt = new Date(startsAt).getTime() - Number(a.reminders.minutesBefore || 0) * 60000;
  if (Number.isFinite(fireAt) && fireAt > Date.now()) chrome.alarms.create(`bgd:${a.id}`, { when: fireAt });
}

async function rebuildAppointmentAlarms() {
  const { appointments = [] } = await chrome.storage.local.get('appointments');
  for (const a of appointments) {
    if (['scheduled', 'confirmed', 'rescheduled', 'provisional_offline'].includes(a.status)) await scheduleAppointmentAlarm(a);
  }
}

async function dispatchReminderById(id) {
  const { appointments = [] } = await chrome.storage.local.get('appointments');
  const a = appointments.find((x) => x.id === id);
  if (a) await dispatchReminder(a);
}

async function sweepDueReminders() {
  const { appointments = [] } = await chrome.storage.local.get('appointments');
  const now = Date.now();
  for (const a of appointments) {
    if (!['scheduled', 'confirmed', 'rescheduled', 'provisional_offline'].includes(a.status) || !a?.reminders?.browser) continue;
    const startsAt = a.startsAt || a.starts_at;
    const fireAt = new Date(startsAt).getTime() - Number(a.reminders?.minutesBefore || 0) * 60000;
    if (fireAt <= now && fireAt >= now - REMINDER_GRACE_MS) await dispatchReminder(a);
  }
}

async function dispatchReminder(a) {
  const startsAt = a.startsAt || a.starts_at;
  const key = `browser:${a.id}:${startsAt}:${Number(a.reminders?.minutesBefore || 0)}`;
  const { reminderDispatch = {} } = await chrome.storage.local.get('reminderDispatch');
  if (reminderDispatch[key]) return;
  const client = a.clientName || a.client_name || 'Cliente';
  const service = a.serviceName || a.service_name || 'Agendamento';
  await chrome.notifications.create(`bgd-notify:${a.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'BrasilGuard Agenda',
    message: `${client}: ${service} em ${new Date(startsAt).toLocaleString('pt-BR')}`
  });
  reminderDispatch[key] = new Date().toISOString();
  await chrome.storage.local.set({ reminderDispatch });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    await sweepDueReminders();
    await flushGoogleSyncQueue();
    return;
  }
  if (alarm.name.startsWith('bgd:')) await dispatchReminderById(alarm.name.slice(4));
});

chrome.runtime.onStartup.addListener(() => {
  void initializeWorker();
});

chrome.runtime.onInstalled.addListener(() => {
  void initializeWorker();
});

async function initializeWorker() {
  await ensureHeartbeat();
  await rebuildAppointmentAlarms();
  await sweepDueReminders();
  await flushGoogleSyncQueue();
}

void ensureHeartbeat();
