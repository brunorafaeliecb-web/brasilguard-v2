# RELEASE — BrasilGuard Agenda v0003.d

**Data:** 2026-09-04  
**WebExtension:** `0.2.4`  
**Branch:** `feat/bgd-agenda-firefox-v0001`  
**Merge:** BLOQUEADO até teste integrado

## Implementado nesta revisão

- agenda visual integrada BrasilGuard + Google;
- fundação comercial/licenciamento;
- cache offline autorizado;
- fila offline de criação/edição/cancelamento;
- reconciliação automática;
- conflito offline explícito;
- fila Google pós-confirmação do backend;
- janela de licença offline de 72h quando o comércio for ativado;
- evidência local com hash;
- package gate contendo `offline-sync.js`.

## Teste mínimo antes de Store

| Gate | Resultado |
|---|---|
| Build XPI v0003.d | PENDENTE TESTE LOCAL |
| Login Google online | PENDENTE RETESTE |
| Agenda BrasilGuard online | PENDENTE RETESTE |
| Agenda Google online | PENDENTE RETESTE |
| Abrir sem internet após cache | PENDENTE |
| Criar offline como provisório | PENDENTE |
| Editar offline | PENDENTE |
| Cancelar offline | PENDENTE |
| Reconectar e sincronizar | PENDENTE |
| Conflito remoto | PENDENTE |
| Google somente após confirmação backend | PENDENTE |
| Licença offline 72h | PENDENTE (commerce ainda desativado) |

## Regra de publicação

Enquanto algum gate crítico acima estiver falhando, não anunciar `offline` como capacidade de produção. A submissão à Store pode prosseguir quando login, carregamento, criação, edição, cancelamento e segurança estiverem estáveis; a descrição pública deve refletir apenas funções validadas.
