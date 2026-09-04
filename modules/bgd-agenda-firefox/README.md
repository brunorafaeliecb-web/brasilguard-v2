# BrasilGuard Agenda — Firefox

Módulo da BrasilGuard para agendamento autenticado, disponibilidade por duração, gestão interna, permissões, branding e lembretes/mensagens multicanal.

## Versão atual
- release funcional: `v0002.a`
- versão interna: `0.1.0`
- branch: `feat/bgd-agenda-firefox-v0001`
- status: **IMPLEMENTADO — AGUARDANDO TESTE INTEGRADO E CORREÇÕES**

## Arquitetura atual
### Cliente autenticado (`customer`)
- login Google obrigatório;
- consulta apenas horários disponíveis;
- criação de agendamento somente quando todo o intervalo do serviço estiver livre;
- acesso somente aos próprios agendamentos;
- reagendamento/cancelamento conforme regra.

### Usuários internos
Perfis previstos:
- `operator`
- `manager`
- `admin`

Permissões sensíveis incluem edição, reagendamento, cancelamento/exclusão lógica, gestão de usuários, gestão de permissões e override administrativo.

## Disponibilidade
A validação considera o intervalo completo:

`início + duração do serviço`

Um novo agendamento é bloqueado se houver interseção com outro agendamento ou indisponibilidade aplicável.

## Funcionalidades
- cadastro/associação de cliente autenticado;
- serviços e duração;
- horários disponíveis;
- expediente configurável;
- bloqueio de conflito;
- criar, editar, reagendar e cancelar;
- permissões por perfil e por regra;
- auditoria before/after;
- Google Calendar sincronizado em criar/editar/cancelar;
- lembrete Firefox;
- fila para e-mail e WhatsApp;
- templates transacionais para criação, reagendamento e cancelamento;
- branding white-label: logo, capa, cores, fundo e botões;
- persistência local de fallback para desenvolvimento;
- Supabase como backend/fonte operacional estruturada.

## Eventos transacionais
- `appointment.created`
- `appointment.rescheduled`
- `appointment.cancelled`
- `appointment.reminder_due`
- `appointment.completed`

## Segurança
- cliente comum nunca recebe dados de agenda de terceiros;
- ações internas dependem de autenticação/autorização;
- RLS e deny-by-default permanecem como baseline;
- segredos nunca devem ser versionados;
- `client_secret` Google usado nos testes é injetado somente no build local;
- service role Supabase e tokens permanentes de WhatsApp devem permanecer no backend seguro.

## Build local
Use:

```bash
modules/bgd-agenda-firefox/build-local.sh \
  ~/client_secret_2_752721916663-l59ed4t5h8bcts9b0pojk4ed7aca5l5n.apps.googleusercontent.com.json \
  ~/BrasilGuard-Agenda-Firefox-v0002.a.xpi
```

## Teste obrigatório antes do merge
1. login Google;
2. cliente comum sem acesso administrativo;
3. consulta de slots;
4. conflito por duração;
5. criação;
6. edição;
7. reagendamento dentro/fora do limite;
8. cancelamento;
9. sincronização Google Calendar;
10. mensagens transacionais/enfileiramento;
11. isolamento de dados entre clientes;
12. RBAC;
13. branding;
14. auditoria.

## Documentação
- `CHANGELOG.md` — histórico cronológico de versões;
- `docs/ARCHITECTURE-v0002.a.md` — arquitetura, RBAC, disponibilidade, mensagens e segurança.

## Governança BGD
- branch isolada;
- sem merge antes de teste/correção;
- histórico não é apagado;
- segredos fora do código distribuído;
- falha de integração não deve apagar agendamento;
- auditoria e evidências preservadas.
