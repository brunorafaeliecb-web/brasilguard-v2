-- BrasilGuard Agenda v0003.a
-- Migration aplicada em 2026-09-04: fundação multi-tenant/plataforma.

create table if not exists public.bgd_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  plan text not null default 'starter',
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.bgd_tenants(name,slug,plan)
select 'BrasilGuard Agenda','brasilguard-default','internal'
where not exists (select 1 from public.bgd_tenants where slug='brasilguard-default');

create table if not exists public.bgd_tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  user_id uuid not null,
  email text,
  display_name text,
  role text not null default 'customer' check(role in('customer','operator','manager','admin','owner')),
  permissions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,user_id)
);

alter table public.bgd_clients add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_services add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_professionals add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_professional_services add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_business_hours add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_professional_hours add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_blocks add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_professional_blocks add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_appointments add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_reminder_outbox add column if not exists tenant_id uuid references public.bgd_tenants(id);
alter table public.bgd_agenda_audit_log add column if not exists tenant_id uuid references public.bgd_tenants(id);

update public.bgd_clients set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_services set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_professionals set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_professional_services set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_business_hours set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_professional_hours set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_blocks set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_agenda_professional_blocks set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_appointments set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;
update public.bgd_reminder_outbox o set tenant_id=a.tenant_id from public.bgd_appointments a where o.appointment_id=a.id and o.tenant_id is null;
update public.bgd_agenda_audit_log set tenant_id=(select id from public.bgd_tenants where slug='brasilguard-default') where tenant_id is null;

alter table public.bgd_clients alter column tenant_id set not null;
alter table public.bgd_agenda_services alter column tenant_id set not null;
alter table public.bgd_agenda_professionals alter column tenant_id set not null;
alter table public.bgd_agenda_professional_services alter column tenant_id set not null;
alter table public.bgd_agenda_business_hours alter column tenant_id set not null;
alter table public.bgd_agenda_professional_hours alter column tenant_id set not null;
alter table public.bgd_agenda_blocks alter column tenant_id set not null;
alter table public.bgd_agenda_professional_blocks alter column tenant_id set not null;
alter table public.bgd_appointments alter column tenant_id set not null;
alter table public.bgd_reminder_outbox alter column tenant_id set not null;
alter table public.bgd_agenda_audit_log alter column tenant_id set not null;

alter table public.bgd_agenda_services drop constraint if exists bgd_agenda_services_name_key;
create unique index if not exists bgd_agenda_services_tenant_name_uq on public.bgd_agenda_services(tenant_id,lower(name));
create unique index if not exists bgd_clients_tenant_phone_uq on public.bgd_clients(tenant_id,phone) where phone is not null;
create index if not exists bgd_appointments_tenant_professional_starts_idx on public.bgd_appointments(tenant_id,professional_id,starts_at);
create index if not exists bgd_memberships_user_idx on public.bgd_tenant_memberships(user_id,active);

create table if not exists public.bgd_tenant_branding (
  tenant_id uuid primary key references public.bgd_tenants(id) on delete cascade,
  business_name text not null,
  logo_url text,
  cover_url text,
  favicon_url text,
  primary_color text not null default '#111827',
  secondary_color text not null default '#f3f4f6',
  background_color text not null default '#f5f7fa',
  button_radius integer not null default 8 check(button_radius between 0 and 40),
  button_style text not null default 'solid' check(button_style in('solid','outline','soft')),
  font_family text not null default 'system-ui',
  welcome_message text,
  custom_domain text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.bgd_tenant_branding(tenant_id,business_name)
select id,name from public.bgd_tenants t
where not exists(select 1 from public.bgd_tenant_branding b where b.tenant_id=t.id);

create table if not exists public.bgd_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  name text not null,
  url text not null,
  secret_ref text,
  events text[] not null default '{}',
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bgd_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  webhook_id uuid not null references public.bgd_webhook_endpoints(id) on delete cascade,
  event_type text not null,
  event_id uuid not null default gen_random_uuid(),
  payload jsonb not null,
  status text not null default 'pending' check(status in('pending','sending','sent','failed','dead_letter')),
  attempts integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.bgd_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  professional_id uuid references public.bgd_agenda_professionals(id) on delete cascade,
  provider text not null check(provider in('google','microsoft')),
  external_calendar_id text,
  token_ref text,
  sync_cursor text,
  sync_status text not null default 'pending' check(sync_status in('pending','active','error','revoked')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,professional_id,provider,external_calendar_id)
);

create table if not exists public.bgd_external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  professional_id uuid references public.bgd_agenda_professionals(id) on delete cascade,
  connection_id uuid references public.bgd_calendar_connections(id) on delete cascade,
  provider text not null check(provider in('google','microsoft')),
  external_event_id text not null,
  appointment_id uuid references public.bgd_appointments(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'busy',
  etag text,
  updated_at timestamptz not null default now(),
  unique(connection_id,external_event_id)
);

create table if not exists public.bgd_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  appointment_id uuid references public.bgd_appointments(id) on delete set null,
  provider text not null,
  external_payment_id text,
  amount numeric(12,2) not null check(amount>=0),
  currency text not null default 'BRL',
  status text not null default 'pending' check(status in('pending','authorized','paid','failed','cancelled','refunded')),
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,provider,external_payment_id)
);

alter table public.bgd_appointments add column if not exists price numeric(12,2);
alter table public.bgd_appointments add column if not exists currency text not null default 'BRL';
alter table public.bgd_appointments add column if not exists payment_status text not null default 'not_required' check(payment_status in('not_required','pending','authorized','paid','failed','refunded'));
alter table public.bgd_appointments add column if not exists timezone text not null default 'America/Sao_Paulo';
alter table public.bgd_appointments add column if not exists source text not null default 'extension';

create table if not exists public.bgd_idempotency_keys (
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  request_hash text,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now(),
  primary key(tenant_id,idempotency_key)
);

create table if not exists public.bgd_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  actor_user_id uuid,
  entity_type text not null,
  entity_id uuid,
  operation text not null check(operation in('create','update','delete','cancel','reschedule')),
  payload jsonb not null,
  idempotency_key text not null,
  status text not null default 'pending' check(status in('pending','syncing','synced','conflict','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);

create table if not exists public.bgd_analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.bgd_tenants(id) on delete cascade,
  actor_user_id uuid,
  session_id text,
  event_type text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.bgd_tenants enable row level security;
alter table public.bgd_tenant_memberships enable row level security;
alter table public.bgd_tenant_branding enable row level security;
alter table public.bgd_webhook_endpoints enable row level security;
alter table public.bgd_webhook_deliveries enable row level security;
alter table public.bgd_calendar_connections enable row level security;
alter table public.bgd_external_calendar_events enable row level security;
alter table public.bgd_payments enable row level security;
alter table public.bgd_idempotency_keys enable row level security;
alter table public.bgd_sync_outbox enable row level security;
alter table public.bgd_analytics_events enable row level security;

create or replace function public.bgd_agenda_is_available_v3(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_buffer_before_minutes integer default 0,
  p_buffer_after_minutes integer default 0,
  p_exclude_id uuid default null
)
returns boolean language sql stable security definer set search_path=public as $$
with requested as (
  select p_starts_at-(p_buffer_before_minutes*interval '1 minute') as s,
         p_starts_at+((p_duration_minutes+p_buffer_after_minutes)*interval '1 minute') as e
)
select not exists(
  select 1 from public.bgd_appointments a, requested r
  where a.tenant_id=p_tenant_id
    and a.status in('scheduled','confirmed','rescheduled')
    and (p_exclude_id is null or a.id<>p_exclude_id)
    and (p_professional_id is null or a.professional_id=p_professional_id)
    and a.starts_at<r.e
    and a.starts_at+(a.duration_minutes*interval '1 minute')>r.s
)
and not exists(
  select 1 from public.bgd_agenda_professional_blocks b, requested r
  where b.tenant_id=p_tenant_id
    and (p_professional_id is null or b.professional_id=p_professional_id)
    and b.starts_at<r.e and b.ends_at>r.s
)
and not exists(
  select 1 from public.bgd_external_calendar_events e, requested r
  where e.tenant_id=p_tenant_id
    and (p_professional_id is null or e.professional_id=p_professional_id)
    and e.status='busy'
    and e.starts_at<r.e and e.ends_at>r.s
);
$$;
