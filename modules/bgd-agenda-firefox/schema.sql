-- BrasilGuard Agenda v0002 — schema de referência.
-- Produção recebeu as migrations bgd_agenda_v0002_* via Supabase.
create extension if not exists pgcrypto;

create table if not exists public.bgd_clients (
  id uuid primary key default gen_random_uuid(), name text not null, phone text not null, email text, created_at timestamptz not null default now()
);
create table if not exists public.bgd_appointments (
  id uuid primary key,
  owner_user_id uuid,
  client_name text not null,
  client_phone text not null,
  client_email text,
  service_name text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check(duration_minutes>0),
  allow_reschedule boolean not null default true,
  reschedule_limit_hours integer not null default 6 check(reschedule_limit_hours>=0),
  permissions jsonb not null default '{"edit":true,"delete":true,"reschedule":true}'::jsonb,
  reminders jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled' check(status in('scheduled','confirmed','rescheduled','cancelled','completed')),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bgd_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.bgd_appointments(id) on delete cascade,
  channel text not null check(channel in('email','whatsapp','browser','google_calendar')),
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check(status in('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.bgd_agenda_profiles (
  user_id uuid primary key, email text, display_name text,
  role text not null default 'customer' check(role in('customer','operator','manager','admin')),
  permissions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.bgd_agenda_services (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  duration_minutes integer not null check(duration_minutes>0),
  buffer_before_minutes integer not null default 0 check(buffer_before_minutes>=0),
  buffer_after_minutes integer not null default 0 check(buffer_after_minutes>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.bgd_agenda_business_hours (
  id uuid primary key default gen_random_uuid(), weekday integer not null check(weekday between 0 and 6),
  starts_at time not null, ends_at time not null, active boolean not null default true, check(ends_at>starts_at)
);
create table if not exists public.bgd_agenda_blocks (
  id uuid primary key default gen_random_uuid(), starts_at timestamptz not null, ends_at timestamptz not null,
  reason text, created_by uuid, created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table if not exists public.bgd_agenda_branding (
  id text primary key default 'default', business_name text not null default 'BrasilGuard Agenda',
  logo_url text, cover_url text, primary_color text not null default '#111827', secondary_color text not null default '#f3f4f6',
  background_color text not null default '#f5f7fa', button_radius integer not null default 8 check(button_radius between 0 and 40),
  button_style text not null default 'solid' check(button_style in('solid','outline','soft')), font_family text not null default 'system-ui',
  welcome_message text, updated_by uuid, updated_at timestamptz not null default now()
);
create table if not exists public.bgd_agenda_message_templates (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check(event_type in('appointment.created','appointment.rescheduled','appointment.cancelled','appointment.reminder_due','appointment.completed')),
  channel text not null check(channel in('email','whatsapp','browser')),
  enabled boolean not null default true, template text not null, updated_by uuid, updated_at timestamptz not null default now(),
  unique(event_type,channel)
);
create table if not exists public.bgd_agenda_audit_log (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid, action text not null, entity_type text not null,
  entity_id uuid, before_data jsonb, after_data jsonb, reason text, created_at timestamptz not null default now()
);
create table if not exists public.bgd_agenda_admin_emails (email text primary key, created_at timestamptz not null default now());

create index if not exists bgd_appointments_starts_at_idx on public.bgd_appointments(starts_at);
create index if not exists bgd_appointments_owner_idx on public.bgd_appointments(owner_user_id,starts_at);
create index if not exists bgd_reminder_outbox_due_idx on public.bgd_reminder_outbox(status,scheduled_for);
create index if not exists bgd_audit_entity_idx on public.bgd_agenda_audit_log(entity_type,entity_id,created_at desc);

alter table public.bgd_clients enable row level security;
alter table public.bgd_appointments enable row level security;
alter table public.bgd_reminder_outbox enable row level security;
alter table public.bgd_agenda_profiles enable row level security;
alter table public.bgd_agenda_services enable row level security;
alter table public.bgd_agenda_business_hours enable row level security;
alter table public.bgd_agenda_blocks enable row level security;
alter table public.bgd_agenda_branding enable row level security;
alter table public.bgd_agenda_message_templates enable row level security;
alter table public.bgd_agenda_audit_log enable row level security;
alter table public.bgd_agenda_admin_emails enable row level security;

create or replace function public.bgd_agenda_is_available(p_starts_at timestamptz,p_duration_minutes integer,p_exclude_id uuid default null)
returns boolean language sql stable security definer set search_path=public as $$
select not exists(select 1 from public.bgd_appointments a where a.status in('scheduled','confirmed','rescheduled') and (p_exclude_id is null or a.id<>p_exclude_id) and a.starts_at<p_starts_at+(p_duration_minutes*interval '1 minute') and a.starts_at+(a.duration_minutes*interval '1 minute')>p_starts_at)
and not exists(select 1 from public.bgd_agenda_blocks b where b.starts_at<p_starts_at+(p_duration_minutes*interval '1 minute') and b.ends_at>p_starts_at);
$$;
