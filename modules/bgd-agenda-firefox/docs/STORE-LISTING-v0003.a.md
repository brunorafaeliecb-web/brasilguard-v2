# BrasilGuard Agenda — Store Listing v0003.a

## Nome
BrasilGuard Agenda

## Resumo curto
Agenda profissional com disponibilidade LIVRE/OCUPADO, clientes, profissionais, serviços e integração com Google Calendar.

## Descrição
BrasilGuard Agenda transforma o navegador em uma central de agendamentos para profissionais e empresas.

Principais recursos da v0003.a:
- agenda visual com horários LIVRE/OCUPADO;
- consulta pública de disponibilidade sem exposição de dados pessoais de terceiros;
- login Google para operações de agendamento;
- cadastro obrigatório com nome, e-mail válido e telefone;
- cadastro de clientes, profissionais e serviços;
- duração e buffers por serviço/profissional;
- prevenção de conflitos de agenda;
- criação, edição, reagendamento e cancelamento;
- integração com Google Calendar;
- permissões por perfil;
- branding/white-label;
- arquitetura preparada para multi-tenant, webhooks, N8N, Outlook e pagamentos.

## Permissões — justificativa

### storage
Usada para preferências locais, estado de sessão técnica, rascunhos e suporte à experiência offline/resiliente.

### notifications
Usada para lembretes locais de agendamentos quando habilitados.

### alarms
Usada para agendar e reconstruir lembretes locais sem exigir que a tela da agenda permaneça aberta.

### identity
Usada no fluxo OAuth do Google para autenticação e integração autorizada com o Google Calendar.

### Hosts Google
Acesso limitado aos domínios necessários para OAuth e Google Calendar.

### Host Supabase
Acesso limitado ao backend BrasilGuard Agenda hospedado no projeto Supabase configurado para esta versão.

## Categoria sugerida
Produtividade / Ferramentas de negócios.

## Público-alvo
Profissionais autônomos, prestadores de serviço, clínicas, salões, consultorias e pequenas/médias empresas que trabalham com reservas de horário.

## Declarações importantes para revisão
- a agenda pública mostra somente disponibilidade;
- dados pessoais de terceiros não são mostrados publicamente;
- chaves de service role não ficam na extensão;
- segredos administrativos permanecem no backend;
- o pacote de Store não inclui migrations, documentação interna ou código do backend.

## Assets ainda necessários
- ícone 32x32;
- ícone 48x48;
- ícone 96x96 ou maior conforme requisito vigente da Store;
- screenshots finais da agenda pública, login/cadastro e painel interno;
- URL pública da Política de Privacidade.
