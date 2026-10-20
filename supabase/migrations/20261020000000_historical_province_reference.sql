create table if not exists public.spartan_historical_province_registry (
  age_number integer not null,
  province_id text not null,
  province_name text not null,
  kingdom_code text,
  user_id uuid,
  slot text,
  last_seen_at timestamptz,
  archived_at timestamptz not null default now(),
  primary key (age_number, province_id)
);

alter table public.spartan_historical_province_registry enable row level security;
revoke all on public.spartan_historical_province_registry from anon, authenticated;

-- Backfill the already archived Age 116 province names without copying raw capture payloads.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'age_116' and table_name = 'spartan_province_registry'
  ) then
    execute $sql$
      insert into public.spartan_historical_province_registry
        (age_number, province_id, province_name, kingdom_code, user_id, slot, last_seen_at, archived_at)
      select 116, province_id, province_name, kingdom_code, user_id, slot, last_seen_at,
        coalesce((
          select created_at from public.spartan_age_log
          where ending_age = 116 and new_age = 117 and action = 'new_age_started'
          order by created_at desc limit 1
        ), now())
      from age_116.spartan_province_registry
      where province_id is not null and province_name is not null
      on conflict (age_number, province_id) do update set
        province_name = excluded.province_name,
        kingdom_code = excluded.kingdom_code,
        user_id = excluded.user_id,
        slot = excluded.slot,
        last_seen_at = excluded.last_seen_at,
        archived_at = excluded.archived_at
    $sql$;
  end if;
end $$;

create or replace function public.spartan_record_historical_province_registry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_schema text;
begin
  if new.action <> 'new_age_started' or new.ending_age is null then
    return new;
  end if;

  v_schema := format('age_%s', new.ending_age);
  if not exists (
    select 1 from information_schema.tables
    where table_schema = v_schema and table_name = 'spartan_province_registry'
  ) then
    return new;
  end if;

  execute format(
    'insert into public.spartan_historical_province_registry
      (age_number, province_id, province_name, kingdom_code, user_id, slot, last_seen_at, archived_at)
     select %L, province_id, province_name, kingdom_code, user_id, slot, last_seen_at, %L
     from %I.spartan_province_registry
     where province_id is not null and province_name is not null
     on conflict (age_number, province_id) do update set
       province_name = excluded.province_name,
       kingdom_code = excluded.kingdom_code,
       user_id = excluded.user_id,
       slot = excluded.slot,
       last_seen_at = excluded.last_seen_at,
       archived_at = excluded.archived_at',
    new.ending_age, new.created_at, v_schema
  );
  return new;
end;
$$;

revoke all on function public.spartan_record_historical_province_registry() from public, anon, authenticated;
drop trigger if exists spartan_record_historical_province_registry on public.spartan_age_log;
create trigger spartan_record_historical_province_registry
after insert on public.spartan_age_log
for each row execute function public.spartan_record_historical_province_registry();
