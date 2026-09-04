// BrasilGuard Agenda v0004.b — bootstrap Chrome/Edge Manifest V3.
// Carrega compatibilidade, configuração, background compartilhado e por último
// o adaptador OAuth nativo do Chrome, que substitui o fluxo legado com secret.
importScripts('platform-compat.js', 'config.js', 'background.js', 'chrome-auth.js');
