# CHANGELOG — BrasilGuard Agenda

Todas as alterações relevantes deste módulo devem ser registradas aqui em ordem cronológica, sem apagar histórico anterior.

## v0002.b — 2026-09-04

**Versão interna:** `0.1.1`

### Adicionado
- agenda visual com todos os blocos do expediente marcados apenas como `LIVRE` ou `OCUPADO` para cliente comum;
- preservação explícita de privacidade: nenhum nome ou dado de terceiros é exposto na agenda pública;
- cadastro avulso de clientes;
- cadastro de profissionais;
- cadastro de serviços;
- vínculo serviço ↔ profissional;
- duração específica por profissional e serviço;
- preço opcional por profissional e serviço;
- buffer antes/depois por profissional e serviço;
- flag para permitir ou bloquear agendamento online por profissional/serviço;
- agenda e bloqueios específicos por profissional;
- agendamento passa a registrar `client_id`, `professional_id` e `service_id` sem perder os campos textuais de evidência;
- validação de conflito por profissional + intervalo completo;
- Edge Function `bgd-agenda-appointments` atualizada para versão 3;
- painel de cadastros internos para clientes, profissionais, serviços e vínculos;
- seleção de profissional e serviço no fluxo de agendamento.

### Regras funcionais
- cliente comum vê a agenda visual, mas somente `LIVRE`/`OCUPADO`;
- operador/gestor/admin podem acessar cadastros conforme RBAC;
- o mesmo profissional não pode receber dois agendamentos sobrepostos;
- a duração considerada pode ser a duração específica do vínculo profissional/serviço;
- agendamento avulso continua permitido para usuário interno autorizado;
- cliente pode existir sem agendamento e profissional pode existir sem serviço vinculado.

### Banco
- novas tabelas `bgd_agenda_professionals`, `bgd_agenda_professional_services`, `bgd_agenda_professional_hours`, `bgd_agenda_professional_blocks`;
- `bgd_clients` ampliada com documento, nascimento, observações, status e `updated_at`;
- `bgd_appointments` ampliada com chaves para cliente, profissional e serviço;
- função de disponibilidade atualizada para considerar profissional.

### Status
`IMPLEMENTADO — AGUARDANDO TESTE INTEGRADO E CORREÇÕES`

## v0002.a — 2026-09-04

**Versão interna:** `0.1.0`

### Adicionado
- login Google obrigatório para qualquer pessoa que deseje agendar;
- separação entre usuário autenticado comum e usuários internos autorizados;
- perfis `customer`, `operator`, `manager` e `admin`;
- agenda pública com exposição apenas de disponibilidade, nunca dados de terceiros;
- cálculo de disponibilidade por intervalo completo do serviço (`início + duração`);
- bloqueio de conflito de agenda antes de confirmar novo agendamento;
- expediente configurável e slots de disponibilidade;
- edição, reagendamento e cancelamento de agendamentos;
- permissões granulares de edição, exclusão e reagendamento;
- limite em horas para reagendamento;
- trilha de auditoria com estado anterior e novo;
- painel de branding/white-label com logo, capa, cores, fundo e padrões visuais;
- templates de mensagens transacionais;
- eventos `appointment.created`, `appointment.rescheduled`, `appointment.cancelled`, `appointment.reminder_due` e `appointment.completed`;
- confirmação ao agendar, mensagem ao reagendar e mensagem ao cancelar;
- integração com Google Calendar para criação, atualização e exclusão/cancelamento;
- script `build-local.sh` para gerar XPI local com injeção do `client_secret` sem versioná-lo no Git;
- novas estruturas Supabase para perfis, serviços, expediente, branding, templates e auditoria;
- Edge Function `bgd-agenda-appointments` atualizada para versão 2.

### Segurança e governança
- segredos permanecem fora do repositório;
- cliente comum não recebe agenda interna nem dados de outros clientes;
- ações sensíveis dependem de autenticação e autorização;
- histórico deve ser preservado; cancelamento não deve apagar evidência operacional;
- alterações seguem branch isolada e não devem ser mergeadas antes do ciclo de testes.

### Migração necessária
- aplicar migrations da v0002.a no Supabase;
- atualizar Edge Function;
- regenerar XPI com `build-local.sh` usando o JSON OAuth local.

### Testes obrigatórios antes do merge
- login Google;
- usuário comum sem permissão administrativa;
- disponibilidade por duração;
- bloqueio de conflito parcial e total;
- criação de agendamento;
- edição;
- reagendamento dentro e fora do limite;
- cancelamento;
- sincronização Google Calendar em criar/editar/cancelar;
- envio/enfileiramento de mensagens transacionais;
- isolamento de dados entre clientes;
- RBAC `customer/operator/manager/admin`;
- branding;
- auditoria.

### Status
`IMPLEMENTADO — AGUARDANDO TESTE INTEGRADO E CORREÇÕES`

## v0001.h — 2026-09-04
- edição e exclusão de agendamentos;
- permissões editáveis por agendamento;
- atualização e exclusão sincronizadas com Google Calendar;
- versão interna `0.0.7`.

## v0001.g — 2026-09-04
- OAuth Google Calendar validado com `client_secret` injetado somente no build local;
- conexão Google Agenda: PASS;
- versão interna `0.0.6`.

## v0001.f — 2026-09-04
- diagnóstico detalhado do fluxo OAuth Google;
- identificação do erro `client_secret is missing`.

## v0001.e — 2026-09-03
- integração inicial Google Calendar via OAuth + PKCE;
- botão Conectar Google Agenda;
- versão interna `0.0.4`.

## v0001.d — 2026-09-03
- heartbeat de lembretes no Firefox;
- reconstrução de alarms;
- deduplicação de notificações;
- lembrete com aba fechada: PASS;
- versão interna `0.0.3`.

## v0001.c — 2026-09-03
- validação de campos obrigatórios;
- foco automático no primeiro campo inválido;
- preservação de rascunho.

## v0001.b — 2026-09-03
- abertura da Agenda em aba própria;
- autosave/restauração de rascunho.

## v0001.a — 2026-09-03
- primeira build funcional do módulo Firefox;
- cadastro, duração, reagendamento, lembretes e persistência local.
