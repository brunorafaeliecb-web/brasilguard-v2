# BrasilGuard Agenda — Offline-first v0003.d

**Data:** 2026-09-04  
**WebExtension:** `0.2.4`  
**Status:** implementado para teste integrado

## Objetivo

Permitir que a agenda continue útil quando a conexão cai, sem transformar uma decisão local em confirmação definitiva antes do servidor.

## Regra de ouro

Uma criação, edição ou cancelamento feito sem conectividade é uma **operação provisória**. O backend BrasilGuard continua sendo a fonte de verdade.

```text
OFFLINE
→ grava localmente
→ evidencia hash + horário
→ marca como PROVISÓRIO
→ entra na fila

ONLINE NOVAMENTE
→ obtém identidade Google
→ envia fila na ordem
→ backend revalida regras/conflitos
→ confirmado: sincroniza Google e limpa pendência
→ conflito: move para fila de conflitos e avisa o usuário
```

## Cache local

A extensão mantém cache somente do conteúdo que o usuário autenticado já estava autorizado a receber:

- identidade/RBAC previamente carregados;
- branding;
- profissionais;
- serviços;
- vínculos profissional ↔ serviço;
- agenda autorizada (`list_mine` ou `list_all` conforme o papel);
- perfil completo previamente validado;
- última leitura do Google Calendar;
- última licença comercial ativa validada.

A primeira utilização continua exigindo conexão. Offline não cria uma identidade nova nem completa perfil pela primeira vez.

## Operações offline de agenda

### Criar

- gera `appointment.id` no cliente;
- grava operação na fila local;
- injeta registro provisório no cache;
- não declara confirmação definitiva;
- ao reconectar, o servidor valida o horário novamente.

### Editar/reagendar

- grava a alteração na fila;
- atualiza o cache local como pendente;
- reconcilia no servidor ao voltar a conexão.

### Cancelar

- marca localmente como cancelado/pendente;
- sincroniza o cancelamento ao reconectar.

## Conflitos

Se outro usuário ocupar o horário durante o período offline, o backend pode responder `slot_unavailable`.

Nesse caso:

1. a operação não é confirmada;
2. a pendência é movida para `bgdOfflineConflictsV1`;
3. é criada evidência `offline.conflict`;
4. o usuário recebe notificação local;
5. o horário precisa ser revisto.

Nenhum conflito é silenciosamente sobrescrito.

## Idempotência e recuperação

Cada item da fila recebe:

- `queueId` UUID;
- `appointmentId`;
- fingerprint SHA-256 do conteúdo;
- número de tentativas;
- data de criação;
- último erro.

O fingerprint também é enviado como `x-bgd-idempotency-key`. Para criação, se a resposta for perdida depois de o servidor ter persistido o registro, a extensão consulta a agenda pelo `appointmentId` antes de tentar considerar a operação perdida.

## Evidências locais

`bgdOfflineEvidenceV1` registra eventos operacionais com timestamp e hash SHA-256, incluindo:

- `offline.queued`;
- `offline.synced`;
- `offline.conflict`.

O log local é limitado a 500 entradas para evitar crescimento indefinido; a evidência definitiva server-side continua sendo responsabilidade do backend/audit log.

## Google Calendar offline

As mutações Google possuem fila independente `bgdGoogleSyncQueueV1` no background da extensão.

- criação BrasilGuard → Google pode ser adiada;
- atualização → Google pode ser adiada;
- cancelamento → Google pode ser adiado;
- o heartbeat tenta sincronizar a cada minuto;
- `extendedProperties.private.bgdAppointmentId` identifica eventos gerados pelo BrasilGuard.

Eventos Google já lidos anteriormente podem ser mostrados a partir do cache local quando a rede cai.

## Licença comercial offline

Quando `COMMERCE_ENFORCED=true`, a extensão não concede licença por conta própria.

Uma licença ativa previamente confirmada pelo backend pode ser reutilizada offline por uma janela limitada configurada em:

```js
OFFLINE_LICENSE_GRACE_HOURS: 72
```

Depois da janela, a extensão exige nova validação online. Isso evita tanto indisponibilidade imediata por uma queda curta quanto uso offline indefinido sem revalidação comercial.

## Limites deliberados

- primeiro login Google exige internet;
- primeiro preenchimento/validação de perfil exige internet;
- compra/pagamento/ativação de licença exige internet;
- operações financeiras nunca são confirmadas offline;
- disponibilidade offline é apenas uma estimativa do cache;
- Google Calendar não recebe alterações enquanto a rede não voltar.

## Critérios de teste

1. abrir online e carregar agenda;
2. desligar a internet;
3. reabrir e verificar cache;
4. criar agendamento offline e observar `PROVISÓRIO`;
5. editar um agendamento offline;
6. cancelar um agendamento offline;
7. religar a internet;
8. confirmar esvaziamento da fila;
9. confirmar criação/edição/cancelamento no backend;
10. confirmar sincronização Google posterior;
11. simular conflito remoto e confirmar notificação/registro de conflito;
12. testar licença comercial dentro e fora da janela de 72h.

## Gate

A funcionalidade está implementada no código da `v0003.d`, mas só deve ser declarada como **offline em produção** depois do ciclo de testes acima ser concluído.
