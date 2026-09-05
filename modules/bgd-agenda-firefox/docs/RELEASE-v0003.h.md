# BrasilGuard Agenda Firefox — v0003.h

## Objetivo

Retirar o `GOOGLE_CLIENT_SECRET` do cliente Firefox/XPI antes da verificação/publicação.

## Alterações

- WebExtension `0.2.8`.
- Criada a Edge Function `bgd-agenda-google-oauth-v1` para troca e renovação de tokens Google no backend.
- `config.js` não contém mais `GOOGLE_CLIENT_SECRET`.
- `background.js` envia somente `code`, `codeVerifier`, `redirectUri` ou `refreshToken` ao backend OAuth.
- `build-local.sh` não recebe nem injeta mais o JSON OAuth no XPI.
- O build possui gate que falha se `GOOGLE_CLIENT_SECRET` reaparecer no runtime.
- Permissão direta a `oauth2.googleapis.com` removida do manifest; `openidconnect.googleapis.com` foi declarada explicitamente para leitura do perfil autenticado.

## Segredo de produção

O segredo deve existir somente como Secret da Edge Function/Supabase:

`GOOGLE_CLIENT_SECRET`

Nunca versionar o valor e nunca inseri-lo no XPI.

## Gate de validação

Antes de enviar para verificação Google/AMO:

1. configurar `GOOGLE_CLIENT_SECRET` no Supabase;
2. gerar `BrasilGuard-Agenda-Firefox-v0003.h.xpi`;
3. confirmar `CLIENT_SECRET_EM_XPI=NAO`;
4. testar login Google, refresh de token e criação/edição/exclusão de evento no Calendar;
5. inspecionar o XPI e confirmar ausência de segredo OAuth;
6. somente então avançar para submissão/verificação.
