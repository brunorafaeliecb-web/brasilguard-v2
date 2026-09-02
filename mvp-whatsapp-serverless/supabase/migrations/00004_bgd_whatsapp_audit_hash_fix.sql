-- Correção append-only da cadeia SHA-256 do namespace WhatsApp.
-- O Supabase instala pgcrypto no schema extensions; portanto digest() é qualificado.

create or replace function public.wa_bgd_append_audit_event(
  p_tenant_id uuid,
  p_event_type text,
  p_actor_type text,
  p_actor_id text,
  p_entity_type text,
  p_entity_id text,
  p_trace_id text,
  p_payload jsonb default '{}'::jsonb,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_prev text;
  v_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  select event_hash
    into v_prev
    from public.wa_audit_events
   where tenant_id = p_tenant_id
   order by created_at desc, id desc
   limit 1;

  v_hash := pg_catalog.encode(
    extensions.digest(
      coalesce(v_prev,'') || '|' ||
      p_tenant_id::text || '|' ||
      coalesce(p_event_type,'') || '|' ||
      coalesce(p_actor_type,'') || '|' ||
      coalesce(p_actor_id,'') || '|' ||
      coalesce(p_entity_type,'') || '|' ||
      coalesce(p_entity_id,'') || '|' ||
      coalesce(p_trace_id,'') || '|' ||
      coalesce(p_payload,'{}'::jsonb)::text || '|' ||
      coalesce(p_note,''),
      'sha256'
    ),
    'hex'
  );

  insert into public.wa_audit_events(
    id, tenant_id, event_type, actor_type, actor_id,
    entity_type, entity_id, trace_id, payload,
    previous_hash, event_hash, note
  ) values (
    v_id, p_tenant_id, p_event_type, p_actor_type, p_actor_id,
    p_entity_type, p_entity_id, p_trace_id,
    coalesce(p_payload,'{}'::jsonb), v_prev, v_hash, p_note
  );

  return v_id;
end;
$$;

revoke execute on function public.wa_bgd_append_audit_event(uuid,text,text,text,text,text,text,jsonb,text)
from public, anon, authenticated;

grant execute on function public.wa_bgd_append_audit_event(uuid,text,text,text,text,text,text,jsonb,text)
to service_role;
