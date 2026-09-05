# BrasilGuard Agenda — v0003.a build03

**Versão interna:** `0.2.2`  
**Data:** 2026-09-04  
**Status:** IMPLEMENTADO — AGUARDANDO BUILD LOCAL E SMOKE TEST

## Objetivo

Consolidar a agenda premium integrada antes do gate de Store.

## Alterações

- agenda visual principal exige conta Google conectada;
- visualizações Dia, Semana e Mês;
- leitura dos eventos do calendário primário da conta Google autenticada;
- composição visual de eventos Google + agendamentos BrasilGuard;
- filtro por origem e profissional;
- opção de ocultar títulos privados do Google, exibindo apenas `OCUPADO — Google`;
- abertura do evento diretamente no Google Calendar;
- deduplicação dos eventos Google criados como espelho de agendamentos BrasilGuard, usando o mapeamento local `googleCalendarEvents`;
- atualização automática do calendário após criar, atualizar ou cancelar agendamento;
- renderização de títulos com `textContent`, eliminando injeção de HTML por conteúdo vindo de calendário ou cadastro;
- build padrão renomeada para `BrasilGuard-Agenda-v0003.a-build03.xpi`.

## Regras preservadas

- login Google obrigatório para visualizar a agenda integrada;
- para agendar, perfil deve estar completo com nome válido, e-mail válido e telefone válido;
- cliente comum não recebe dados de terceiros pela API de agenda pública;
- backend e banco continuam sendo a fonte de verdade operacional;
- segredos não são versionados.

## Smoke test obrigatório

1. carregar `build03` no Firefox;
2. conectar Google;
3. confirmar que Dia/Semana/Mês aparecem;
4. confirmar que um evento já existente no Google aparece;
5. criar um agendamento BrasilGuard;
6. confirmar criação no Google Calendar;
7. confirmar que o mesmo agendamento não aparece duplicado na visão `BrasilGuard + Google`;
8. editar/reagendar e verificar atualização nas duas agendas;
9. cancelar e verificar remoção/cancelamento no Google;
10. desmarcar `Mostrar meus títulos do Google` e confirmar exibição como `OCUPADO — Google`;
11. validar gate de nome + e-mail + telefone;
12. validar ausência de PII de terceiros para cliente comum.

## Gate de Store

`BLOQUEADO` até o smoke test acima passar integralmente.
