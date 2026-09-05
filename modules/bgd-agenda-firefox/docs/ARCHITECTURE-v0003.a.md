# BrasilGuard Agenda — Arquitetura v0003.a

## 1. Decisão de produto
A BrasilGuard Agenda deixa de ser tratada como apenas uma extensão Firefox. O produto passa a ser uma plataforma multi-tenant; Firefox, Chrome/Edge, web/PWA e futuras interfaces consomem a mesma camada de domínio/API.

## 2. Domínios
- Tenant/empresa
- Membership/RBAC
- Cliente
- Profissional
- Serviço
- Vínculo profissional-serviço
- Disponibilidade/bloqueios
- Agendamento
- Calendários externos
- Mensagens/eventos
- Webhooks/N8N
- Pagamentos
- Branding
- Auditoria
- Analytics
- Sync offline-first

## 3. Multi-tenant
Toda entidade operacional nova ou migrada deve possuir `tenant_id` e toda consulta deve ser escopada pelo tenant.

Nunca aceitar autorização baseada apenas em um `id` global. O contrato correto é equivalente a:

```sql
where tenant_id = :tenant_id
  and id = :id
```

O tenant padrão `brasilguard-default` preserva compatibilidade com dados históricos enquanto o produto migra para múltiplas empresas.

## 4. Identidade e RBAC
Papéis:
- `customer`
- `operator`
- `manager`
- `admin`
- `owner`

Permissões podem complementar o papel. Operações sensíveis são validadas no backend.

### Cliente final
A agenda pública pode ser vista sem login e mostra apenas `LIVRE`/`OCUPADO`.

Para criar um agendamento:
1. autenticação Google obrigatória;
2. cadastro 100% completo;
3. nome válido;
4. e-mail válido/verificado;
5. telefone válido;
6. disponibilidade revalidada no servidor antes do commit.

## 5. Disponibilidade
A disponibilidade considera:
- tenant;
- profissional;
- serviço;
- início;
- duração;
- buffer antes/depois;
- bloqueios do profissional;
- agendamentos ativos;
- eventos externos marcados como busy;
- timezone IANA.

O estado `LIVRE`/`OCUPADO` pode ser exposto publicamente; dados do agendamento jamais.

## 6. Calendários externos
`bgd_calendar_connections` representa conexões Google/Microsoft. Tokens não são persistidos na extensão; apenas uma referência segura (`token_ref`) é aceita na modelagem.

`bgd_external_calendar_events` funciona como espelho operacional para bloquear horários ocupados por eventos criados fora da BrasilGuard Agenda.

Objetivo de sincronização:
- BrasilGuard → Google/Microsoft;
- Google/Microsoft → BrasilGuard;
- idempotência por evento externo;
- cursor incremental por conexão.

## 7. Webhooks e N8N
Eventos de domínio são persistidos em `bgd_webhook_deliveries` para entrega assíncrona.

Headers previstos:
- `X-BGD-Event`
- `X-BGD-Delivery`
- `X-BGD-Signature`

Requisitos:
- assinatura HMAC;
- retry exponencial;
- dead-letter;
- timeout;
- idempotência;
- logs por entrega.

## 8. Pagamentos
`bgd_payments` desacopla o domínio do gateway. O provider é variável (Infinity Pay, Stripe, Mercado Pago, Pix etc.).

Operações de criação exigem `Idempotency-Key`.

Status base:
- pending
- authorized
- paid
- failed
- cancelled
- refunded

## 9. Offline-first
A extensão mantém cache/outbox local. O backend possui `bgd_sync_outbox` como base para sincronização governada.

Estados:
- pending
- syncing
- synced
- conflict
- failed

Um agendamento criado offline é provisório. Ao reconectar, o servidor revalida disponibilidade. Conflito nunca é resolvido silenciosamente criando dupla reserva.

## 10. Timezone
Persistir instantes em UTC e manter timezone IANA do tenant/profissional/agendamento, como `America/Sao_Paulo`. Não usar offsets fixos como fonte de verdade.

## 11. Analytics
Eventos mínimos:
- `agenda.viewed`
- `slot.selected`
- `login.started`
- `login.completed`
- `profile.completed`
- `checkout.started`
- `appointment.created`
- `appointment.cancelled`
- `appointment.no_show`

Isso permitirá medir conversão, ocupação, cancelamento, no-show, receita, ticket médio e desempenho por profissional/serviço.

## 12. Compatibilidade
A Edge Function `bgd-agenda-appointments` continua sendo o backend operacional da v0002.b durante a transição. A camada de plataforma v0003.a deve ser publicada e testada antes de substituir rotas existentes.

## 13. Gates de release
A v0003.a não pode ir para `main` sem:
- teste de regressão da v0002.b;
- isolamento entre dois tenants;
- agenda pública sem PII;
- cadastro completo obrigatório para agendar;
- conflito incluindo calendário externo;
- RBAC;
- idempotência;
- webhook queue;
- pagamento stub;
- sync outbox;
- auditoria.
