create extension if not exists pgcrypto;

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists oura_token (
  user_id uuid primary key references app_user(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists oura_raw_daily (
  user_id uuid not null references app_user(id) on delete cascade,
  day date not null,
  source text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, day, source)
);

create table if not exists daily_summary (
  user_id uuid not null references app_user(id) on delete cascade,
  day date not null,
  sleep_total_seconds integer,
  sleep_efficiency numeric,
  sleep_latency_seconds integer,
  readiness_score integer,
  steps integer,
  activity_score integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists idx_daily_summary_user_day_desc
  on daily_summary (user_id, day desc);

alter table daily_summary add column if not exists stress_high_minutes integer;
alter table daily_summary add column if not exists recovery_high_minutes integer;
alter table daily_summary add column if not exists stress_day_summary text;
alter table daily_summary add column if not exists hrv_avg_ms numeric;
alter table daily_summary add column if not exists resting_hr_bpm numeric;
