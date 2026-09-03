# BrasilGuard Agenda — Firefox v0001

Módulo da BrasilGuard para cadastro de clientes, agendamentos, regras de reagendamento e lembretes multicanal.

## Escopo v0001
- cadastro local de cliente no fluxo de agendamento;
- serviço, data/hora e duração;
- regra de reagendamento por agendamento;
- lembrete no Firefox;
- fila para e-mail, WhatsApp e Google Calendar;
- persistência local de fallback;
- endpoint serverless para Supabase;
- schema Supabase deny-by-default (RLS habilitado).

## Credenciais pendentes
Procure literalmente por `MUDARASENHA` antes do teste integrado.

Necessárias para produção:
- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY` no backend;
- `BACKEND_URL`;
- credenciais Google OAuth/Calendar/Gmail;
- credenciais oficiais da WhatsApp Business Platform.

**Nunca** colocar service role, segredo Google ou token permanente de WhatsApp dentro da extensão distribuída. Os marcadores existentes são somente gates visuais de configuração; integrações finais devem usar o backend.

## Teste manual posterior
1. Firefox: `about:debugging` → This Firefox → Load Temporary Add-on.
2. Selecionar `manifest.json`.
3. Criar agendamento futuro.
4. Verificar storage local e alarm.
5. Configurar `MUDARASENHA` no ambiente seguro.
6. Aplicar `schema.sql` no Supabase.
7. Testar backend e integrações em sandbox.
8. Corrigir falhas antes do merge na `main`.

## Governança BGD
- branch isolada;
- sem merge antes de teste/correção;
- segredos fora do código distribuído;
- banco com RLS;
- falha de integração não apaga o agendamento local;
- fila preserva tentativa posterior.
