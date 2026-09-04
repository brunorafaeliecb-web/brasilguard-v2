# BrasilGuard Agenda — Firefox

Módulo da BrasilGuard para agenda visual, clientes, profissionais, serviços, agendamentos, permissões, branding e mensagens transacionais.

## Versão atual
- revisão funcional: `v0002.b`;
- versão interna da extensão: `0.1.1`;
- Edge Function Supabase: `bgd-agenda-appointments` v3;
- branch de trabalho: `feat/bgd-agenda-firefox-v0001`;
- merge na `main`: bloqueado até testes integrados.

## Experiência do cliente
- login Google obrigatório;
- agenda visual por data;
- blocos públicos mostram somente `LIVRE` ou `OCUPADO`;
- nunca mostrar nome, telefone, e-mail, serviço ou observação de terceiros;
- seleção de profissional e serviço;
- disponibilidade validada pelo intervalo completo;
- cliente vê somente seus próprios agendamentos e as ações permitidas.

## Operação interna
Perfis RBAC: `customer`, `operator`, `manager`, `admin`.

Conforme autorização, o painel interno permite:
- cadastro avulso de clientes;
- cadastro de profissionais;
- cadastro de serviços;
- vínculo de serviços aos profissionais;
- duração, preço e buffers específicos por profissional/serviço;
- criação de agendamento avulso;
- edição, reagendamento e cancelamento;
- gestão de aparência/white-label;
- auditoria.

## Modelo de disponibilidade
A reserva considera:
1. profissional selecionado;
2. horário inicial;
3. duração do serviço;
4. buffers e bloqueios;
5. conflitos com outros agendamentos ativos.

O mesmo profissional não pode ter dois intervalos sobrepostos.

## Mensagens transacionais
Eventos previstos:
- `appointment.created`;
- `appointment.rescheduled`;
- `appointment.cancelled`;
- `appointment.reminder_due`;
- `appointment.completed`.

Canais previstos/configuráveis: e-mail, WhatsApp e Firefox. Google Calendar é sincronizado separadamente para criação, alteração e cancelamento.

## Segurança
- segredo OAuth e tokens permanentes não são versionados;
- `SUPABASE_SERVICE_ROLE_KEY` permanece somente no backend;
- extensão distribuída contém apenas configuração pública;
- backend valida identidade Google e aplica RBAC;
- RLS permanece habilitado nas tabelas;
- cancelamento é lógico e preserva evidência operacional;
- auditoria é append-only no fluxo funcional.

## Build local
O script `build-local.sh` lê o JSON OAuth local, injeta o `client_secret` somente na cópia de build e gera o XPI sem alterar o arquivo versionado.

## Testes antes do merge
1. carregar extensão;
2. login Google;
3. agenda visual `LIVRE/OCUPADO`;
4. privacidade da agenda pública;
5. cadastro de cliente avulso;
6. cadastro de profissional;
7. cadastro de serviço;
8. vínculo profissional/serviço;
9. conflito por profissional + duração;
10. criação de agendamento;
11. edição;
12. reagendamento;
13. cancelamento;
14. sincronização Google Calendar;
15. mensagens transacionais;
16. RBAC;
17. branding;
18. auditoria.

Consulte `CHANGELOG.md` para histórico completo e `schema.sql` para referência do banco.
