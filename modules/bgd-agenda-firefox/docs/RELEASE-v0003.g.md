# RELEASE — BrasilGuard Agenda Firefox v0003.g

**Data:** 2026-09-04  
**WebExtension:** `0.2.7`  
**Branch:** `feat/bgd-agenda-firefox-v0001`  
**Merge:** BLOQUEADO até teste integrado

## Objetivo

Adicionar painel operacional de profissionais, serviços, comissões e rateio sem misturar taxa de comissão com participação na execução.

## Regra de cálculo

Hierarquia da taxa efetiva:

1. `professional_service` — regra específica do profissional + serviço;
2. `service` — comissão padrão do serviço;
3. `professional` — comissão padrão do profissional;
4. `company` — comissão padrão da empresa.

A regra mais específica prevalece. Percentuais não são somados nem multiplicados entre si.

Fórmula:

```text
base_rateada = valor_comissionavel * (split_percentage / 100)
comissao = base_rateada * (effective_commission_rate_pct / 100)
```

## Banco / backend

Migration aplicada: `bgd_agenda_v0003_g_commission_rateio`.

Adicionado:

- `bgd_agenda_professionals.commission_rate_pct`;
- `bgd_agenda_services.commission_rate_pct`;
- `bgd_agenda_professional_services.commission_rate_pct`;
- `bgd_agenda_professional_services.split_default_pct`;
- `bgd_commission_settings`;
- `bgd_appointment_professional_splits` para evolução do rateio real por execução/agendamento;
- constraints de 0% a 100%;
- RLS nas novas tabelas;
- trilha de auditoria para regras de comissão;
- tenant scoping nas operações protegidas da Edge Function `bgd-agenda-appointments` v4;
- papel `owner` tratado como nível administrativo;
- ações `commission_overview`, `commission_settings_update` e `commission_assignment_update`.

## Firefox

Adicionado `commission-panel.js`:

- painel Comissões e rateio;
- comissão padrão da empresa;
- comissão padrão informada no cadastro de profissional;
- comissão padrão informada no cadastro de serviço;
- override profissional + serviço;
- rateio padrão da execução;
- taxa efetiva e origem da regra;
- cálculo ilustrativo com o preço configurado;
- atualização da combinação profissional/serviço diretamente no painel;
- visibilidade apenas para `manager`, `admin` e `owner`;
- correção complementar de visibilidade administrativa para `owner` no shell do painel.

## Build

Saída oficial:

```text
BrasilGuard-Agenda-Firefox-v0003.g.xpi
```

`commission-panel.js` é obrigatório no pacote.

## Gates de teste

| Gate | Estado |
|---|---|
| Migration Supabase | PASS |
| Edge `bgd-agenda-appointments` v4 ativa | PASS |
| Manifest `0.2.7` | PASS |
| Build script inclui `commission-panel.js` | PASS |
| Cadastrar profissional com comissão padrão | PENDENTE TESTE LOCAL |
| Cadastrar serviço com comissão padrão | PENDENTE TESTE LOCAL |
| Vincular profissional + serviço com override | PENDENTE TESTE LOCAL |
| Rateio 70% + comissão 40% + preço R$100 = R$28 | PENDENTE TESTE LOCAL |
| Herança serviço > profissional > empresa | PENDENTE TESTE LOCAL |
| Persistência após fechar/reabrir | PENDENTE TESTE LOCAL |
| RBAC manager/admin/owner | PENDENTE TESTE INTEGRADO |
| Isolamento multi-tenant | PENDENTE TESTE INTEGRADO |

## Regra de merge

A PR permanece DRAFT e não deve ser mergeada antes dos testes de cadastro, cálculo, persistência, RBAC, tenant e regressão da agenda.
