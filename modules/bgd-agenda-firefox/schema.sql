create extension if not exists pgcrypto;

create table if not exists public.bgd_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.bgd_appointments (
  id uuid primary key,
  client_name text not null,
  client_phone text not null,
  client_email text,
  service_name text not null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  allow_reschedule boolean not null default true,
  reschedule_limit_hours integer not null default 6 check (reschedule_limit_hours >= 0),
  reminders jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','rescheduled','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bgd_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.bgd_appointments(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','browser','google_calendar')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists bgd_appointments_starts_at_idx on public.bgd_appointments(starts_at);
create index if not exists bgd_reminder_outbox_due_idx on public.bgd_reminder_outbox(status,scheduled_for);

-- Segurança: negar acesso anônimo por padrão; o backend usa service role.
alter table public.bgd_clients enable row level security;
alter table public.bgd_appointments enable row level security;
alter table public.bgd_reminder_outbox enable row level security;
