# BrasilGuard / Mordomo — MVP WhatsApp Serverless v1

Port incremental da baseline RC2 para a arquitetura canônica v0002.f:

- GitHub: source of truth
- Vercel: painel/Next.js
- Cloudflare Workers: webhook Meta e borda
- Supabase: PostgreSQL, Storage, Realtime e Edge Functions
- Meta WhatsApp Cloud API: canal oficial
- Gemini: provider inicial configurável

AWS e Oracle/OCI não são dependências deste MVP.

## Ordem de implantação

1. criar projeto Supabase dedicado;
2. aplicar `supabase/migrations/00001_bgd_whatsapp_core.sql`;
3. configurar secrets no Supabase e implantar `wa-ingest` + `wa-process`;
4. implantar `cloudflare/worker` e configurar secrets no Cloudflare;
5. configurar webhook Meta para o Worker;
6. cadastrar tenant/conexão/agente;
7. executar E2E texto inbound/outbound;
8. publicar painel Vercel;
9. portar áudio, knowledge/RAG operacional e handoff completo.

Nenhum segredo real é versionado neste repositório.
