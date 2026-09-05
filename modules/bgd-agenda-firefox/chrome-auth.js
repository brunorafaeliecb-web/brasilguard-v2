// BrasilGuard Agenda v0004.b — OAuth nativo do Chrome MV3.
// Sem client_secret no pacote. O client_id vem do manifest.oauth2 e deve ser
// criado no Google Cloud como "Chrome Extension" para o ID oficial da loja.
(() => {
  'use strict';

  const isChromeIdentity = typeof chrome !== 'undefined' && chrome.identity && typeof chrome.identity.getAuthToken === 'function';
  if (!isChromeIdentity) return;

  async function chromeProfile(accessToken) {
    try {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!r.ok) return {};
      return await r.json();
    } catch {
      return {};
    }
  }

  async function chromeAccessToken(interactive = false) {
    try {
      const result = await chrome.identity.getAuthToken({ interactive });
      return typeof result === 'string' ? result : (result?.token || null);
    } catch (error) {
      if (!interactive) return null;
      throw error;
    }
  }

  globalThis.connectGoogle = async function connectGoogleChrome() {
    try {
      const accessToken = await chromeAccessToken(true);
      if (!accessToken) throw new Error('chrome_oauth_token_missing');
      const profile = await chromeProfile(accessToken);
      const googleOAuth = {
        access_token: accessToken,
        refresh_token: null,
        id_token: null,
        // O Chrome gerencia renovação/revogação do token via identity API.
        expires_at: Date.now() + 45 * 60 * 1000,
        scope: BGD_CONFIG.GOOGLE_SCOPE,
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
      await browser.storage.local.set({ googleOAuth });
      return { ok: true, connected: true, profile: googleOAuth.profile };
    } catch (error) {
      console.error('BGD Agenda: falha OAuth Chrome.', error);
      return { ok: false, connected: false, error: String(error?.message || error) };
    }
  };

  globalThis.validGoogleAccessToken = async function validGoogleAccessTokenChrome() {
    const token = await chromeAccessToken(false);
    if (token) return token;
    // Sem interação automática: se o Chrome perdeu a concessão, a UI pedirá novo login.
    return null;
  };
})();
