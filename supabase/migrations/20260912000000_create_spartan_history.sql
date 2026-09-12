create table if not exists public.spartan_province_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  province_id uuid references public.provinces(id) on delete cascade,
  kingdom_id uuid references public.kingdoms(id) on delete set null,
  observed_at timestamptz not null default now(),
  age integer,
  game_year integer,
  game_tick text,
  source text not null default 'capture',
  source_id text,
  acres numeric,
  networth numeric,
  population numeric,
  peons numeric,
  soldiers numeric,
  off_specs numeric,
  def_specs numeric,
  elites numeric,
  thieves numeric,
  wizards numeric,
  generals numeric,
  prisoners numeric,
  war_horses numeric,
  offense numeric,
  defense numeric,
  defense_home numeric,
  mana numeric,
  stealth numeric,
  r_tpa numeric,
  o_tpa numeric,
  d_tpa numeric,
  r_wpa numeric,
  o_wpa numeric,
  d_wpa numeric,
  build_efficiency numeric,
  wages numeric,
  raw_state jsonb not null default '{}'::jsonb,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists spartan_province_history_province_time_idx on public.spartan_province_history(province_id, observed_at desc);
create index if not exists spartan_province_history_user_time_idx on public.spartan_province_history(user_id, observed_at desc);

create table if not exists public.spartan_event_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  province_id uuid references public.provinces(id) on delete set null,
  kingdom_id uuid references public.kingdoms(id) on delete set null,
  occurred_at timestamptz not null default now(),
  age integer,
  game_year integer,
  game_tick text,
  event_type text not null,
  source text not null default 'capture',
  source_id text,
  attacker text,
  defender text,
  target_kingdom text,
  acres_change numeric default 0,
  troops_lost numeric default 0,
  thieves_lost numeric default 0,
  wizards_lost numeric default 0,
  peasants_change numeric default 0,
  gold_change numeric default 0,
  food_change numeric default 0,
  runes_change numeric default 0,
  mana_change numeric default 0,
  payload jsonb not null default '{}'::jsonb,
  raw_text text,
  created_at timestamptz not null default now()
);

create index if not exists spartan_event_history_province_time_idx on public.spartan_event_history(province_id, occurred_at desc);
create index if not exists spartan_event_history_type_time_idx on public.spartan_event_history(event_type, occurred_at desc);
create index if not exists spartan_event_history_user_time_idx on public.spartan_event_history(user_id, occurred_at desc);

alter table public.spartan_province_history enable row level security;
alter table public.spartan_event_history enable row level security;

create policy "users read own province history" on public.spartan_province_history for select using (auth.uid() = user_id);
create policy "users insert own province history" on public.spartan_province_history for insert with check (auth.uid() = user_id);
create policy "users read own event history" on public.spartan_event_history for select using (auth.uid() = user_id);
create policy "users insert own event history" on public.spartan_event_history for insert with check (auth.uid() = user_id);
