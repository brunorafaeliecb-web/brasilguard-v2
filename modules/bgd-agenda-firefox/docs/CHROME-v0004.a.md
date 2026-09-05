# BrasilGuard Agenda — Chrome v0004.a

**Manifest:** V3  
**Versão:** `0.3.0`  
**Canal inicial:** Chrome Web Store  
**Status:** pacote de bootstrap pronto para upload inicial e obtenção do Extension ID.

## Decisão arquitetural

A linha `v0004.x` passa a ser Chrome-first. A base compartilhada continua servindo Firefox e Edge, com manifests/builds específicos por plataforma.

## Arquivos Chrome

- `manifest.chrome.json` — Manifest V3;
- `background-chrome.js` — service worker bootstrap;
- `platform-compat.js` — compatibilidade `browser`/`chrome`;
- `build-chrome.sh` — gera o ZIP da Chrome Web Store sem qualquer `client_secret`.

## OAuth Google — gate obrigatório antes de enviar para revisão

A Chrome Identity API exige um OAuth Client do tipo **Chrome Extension**, vinculado ao **Extension ID** do item. Por isso o primeiro upload é usado para criar o item e obter o Extension ID. Depois:

1. criar OAuth Client `Chrome Extension` no Google Cloud usando o Extension ID;
2. registrar `oauth2.client_id` e os scopes no Manifest V3;
3. migrar o runtime Chrome para `chrome.identity.getAuthToken()`;
4. testar Google Login + Calendar;
5. só então `Submit for review`.

O ZIP público não deve conter o `GOOGLE_CLIENT_SECRET` legado do build Firefox.

## Artefato

Caminho padrão de build:

`/home/brunorafael_iecb/BrasilGuard-Agenda-Chrome-v0004.a.zip`

## Gate de publicação

Não clicar em `Submit for review` no primeiro upload. Primeiro obter o Extension ID e concluir o OAuth Chrome nativo.
