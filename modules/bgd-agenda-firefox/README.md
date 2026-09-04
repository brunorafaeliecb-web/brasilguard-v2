# BrasilGuard Agenda

A BrasilGuard Agenda é o módulo/plataforma de agendamento da BrasilGuard. A extensão Firefox é um dos clientes do produto; a arquitetura passa a suportar web/PWA, outras stores, API pública e integrações externas.

## Versão atual
- revisão: `v0003.a`;
- versão interna: `0.2.0`;
- branch: `feat/bgd-agenda-firefox-v0001`;
- merge na `main`: bloqueado até testes integrados;
- backend operacional legado: `bgd-agenda-appointments`;
- fundação de plataforma: multi-tenant + API v1 + webhooks + pagamentos + sync/offline-first.

## Experiência pública
- agenda pode ser visualizada sem login;
- horários exibem somente `LIVRE` ou `OCUPADO`;
- nenhuma informação pessoal de terceiros é exposta;
- filtros por data, profissional e serviço;
- para agendar: login Google obrigatório + cadastro 100% completo (`nome`, `e-mail válido`, `telefone válido`).

## Core funcional
- clientes avulsos;
- profissionais;
- serviços;
- vínculo profissional/serviço;
- duração, preço e buffers específicos;
- disponibilidade por intervalo completo;
- criação, edição, reagendamento e cancelamento lógico;
- RBAC;
- white-label;
- auditoria;
- mensagens transacionais;
- Google Calendar já integrado;
- Outlook/Microsoft Graph previsto na camada de conexões externas.

## v0003.a — arquitetura de plataforma
A partir desta versão, toda entidade operacional é escopada por `tenant_id`. O isolamento entre empresas deixa de ser apenas visual e passa a fazer parte do modelo de dados.

Novos blocos de plataforma:
- `bgd_tenants` e `bgd_tenant_memberships`;
- branding por tenant;
- webhooks e fila de entregas para N8N/automação;
- conexões de calendário Google/Microsoft e espelho de eventos externos;
- pagamentos desacoplados por provider;
- idempotência;
- sync outbox para offline-first;
- analytics/eventos de conversão;
- timezone IANA e moeda por tenant.

## Segurança
- segredos nunca entram no repositório;
- service role permanece apenas no backend;
- tokens OAuth não ficam expostos na extensão distribuída;
- RLS habilitado;
- queries novas devem usar `tenant_id`;
- cliente comum não recebe dados de terceiros;
- cancelamentos preservam evidência operacional;
- ações sensíveis devem produzir auditoria.

## Integrações
Eventos principais:
- `appointment.created`
- `appointment.updated`
- `appointment.rescheduled`
- `appointment.cancelled`
- `appointment.completed`
- `appointment.no_show`
- `payment.created`
- `payment.approved`
- `payment.failed`
- `payment.refunded`

Canais/consumidores: WhatsApp, e-mail, SMS, browser, N8N/webhooks, Google Calendar, Microsoft Graph e gateways de pagamento.

## Build local
`build-local.sh` injeta o `client_secret` apenas na cópia local de teste. O segredo não é commitado.

## Gate antes do merge
A `v0003.a` permanece sem merge na `main` até validar: compatibilidade da v0002.b, isolamento multi-tenant, agenda pública, cadastro completo, disponibilidade, RBAC, Google Calendar, webhooks, idempotência, pagamentos em modo stub, sync outbox e auditoria.

Consulte `CHANGELOG.md`, `schema.sql` e `docs/ARCHITECTURE-v0003.a.md`.
