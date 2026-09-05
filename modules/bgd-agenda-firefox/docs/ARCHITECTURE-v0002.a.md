# BrasilGuard Agenda — Arquitetura v0002.a

## 1. Princípios
- autenticação Google obrigatória para qualquer agendamento;
- cliente comum autenticado recebe apenas disponibilidade e seus próprios agendamentos;
- dados de terceiros e agenda interna nunca são expostos ao cliente comum;
- autorização é aplicada no backend;
- disponibilidade é calculada pelo intervalo completo do serviço;
- ações sensíveis são auditáveis;
- cancelamento preserva histórico;
- segredos não entram no repositório nem no pacote distribuído final.

## 2. Perfis
### customer
- consultar disponibilidade;
- criar agendamento em horário disponível;
- consultar próprios agendamentos;
- reagendar/cancelar próprios agendamentos conforme regra.

### operator
- visualizar agenda operacional;
- criar e editar conforme permissões concedidas;
- reagendar conforme política;
- sem gestão de usuários/permissões administrativas.

### manager
- capacidades de operador;
- cancelar/excluir logicamente conforme política;
- administrar parte das regras operacionais.

### admin
- controle total;
- gerenciar usuários, perfis, permissões, regras, serviços, branding e auditoria;
- override administrativo rastreável.

## 3. Permissões granulares
- `can_view`
- `can_create`
- `can_edit`
- `can_reschedule`
- `can_delete`
- `can_manage_permissions`
- `can_manage_users`
- `can_override_rules`

Perfis definem baseline; permissões específicas podem restringir ou ampliar dentro da política administrativa.

## 4. Disponibilidade
Conflito é calculado por interseção de intervalos.

Para um novo intervalo `[novo_inicio, novo_fim)` e existente `[inicio, fim)` há conflito quando:

`novo_inicio < fim AND novo_fim > inicio`

Logo, verificar apenas a hora inicial é inválido.

A disponibilidade também considera:
- duração do serviço;
- expediente;
- bloqueios;
- agendamentos existentes;
- futuros eventos externos quando integrados à fonte oficial de calendário.

## 5. Superfícies
### Agenda pública
- login Google;
- seleção de serviço;
- consulta de slots disponíveis;
- criação de agendamento.

### Minha Agenda
- próprios agendamentos;
- reagendamento permitido;
- cancelamento permitido.

### Painel interno
- agenda completa;
- clientes;
- serviços;
- expediente/bloqueios;
- usuários e permissões;
- auditoria.

### Aparência
- nome da empresa;
- logo;
- capa;
- cor principal;
- cor secundária;
- fundo;
- estilo/raio dos botões;
- mensagem de boas-vindas.

## 6. Eventos transacionais
- `appointment.created`
- `appointment.rescheduled`
- `appointment.cancelled`
- `appointment.reminder_due`
- `appointment.completed`

Cada evento pode gerar notificações configuráveis por canal.

## 7. Canais
- Firefox/browser;
- Google Calendar;
- e-mail;
- WhatsApp.

## 8. Mensagens
Templates editáveis devem suportar, no mínimo:
- `{nome}`
- `{servico}`
- `{data}`
- `{hora}`
- `{data_antiga}`
- `{hora_antiga}`
- `{data_nova}`
- `{hora_nova}`

## 9. Auditoria
Registrar em ação sensível:
- ator;
- papel/permissão;
- ação;
- timestamp;
- objeto afetado;
- valor anterior;
- valor novo;
- motivo quando aplicável.

## 10. Segredos e build
O repositório não contém `client_secret` Google, service role Supabase ou tokens permanentes de WhatsApp.

`build-local.sh` injeta o `client_secret` apenas no artefato local de teste. Para distribuição pública, a arquitetura deve migrar segredos para backend seguro.

## 11. Estado da v0002.a
Código e schema atualizados. Release ainda não está fechada: depende de teste integrado, correção de falhas e validação antes do merge na `main`.
