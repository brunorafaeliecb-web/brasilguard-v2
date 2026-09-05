// BrasilGuard Agenda — compatibilidade WebExtension Firefox/Chromium.
// Expõe `browser` em Chromium e normaliza browserAction -> action no Manifest V3.
(() => {
  'use strict';
  if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
    const c = globalThis.chrome;
    globalThis.browser = new Proxy(c, {
      get(target, prop) {
        if (prop === 'browserAction') return target.action;
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }
})();
