-- Runtime performance hardening applied to MVP06 isolated WhatsApp namespace on 02.09.26.

create index if not exists ix_wa_assist_conversation on public.wa_assist_requests(conversation_id);
create index if not exists ix_wa_assist_input_message on public.wa_assist_requests(input_message_id);
create index if not exists ix_wa_jobs_conversation on public.wa_automation_jobs(conversation_id);
create index if not exists ix_wa_jobs_trigger_message on public.wa_automation_jobs(trigger_message_id);
create index if not exists ix_wa_conversations_identity on public.wa_conversations(identity_id);
create index if not exists ix_wa_outbound_conversation on public.wa_outbound_deliveries(conversation_id);
create index if not exists ix_wa_memberships_user on public.wa_tenant_memberships(user_id);

drop policy if exists wa_bgd_membership_self_read on public.wa_tenant_memberships;
create policy wa_bgd_membership_self_read on public.wa_tenant_memberships for select to authenticated using(user_id=(select auth.uid()));
