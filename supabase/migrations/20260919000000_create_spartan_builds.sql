create table if not exists spartan_builds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  race text,
  personality text,
  author text,
  created_by_discord_id text,
  active boolean not null default true,

  -- { "Farms": 7, "Homes": 0, ... }  (percentages)
  buildings jsonb not null default '{}',

  -- { economy: { Alchemy: {type:'weight',value:4}, Artisan: {type:'actual_pct',value:4.2} }, military: {...}, arcane: {...} }
  science jsonb not null default '{}',

  -- { ppa, tpa, wpa, dspa, epa_ospa, gcpa, notes }
  military_requirement jsonb not null default '{}',

  raw_build_text text,
  raw_military_text text,
  raw_science_text text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spartan_builds_active_idx on spartan_builds (active);

alter table spartan_builds enable row level security;
-- Writes go through the service-role client in the API routes (same pattern as your
-- other spartan_* tables), so this policy only needs to cover direct/anon reads.
create policy "spartan_builds_read_all" on spartan_builds for select using (true);
