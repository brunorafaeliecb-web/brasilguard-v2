# BrasilGuard Agenda — v0003.a build02

Data: 2026-09-04
Versão interna da extensão: `0.2.1`
Status: IMPLEMENTADO NO CÓDIGO — AGUARDANDO SMOKE TEST NO FIREFOX

## Decisão

A agenda simplificada em blocos `LIVRE/OCUPADO` deixou de ser a interface principal. A experiência operacional passa a exigir login Google e apresentar uma agenda gráfica integrada, inspirada no padrão de calendários comerciais.

## Regras

- a agenda integrada só é exibida após autenticação Google;
- a interface combina agendamentos BrasilGuard e eventos do calendário Google principal;
- vistas implementadas: Dia, Semana e Mês;
- navegação: anterior, Hoje e próximo;
- filtros: profissional e origem (`BrasilGuard + Google`, `Somente BrasilGuard`, `Somente Google`);
- opção de ocultar títulos pessoais do Google e exibir apenas `OCUPADO — Google`;
- clique em evento Google abre o evento no Google Calendar;
- clique em evento BrasilGuard posiciona o fluxo para edição/agendamento;
- duplo clique em dia/célula pré-preenche novo agendamento;
- botão `Abrir Google Calendar` abre a agenda Google da conta autenticada;
- cadastro 100% continua obrigatório antes de salvar agendamento: nome, e-mail válido e telefone válido.

## Privacidade

A agenda integrada com títulos e detalhes é uma visão autenticada. Títulos do Google não são exibidos fora do `appContent` autenticado. O usuário pode ocultar títulos pessoais a qualquer momento.

## Implementação

Arquivos principais:

- `popup.html`: shell do calendário premium;
- `popup.css`: layouts Day/Week/Month e eventos por origem;
- `calendar-premium.js`: leitura do Google Calendar API e merge visual com a agenda BrasilGuard;
- `manifest.json`: versão `0.2.1`;
- `build-local.sh`: inclui `calendar-premium.js` e gera por padrão `BrasilGuard-Agenda-v0003.a-build02.xpi`.

## Limites desta build

- drag-and-drop de eventos ainda não foi habilitado;
- resize visual de duração ainda não foi habilitado;
- Outlook permanece no roadmap;
- sincronização Google existente continua responsável por criação/alteração/cancelamento; esta build adiciona a leitura/visualização integrada da agenda Google.

## Testes obrigatórios

1. extensão carrega sem erro;
2. sem login, agenda integrada não aparece;
3. login Google libera a agenda;
4. eventos existentes do Google aparecem;
5. agendamentos BrasilGuard aparecem na mesma visão;
6. Dia/Semana/Mês funcionam;
7. filtro de origem funciona;
8. ocultar títulos do Google troca detalhes por ocupação genérica;
9. `Abrir Google Calendar` funciona;
10. novo agendamento continua criando evento no Google;
11. cadastro incompleto continua bloqueando agendamento;
12. nenhuma PII de terceiros aparece sem autorização.
