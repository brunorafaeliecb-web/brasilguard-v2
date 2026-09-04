// BrasilGuard Agenda v0003.a — agenda pública + gate de cadastro obrigatório.
// Regra: agenda LIVRE/OCUPADO é pública; agendamento exige Google + nome/e-mail/telefone válidos.
(() => {
  const $ = (id) => document.getElementById(id);
  const validName = (v) => String(v || '').trim().length >= 2;
  const validEmail = (v) => /^[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(v || '').trim());
  const normalizePhone = (v) => String(v || '').replace(/\D/g, '');
  const validPhone = (v) => { const n = normalizePhone(v); return n.length >= 10 && n.length <= 15; };

  async function googleToken() {
    const r = await browser.runtime.sendMessage({ type: 'BGD_GOOGLE_TOKEN' });
    return r?.accessToken || null;
  }

  async function profileApi(action, payload = {}) {
    const token = await googleToken();
    if (!token) throw new Error('google_login_required');
    const r = await fetch(BGD_CONFIG.PROFILE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': BGD_CONFIG.SUPABASE_PUBLISHABLE_KEY,
        'x-google-access-token': token,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || `http_${r.status}`);
    return data;
  }

  function platformUrl(path, query = {}) {
    const base = String(BGD_CONFIG.PLATFORM_API_URL || '').replace(/\/$/, '');
    const slug = encodeURIComponent(BGD_CONFIG.DEFAULT_TENANT_SLUG || 'brasilguard-default');
    const url = new URL(`${base}/api/v1/public/${slug}/${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
    return url.toString();
  }

  async function publicGet(path, query) {
    const r = await fetch(platformUrl(path, query), { method: 'GET' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.error || `http_${r.status}`);
    return data;
  }

  function renderSlots(slots) {
    const host = $('slots');
    if (!host) return;
    host.innerHTML = '';
    if (!slots?.length) {
      host.textContent = 'Sem expediente nesta data.';
      return;
    }
    for (const slot of slots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `slot ${slot.status === 'free' ? 'free' : 'busy'}`;
      b.innerHTML = `<span>${new Date(slot.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><strong>${slot.status === 'free' ? 'LIVRE' : 'OCUPADO'}</strong>`;
      if (slot.status !== 'free') {
        b.disabled = true;
      } else {
        b.addEventListener('click', async () => {
          const status = await browser.runtime.sendMessage({ type: 'BGD_GOOGLE_STATUS' });
          if (!status?.connected) {
            const notice = $('lockedNotice');
            if (notice) {
              notice.hidden = false;
              notice.textContent = 'Horário livre. Entre com Google e complete nome, e-mail e telefone para agendar.';
            }
            document.querySelector('.integration-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          const starts = $('startsAt');
          const duration = $('durationMinutes');
          const professional = $('professionalId');
          if (starts) starts.value = new Date(new Date(slot.startsAt).getTime() - new Date(slot.startsAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          if (duration) duration.value = $('availabilityDuration')?.value || '60';
          if (professional) professional.value = $('availabilityProfessional')?.value || '';
          $('appointment-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      host.appendChild(b);
    }
  }

  async function setupPublicAgenda() {
    try {
      const boot = await publicGet('bootstrap');
      const tenant = boot.tenant || {};
      const branding = boot.branding || {};
      if ($('brandName')) $('brandName').textContent = branding.business_name || tenant.name || 'BrasilGuard Agenda';
      if ($('brandWelcome')) $('brandWelcome').textContent = branding.welcome_message || '';
      if (branding.primary_color) document.documentElement.style.setProperty('--bgd-primary', branding.primary_color);
      if (branding.background_color) document.documentElement.style.setProperty('--bgd-bg', branding.background_color);
      const select = $('availabilityProfessional');
      if (select) {
        select.innerHTML = '<option value="">Todos / não definido</option>' + (boot.professionals || []).map((p) => `<option value="${p.id}">${String(p.name || '').replace(/[&<>"']/g, '')}${p.specialty ? ` — ${String(p.specialty).replace(/[&<>"']/g, '')}` : ''}</option>`).join('');
      }
    } catch (e) {
      if ($('slots')) $('slots').textContent = `Agenda pública temporariamente indisponível: ${e.message}`;
    }

    const oldButton = $('checkSlots');
    if (!oldButton) return;
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button); // remove o listener legado que exige login.
    button.addEventListener('click', async () => {
      const host = $('slots');
      if (host) host.textContent = 'Consultando agenda...';
      try {
        const data = await publicGet('schedule', {
          date: $('availabilityDate')?.value,
          duration: Number($('availabilityDuration')?.value || 60),
          professional_id: $('availabilityProfessional')?.value || '',
        });
        renderSlots(data.slots || []);
      } catch (e) {
        if (host) host.textContent = `Falha ao consultar agenda: ${e.message}`;
      }
    });
  }

  function ensureProfileGate() {
    const app = $('appContent');
    if (!app || $('profileGate')) return $('profileGate');
    const section = document.createElement('section');
    section.id = 'profileGate';
    section.className = 'admin-panel';
    section.hidden = true;
    section.innerHTML = `
      <h2>Complete seu cadastro</h2>
      <p class="muted">Para agendar é obrigatório ter login Google e cadastro 100% completo.</p>
      <div class="branding-grid">
        <label>Nome <span class="required-mark">*</span><input id="profileName" maxlength="120" required /></label>
        <label>E-mail validado pelo Google <span class="required-mark">*</span><input id="profileEmail" type="email" readonly required /></label>
        <label>Telefone / WhatsApp <span class="required-mark">*</span><input id="profilePhone" inputmode="tel" placeholder="5521999999999" required /></label>
      </div>
      <button id="saveProfile" type="button">Salvar cadastro</button>
      <p id="profileStatus" role="status" aria-live="polite"></p>`;
    app.prepend(section);
    return section;
  }

  async function refreshProfileGate() {
    const connection = await browser.runtime.sendMessage({ type: 'BGD_GOOGLE_STATUS' });
    if (!connection?.connected) return;
    const gate = ensureProfileGate();
    try {
      const r = await profileApi('profile_get');
      const p = r.profile || {};
      if ($('profileName')) $('profileName').value = p.display_name || '';
      if ($('profileEmail')) $('profileEmail').value = p.email || '';
      if ($('profilePhone')) $('profilePhone').value = p.phone || '';
      const form = $('appointment-form');
      if (!p.profileComplete) {
        gate.hidden = false;
        if (form) form.hidden = true;
      } else {
        gate.hidden = true;
        if (form) form.hidden = false;
        if ($('clientName')) $('clientName').value = p.display_name || $('clientName').value;
        if ($('clientEmail')) $('clientEmail').value = p.email || $('clientEmail').value;
        if ($('clientPhone')) $('clientPhone').value = p.phone || $('clientPhone').value;
      }
    } catch (e) {
      gate.hidden = false;
      if ($('profileStatus')) $('profileStatus').textContent = `Não foi possível validar o cadastro: ${e.message}`;
      if ($('appointment-form')) $('appointment-form').hidden = true;
    }
  }

  function wireProfileSave() {
    const gate = ensureProfileGate();
    const save = $('saveProfile');
    if (!save || save.dataset.wired) return;
    save.dataset.wired = '1';
    save.addEventListener('click', async () => {
      const name = $('profileName')?.value.trim() || '';
      const email = $('profileEmail')?.value.trim() || '';
      const phone = normalizePhone($('profilePhone')?.value || '');
      const status = $('profileStatus');
      if (!validName(name)) { if (status) status.textContent = 'Informe um nome válido.'; return; }
      if (!validEmail(email)) { if (status) status.textContent = 'O e-mail autenticado não é válido.'; return; }
      if (!validPhone(phone)) { if (status) status.textContent = 'Informe telefone válido com DDD (10 a 15 dígitos).'; return; }
      save.disabled = true;
      try {
        await profileApi('profile_update', { name, phone });
        if (status) status.textContent = 'Cadastro completo ✅';
        await refreshProfileGate();
      } catch (e) {
        if (status) status.textContent = `Falha ao salvar cadastro: ${e.message}`;
      } finally { save.disabled = false; }
    });

    // Defesa adicional no cliente. O banco também possui trigger de validação.
    $('appointment-form')?.addEventListener('submit', (ev) => {
      const name = $('clientName')?.value || '';
      const email = $('clientEmail')?.value || '';
      const phone = $('clientPhone')?.value || '';
      if (!validName(name) || !validEmail(email) || !validPhone(phone)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const status = $('status');
        if (status) status.textContent = 'Agendamento bloqueado: nome, e-mail válido e telefone são obrigatórios.';
      }
    }, true);
  }

  async function init() {
    await setupPublicAgenda();
    wireProfileSave();
    // popup.js inicializa identidade em paralelo; pequena espera apenas para refletir o estado final da UI.
    setTimeout(refreshProfileGate, 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
