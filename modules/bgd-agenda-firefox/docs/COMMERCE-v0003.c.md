# BrasilGuard Agenda — Comércio, Licenças e Entrega por E-mail — v0003.c

Data: 2026-09-04

## Objetivo

Permitir download gratuito da extensão e controlar o uso comercial pelo backend. A licença só é ativada após confirmação server-side do pagamento InfinitePay. A entrega e as comunicações comerciais são enviadas ao e-mail vinculado à compra.

## Fluxo oficial

1. usuário entra com Google;
2. BrasilGuard consulta a licença no backend;
3. usuário sem licença escolhe um plano ativo;
4. backend cria pedido `pending` e gera checkout InfinitePay;
5. InfinitePay recebe Pix/cartão e envia webhook quando aprovado;
6. backend consulta `payment_check` antes de confiar no webhook;
7. valor, `order_nsu` e `transaction_nsu` são validados;
8. ativação/renovação ocorre no backend com idempotência;
9. licença, entitlements, evento de auditoria e e-mail transacional são registrados;
10. e-mail informa plano, valor, validade, pedido, comprovante e link de instalação;
11. extensão consulta `/license` e libera somente conforme entitlement.

## Componentes Supabase

- `bgd_commerce_plans`
- `bgd_commerce_orders`
- `bgd_commerce_payments`
- `bgd_commerce_subscriptions`
- `bgd_commerce_entitlements`
- `bgd_commerce_license_events`
- `bgd_email_outbox`
- RPC service-only `bgd_commerce_activate_paid_order`
- Edge Function `bgd-agenda-commerce-v1`

## Rotas

- `POST /checkout` — exige identidade Google válida;
- `POST /webhook` — endpoint público para InfinitePay; não ativa com base no payload sozinho e revalida em `payment_check`;
- `GET /license` — exige identidade Google e retorna somente a licença da conta autenticada.

## Regras de segurança

- frontend nunca cria ou ativa licença;
- retorno/redirect do checkout nunca é prova de pagamento;
- webhook é revalidado na InfinitePay;
- valor esperado vem do plano/pedido no banco;
- `transaction_nsu` é único para impedir dupla ativação;
- tabelas comerciais são service-only com RLS e grants removidos de `anon`/`authenticated`;
- preço, duração e features ficam no backend, não hardcoded na extensão;
- nenhum segredo InfinitePay/e-mail é versionado no Git.

## Entrega por e-mail

O envio transacional é preparado via `bgd_email_outbox`. A Edge Function está pronta para Resend quando estas variáveis de ambiente forem configuradas:

- `RESEND_API_KEY=MUDARASENHA`
- `BGD_EMAIL_FROM=MUDARASENHA`
- `BGD_INSTALL_URL=MUDARASENHA` (URL definitiva da Store)
- `BGD_SUPPORT_EMAIL` (opcional)

## InfinitePay

Configuração pendente antes da primeira venda real:

- `INFINITEPAY_HANDLE=MUDARASENHA`
- habilitar Checkout Integrado na conta InfinitePay.

A API usada segue a documentação oficial vigente em 2026-09-04: `POST /links`, webhook e `POST /payment_check`.

## Gate comercial

`BGD_CONFIG.COMMERCE_ENFORCED` permanece `false` enquanto preço/duração do plano, InfiniteTag e entrega de e-mail não estiverem configurados. Isso evita bloquear a build de desenvolvimento por configuração comercial incompleta. Antes da publicação comercial deve ser alterado para `true` e validado em teste de compra real/homologação.

## Versionamento

- revisão BGD: `v0003.c`;
- versão WebExtension: `0.2.3`;
- pacote local padrão: `BrasilGuard-Agenda-Firefox-v0003.c.xpi`.
