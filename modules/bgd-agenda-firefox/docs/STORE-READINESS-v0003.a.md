# BrasilGuard Agenda — Store Readiness v0003.a

Data: 2026-09-04
Versão interna: 0.2.0
Status: RELEASE CANDIDATE EM TESTE — NÃO PUBLICAR AINDA

## Gates concluídos

- [x] Platform API pública `bgd-agenda-platform-v3` publicada.
- [x] Agenda pública sem login limitada a LIVRE/OCUPADO.
- [x] Profile API `bgd-agenda-profile-v3` publicada.
- [x] Login Google obrigatório para qualquer operação de agendamento.
- [x] Cadastro completo obrigatório antes de agendar: nome, e-mail validado e telefone válido.
- [x] Validação também no banco para clientes, profissionais e agendamentos.
- [x] Host permissions do Firefox reduzidas a Supabase/Google necessários.
- [x] Build local remove migrations, documentação e backend do XPI final.
- [x] Segredos não ficam no Git.
- [x] RLS permanece deny-by-default para acesso direto; Edge Functions usam service role no backend.
- [x] RPCs SECURITY DEFINER do módulo Agenda restritos ao service_role.

## Gates obrigatórios restantes

- [ ] Gerar XPI v0003.a limpo.
- [ ] Carregar XPI no Firefox e executar smoke test.
- [ ] Confirmar agenda pública sem login.
- [ ] Confirmar que agenda pública não mostra PII.
- [ ] Confirmar clique em LIVRE exige Google.
- [ ] Confirmar cadastro incompleto bloqueia formulário de agendamento.
- [ ] Confirmar cadastro completo libera agendamento.
- [ ] Confirmar nome/e-mail/telefone inválidos são recusados.
- [ ] Criar e confirmar agendamento.
- [ ] Testar edição, reagendamento e cancelamento.
- [ ] Confirmar Google Calendar create/update/delete.
- [ ] Testar conflito por duração/profissional.
- [ ] Testar dois tenants e ausência de leitura cruzada.
- [ ] Gerar ícones finais de Store.
- [ ] Capturar screenshots finais.
- [ ] Publicar Política de Privacidade em URL pública.
- [ ] Preencher listing AMO.
- [ ] Revisar pacote final e submeter para assinatura/revisão Mozilla.

## Critério GO/NO-GO

GO somente quando todos os gates obrigatórios acima estiverem PASS. Qualquer vazamento de PII, bypass de login/cadastro, conflito de agenda não bloqueado ou segredo no pacote é NO-GO.
