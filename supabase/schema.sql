-- AI Trends Scout schema
create extension if not exists "uuid-ossp";

create table if not exists ai_trends_roots (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  keyword text not null,
  locale text not null default 'global',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_trends_roots_keyword_locale_idx
  on ai_trends_roots (lower(keyword), locale);

create table if not exists ai_trends_keywords (
  id uuid primary key default uuid_generate_v4(),
  keyword text not null,
  locale text not null,
  timeframe text not null,
  demand_category text,
  is_brand boolean not null default false,
  latest_score numeric,
  latest_ratio numeric,
  momentum numeric,
  coverage_countries text[] default '{}',
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  summary text,
  news_refs uuid[] default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_trends_keywords_keyword_idx
  on ai_trends_keywords using gin (to_tsvector('simple', keyword));

create index if not exists ai_trends_keywords_locale_idx
  on ai_trends_keywords (locale);

create index if not exists ai_trends_keywords_timeframe_idx
  on ai_trends_keywords (timeframe);

create unique index if not exists ai_trends_keywords_unique_key
  on ai_trends_keywords (lower(keyword), locale, timeframe);

create table if not exists ai_trends_snapshots (
  id uuid primary key default uuid_generate_v4(),
  keyword_id uuid not null references ai_trends_keywords (id) on delete cascade,
  collected_at timestamptz not null,
  trend_score numeric,
  baseline_ratio numeric,
  related_queries jsonb,
  series jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_trends_snapshots_keyword_idx
  on ai_trends_snapshots (keyword_id, collected_at desc);

create table if not exists ai_trends_news (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  url text not null,
  source text,
  published_at timestamptz,
  summary text,
  keywords text[] default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_trends_news_published_idx
  on ai_trends_news (published_at desc);

create table if not exists ai_trends_notifications (
  id uuid primary key default uuid_generate_v4(),
  rule_name text not null,
  channel text not null,
  config jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_trends_events (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

comment on table ai_trends_snapshots is 'Stores historical trend metrics for each keyword to power charts.';
comment on table ai_trends_keywords is 'Represents aggregated keyword signal with the latest trend metrics.';
create table if not exists ai_trends_runs (
  id uuid primary key default uuid_generate_v4(),
  status text not null default 'queued',
  trigger_source text,
  root_keywords text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  triggered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_trends_runs_triggered_at_idx on ai_trends_runs (triggered_at desc);

create table if not exists ai_trends_tasks (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid references ai_trends_runs (id) on delete set null,
  task_id text not null,
  keyword text not null,
  locale text not null,
  timeframe text not null,
  location_name text,
  location_code integer,
  language_name text,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error jsonb,
  cost numeric,
  posted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_trends_tasks_task_id_idx on ai_trends_tasks (task_id);
create index if not exists ai_trends_tasks_run_id_idx on ai_trends_tasks (run_id);
