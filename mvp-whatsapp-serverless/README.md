# BrasilGuard / Mordomo — MVP WhatsApp Serverless v1

Port incremental da baseline RC2 para a arquitetura canônica v0002.f:

- GitHub: source of truth
- Vercel: preview/painel sem substituir a aplicação STIR/SHAKEN existente
- Cloudflare Workers: webhook Meta e borda
- Supabase: PostgreSQL, Storage, Realtime e Edge Functions
- Meta WhatsApp Cloud API: canal oficial
- Gemini: provider inicial configurável

AWS e Oracle/OCI não são dependências deste MVP.

## Estado real em 02.09.26

- Supabase alvo: `MVP06`, reutilizado apenas com autorização humana e isolamento por prefixo `wa_*`;
- migrations core + security + performance + audit hash fix: aplicadas;
- `wa-ingest`: ACTIVE v1;
- `wa-process`: ACTIVE v1;
- tenant `brasilguard-mordomo-mvp`: criado;
- agente inicial Gemini `gemini-3.5-flash`: ativo;
- auditoria append-only SHA-256: PASS;
- GitHub -> Vercel preview: READY;
- rota isolada do MVP no preview: `/mvp-whatsapp.html`;
- Cloudflare Worker / secrets / webhook Meta / E2E: pendentes de credenciais reais e ação humana.

## Padrão BGD de credenciais

Todo campo de senha, token, API key ou secret que precise ser substituído manualmente usa o marcador:

`mudeaquiasenha`

Esse marcador nunca é uma credencial válida. Produção deve permanecer bloqueada enquanto qualquer segredo ativo estiver ausente ou igual a `mudeaquiasenha`.

Templates:

- `.env.example`
- `SECRETS.template.env`

Nenhum segredo real deve ser commitado.

## Bootstrap governado dos provedores

Workflow manual:

`.github/workflows/bgd-mvp-whatsapp-provider-bootstrap.yml`

O workflow:

1. valida que todos os secrets obrigatórios existem e não são `mudeaquiasenha`;
2. configura secrets das Supabase Edge Functions;
3. publica o Cloudflare Worker via Wrangler;
4. não imprime valores de credenciais;
5. deixa o próximo gate em webhook Meta + E2E real.

## Próxima sequência

1. cadastrar os Actions Secrets reais no GitHub;
2. executar manualmente `BGD MVP WhatsApp - Provider Bootstrap` na branch `bgd/mvp-whatsapp-serverless-v1`;
3. verificar Supabase e Cloudflare pós-bootstrap;
4. registrar `phone_number_id` / WABA no namespace `wa_*`;
5. configurar o webhook Meta para o Worker;
6. executar E2E inbound/outbound de texto;
7. validar Gemini, idempotência e cadeia de auditoria;
8. portar áudio/Storage, RAG e handoff completo;
9. auditoria final BGD;
10. `PRODUCTION_GO` somente após PASS.
