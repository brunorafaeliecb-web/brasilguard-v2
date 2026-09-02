-- BrasilGuard / Mordomo — MVP WhatsApp Serverless
-- Baseline SQL derivada do RC2, adaptada para Supabase/PostgreSQL.
-- Princípios: tenant-first, idempotência, append-only audit, fail-closed e sem secrets no banco.

create extension if not exists pgcrypto;

create or replace function public.bgd_set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  active boolean not null default true, created_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('owner','admin','operator','viewer')),
  created_at timestamptz not null default now(), primary key (tenant_id, user_id)
);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  phone_number_id text not null unique, waba_id text, display_phone text, active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_wa_connections_tenant on public.whatsapp_connections(tenant_id);

create table if not exists public.contact_identities (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  external_ref text, full_name text, phone_e164 text not null,
  role text not null default 'other' check (role in ('student','teacher','lead','staff','other')),
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, phone_e164)
);
create index if not exists ix_contact_identity_tenant on public.contact_identities(tenant_id);
create index if not exists ix_contact_identity_phone on public.contact_identities(phone_e164);
drop trigger if exists trg_contact_identities_updated_at on public.contact_identities;
create trigger trg_contact_identities_updated_at before update on public.contact_identities for each row execute function public.bgd_set_updated_at();

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  contact_key text not null, channel text not null default 'whatsapp',
  status text not null default 'open' check (status in ('open','human','closed')),
  identity_id uuid references public.contact_identities(id) on delete set null, identity_role text not null default 'other',
  opened_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz
);
create index if not exists ix_conversations_tenant_contact_status on public.conversations(tenant_id, contact_key, status);
create unique index if not exists uq_conversation_active_contact on public.conversations(tenant_id, contact_key, channel) where status in ('open','human');
drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at before update on public.conversations for each row execute function public.bgd_set_updated_at();

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict, channel text not null,
  direction text not null check (direction in ('inbound','outbound')), provider_message_id text not null,
  sender text not null, recipient text not null, message_type text not null, body text,
  metadata_json jsonb not null default '{}'::jsonb, trace_id text not null, created_at timestamptz not null default now(),
  unique (tenant_id, channel, provider_message_id)
);
create index if not exists ix_messages_tenant on public.conversation_messages(tenant_id);
create index if not exists ix_messages_conversation on public.conversation_messages(conversation_id, created_at);
create index if not exists ix_messages_trace on public.conversation_messages(trace_id);

create table if not exists public.whatsapp_inbound_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  phone_number_id text not null, provider_event_id text not null, event_kind text not null default 'message',
  payload jsonb not null, trace_id text not null, received_at timestamptz not null default now(),
  unique(phone_number_id, provider_event_id)
);
create index if not exists ix_wa_inbound_tenant on public.whatsapp_inbound_events(tenant_id);
create index if not exists ix_wa_inbound_trace on public.whatsapp_inbound_events(trace_id);

create table if not exists public.agent_configs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null, role_scope text not null default 'all', provider text not null default 'gemini',
  model text not null default 'gemini-3.5-flash', system_instructions text not null,
  behavior_json jsonb not null default '{}'::jsonb, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ix_agent_tenant_active on public.agent_configs(tenant_id, active, role_scope);
drop trigger if exists trg_agent_configs_updated_at on public.agent_configs;
create trigger trg_agent_configs_updated_at before update on public.agent_configs for each row execute function public.bgd_set_updated_at();

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  job_type text not null default 'auto_reply', trigger_message_id uuid not null references public.conversation_messages(id) on delete restrict,
  trace_id text not null, status text not null default 'pending' check (status in ('pending','processing','completed','failed','skipped')),
  attempt_count integer not null default 0, last_error_type text, result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id, job_type, trigger_message_id)
);
create index if not exists ix_jobs_tenant_status on public.automation_jobs(tenant_id, status, created_at);
create index if not exists ix_jobs_trace on public.automation_jobs(trace_id);
drop trigger if exists trg_automation_jobs_updated_at on public.automation_jobs;
create trigger trg_automation_jobs_updated_at before update on public.automation_jobs for each row execute function public.bgd_set_updated_at();

create table if not exists public.outbound_deliveries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict, channel text not null default 'whatsapp',
  idempotency_key text not null, recipient text not null, body text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text, provider_payload jsonb not null default '{}'::jsonb, error_code text, trace_id text not null,
  created_at timestamptz not null default now(), sent_at timestamptz, unique(tenant_id, idempotency_key)
);
create index if not exists ix_outbound_tenant_status on public.outbound_deliveries(tenant_id, status, created_at);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  source_type text not null, filename text, mime_type text, sha256 text not null, storage_path text,
  extracted_text text not null default '', status text not null default 'CANDIDATE' check (status in ('CANDIDATE','APPROVED','REJECTED')),
  provenance_json jsonb not null default '{}'::jsonb, created_by text not null, approved_by text, approved_at timestamptz,
  created_at timestamptz not null default now(), unique(tenant_id, sha256)
);
create index if not exists ix_knowledge_sources_tenant_status on public.knowledge_sources(tenant_id, status);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade, chunk_index integer not null,
  content text not null, metadata_json jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(source_id, chunk_index)
);
create index if not exists ix_knowledge_chunks_tenant on public.knowledge_chunks(tenant_id);

create table if not exists public.assist_requests (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  input_message_id uuid references public.conversation_messages(id) on delete set null,
  question text not null, reason_code text not null default 'KNOWLEDGE_GAP',
  status text not null default 'OPEN' check (status in ('OPEN','ANSWERED','CLOSED')),
  answer text, answered_by text, metadata_json jsonb not null default '{}'::jsonb, trace_id text not null,
  created_at timestamptz not null default now(), answered_at timestamptz
);
create index if not exists ix_assist_tenant_status_created on public.assist_requests(tenant_id, status, created_at);
create unique index if not exists uq_assist_open_message on public.assist_requests(tenant_id, input_message_id) where status = 'OPEN' and input_message_id is not null;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  event_type text not null, actor_type text not null, actor_id text, entity_type text not null, entity_id text,
  trace_id text not null, payload jsonb not null default '{}'::jsonb, previous_hash text, event_hash text not null,
  note text, created_at timestamptz not null default now()
);
create index if not exists ix_audit_tenant_created on public.audit_events(tenant_id, created_at, id);
create index if not exists ix_audit_trace on public.audit_events(trace_id);

create or replace function public.bgd_reject_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'audit_events is append-only'; end; $$;
drop trigger if exists trg_bgd_audit_immutable on public.audit_events;
create trigger trg_bgd_audit_immutable before update or delete on public.audit_events for each row execute function public.bgd_reject_audit_mutation();

create or replace function public.bgd_append_audit_event(
  p_tenant_id uuid, p_event_type text, p_actor_type text, p_actor_id text, p_entity_type text,
  p_entity_id text, p_trace_id text, p_payload jsonb default '{}'::jsonb, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_prev text; v_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  select event_hash into v_prev from public.audit_events where tenant_id = p_tenant_id order by created_at desc, id desc limit 1;
  v_hash := encode(digest(coalesce(v_prev,'') || '|' || p_tenant_id::text || '|' || coalesce(p_event_type,'') || '|' || coalesce(p_actor_type,'') || '|' || coalesce(p_actor_id,'') || '|' || coalesce(p_entity_type,'') || '|' || coalesce(p_entity_id,'') || '|' || coalesce(p_trace_id,'') || '|' || coalesce(p_payload,'{}'::jsonb)::text || '|' || coalesce(p_note,''), 'sha256'), 'hex');
  insert into public.audit_events(id, tenant_id, event_type, actor_type, actor_id, entity_type, entity_id, trace_id, payload, previous_hash, event_hash, note)
  values(v_id, p_tenant_id, p_event_type, p_actor_type, p_actor_id, p_entity_type, p_entity_id, p_trace_id, coalesce(p_payload,'{}'::jsonb), v_prev, v_hash, p_note);
  return v_id;
end; $$;

create or replace function public.bgd_claim_job(p_job_id uuid)
returns setof public.automation_jobs language plpgsql security definer set search_path = public as $$
begin
  return query update public.automation_jobs set status='processing', attempt_count=attempt_count+1, updated_at=now()
  where id=p_job_id and status='pending' returning *;
end; $$;

create or replace function public.bgd_retrieve_knowledge(p_tenant_id uuid, p_query text, p_limit integer default 5)
returns table(chunk_id uuid, source_id uuid, content text, score real)
language sql stable security definer set search_path = public as $$
  select kc.id, kc.source_id, kc.content,
         ts_rank(to_tsvector('simple', kc.content), websearch_to_tsquery('simple', p_query))::real as score
  from public.knowledge_chunks kc join public.knowledge_sources ks on ks.id=kc.source_id
  where kc.tenant_id=p_tenant_id and ks.tenant_id=p_tenant_id and ks.status='APPROVED'
    and length(trim(coalesce(p_query,'')))>0
    and to_tsvector('simple', kc.content) @@ websearch_to_tsquery('simple', p_query)
  order by score desc, kc.id limit greatest(1, least(coalesce(p_limit,5),20));
$$;

create or replace function public.bgd_has_tenant_access(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.tenant_memberships tm where tm.tenant_id=p_tenant_id and tm.user_id=auth.uid());
$$;

do $$ declare t text; begin
  foreach t in array array['tenants','tenant_memberships','whatsapp_connections','contact_identities','conversations','conversation_messages','whatsapp_inbound_events','agent_configs','automation_jobs','outbound_deliveries','knowledge_sources','knowledge_chunks','assist_requests','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['whatsapp_connections','contact_identities','conversations','conversation_messages','agent_configs','automation_jobs','outbound_deliveries','knowledge_sources','knowledge_chunks','assist_requests','audit_events'] loop
    execute format('drop policy if exists bgd_tenant_read on public.%I', t);
    execute format('create policy bgd_tenant_read on public.%I for select to authenticated using (public.bgd_has_tenant_access(tenant_id))', t);
  end loop;
end $$;

drop policy if exists bgd_conversation_update on public.conversations;
create policy bgd_conversation_update on public.conversations for update to authenticated using (public.bgd_has_tenant_access(tenant_id)) with check (public.bgd_has_tenant_access(tenant_id));
drop policy if exists bgd_assist_update on public.assist_requests;
create policy bgd_assist_update on public.assist_requests for update to authenticated using (public.bgd_has_tenant_access(tenant_id)) with check (public.bgd_has_tenant_access(tenant_id));
drop policy if exists bgd_knowledge_update on public.knowledge_sources;
create policy bgd_knowledge_update on public.knowledge_sources for update to authenticated using (public.bgd_has_tenant_access(tenant_id)) with check (public.bgd_has_tenant_access(tenant_id));

revoke insert, update, delete on public.audit_events from anon, authenticated, service_role;
grant select on public.audit_events to service_role;
grant execute on function public.bgd_append_audit_event(uuid,text,text,text,text,text,text,jsonb,text) to service_role;
grant execute on function public.bgd_claim_job(uuid) to service_role;
grant execute on function public.bgd_retrieve_knowledge(uuid,text,integer) to service_role;
grant execute on function public.bgd_has_tenant_access(uuid) to authenticated, service_role;
