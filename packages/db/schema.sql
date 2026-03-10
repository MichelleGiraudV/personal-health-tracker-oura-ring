-- Enable UUID generation
create extension if not exists pgcrypto;

-- Users table (very simple for now)
create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Store Oura OAuth tokens
create table if not exists oura_token (
  user_id uuid primary key references app_user(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Store raw Oura daily payloads (backup / source of truth)
create table if not exists oura_raw_daily (
  user_id uuid not null references app_user(id) on delete cascade,
  day date not null,
  source text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, day, source)
);

-- Clean table the app will actually read from
create table if not exists daily_summary (
  user_id uuid not null references app_user(id) on delete cascade,
  day date not null,

  sleep_total_seconds int,
  sleep_efficiency numeric,
  sleep_latency_seconds int,

  readiness_score int,

  steps int,
  activity_score int,

  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
