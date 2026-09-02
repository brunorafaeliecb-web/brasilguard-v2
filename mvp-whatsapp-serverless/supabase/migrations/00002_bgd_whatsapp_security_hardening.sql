-- Runtime hardening applied to MVP06 isolated WhatsApp namespace on 02.09.26.
-- Idempotent record of the corrective migration executed under ¿00002¿.

create or replace function public.wa_bgd_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.wa_bgd_reject_audit_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'audit_events is append-only'; end; $$;

create or replace function public.wa_bgd_has_tenant_access(p_tenant_id uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists(select 1 from public.wa_tenant_memberships tm where tm.tenant_id=p_tenant_id and tm.user_id=auth.uid());
$$;

create or replace function public.wa_bgd_retrieve_knowledge(p_tenant_id uuid,p_query text,p_limit integer default 5)
returns table(chunk_id uuid,source_id uuid,content text,score real)
language sql stable security invoker set search_path = public, pg_temp as $$
  select kc.id,kc.source_id,kc.content,ts_rank(to_tsvector('simple',kc.content),websearch_to_tsquery('simple',p_query))::real
  from public.wa_knowledge_chunks kc join public.wa_knowledge_sources ks on ks.id=kc.source_id
  where kc.tenant_id=p_tenant_id and ks.tenant_id=p_tenant_id and ks.status='APPROVED'
    and length(trim(coalesce(p_query,'')))>0 and to_tsvector('simple',kc.content)@@websearch_to_tsquery('simple',p_query)
  order by 4 desc,kc.id limit greatest(1,least(coalesce(p_limit,5),20));
$$;

revoke execute on function public.wa_bgd_append_audit_event(uuid,text,text,text,text,text,text,jsonb,text) from public,anon,authenticated;
revoke execute on function public.wa_bgd_claim_job(uuid) from public,anon,authenticated;
revoke execute on function public.wa_bgd_retrieve_knowledge(uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.wa_bgd_has_tenant_access(uuid) from public,anon;

grant execute on function public.wa_bgd_append_audit_event(uuid,text,text,text,text,text,text,jsonb,text) to service_role;
grant execute on function public.wa_bgd_claim_job(uuid) to service_role;
grant execute on function public.wa_bgd_retrieve_knowledge(uuid,text,integer) to service_role;
grant execute on function public.wa_bgd_has_tenant_access(uuid) to authenticated,service_role;

drop policy if exists wa_bgd_tenant_self_read on public.wa_tenants;
create policy wa_bgd_tenant_self_read on public.wa_tenants for select to authenticated using(public.wa_bgd_has_tenant_access(id));

drop policy if exists wa_bgd_membership_self_read on public.wa_tenant_memberships;
create policy wa_bgd_membership_self_read on public.wa_tenant_memberships for select to authenticated using(user_id=(select auth.uid()));

drop policy if exists wa_bgd_inbound_no_client_read on public.wa_whatsapp_inbound_events;
create policy wa_bgd_inbound_no_client_read on public.wa_whatsapp_inbound_events for select to authenticated using(false);
