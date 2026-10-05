-- Age reset: archive the ending age's game data into its own schema, clear the live game tables,
-- prune old steward logs, and record the new age. Run it as a preview first (p_confirm = false).
--
--   select public.spartan_start_new_age(116, 117);         -- preview only, changes nothing
--   select public.spartan_start_new_age(116, 117, true);   -- does it
--
-- Kept: accounts, devices, pairing codes, access, builds, rules, wiki, AI sessions, Jeeves profiles,
-- and the province registry rows that are linked to a user.

create table if not exists public.spartan_age_log (
  id bigserial primary key,
  ending_age integer not null,
  new_age integer not null,
  action text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.spartan_age_log enable row level security;

create or replace function public.spartan_start_new_age(p_ending_age integer, p_new_age integer, p_confirm boolean default false)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $fn$
declare
  v_clear text[] := array[
    'spartan_province_history', 'spartan_event_history', 'spartan_intel_records', 'spartan_capture_vault',
    'spartan_state_projection', 'spartan_processing_queue', 'spartan_data_edges', 'spartan_data_flow',
    'spartan_data_quarantine'
  ];
  v_archive text[];
  v_schema text := format('age_%s', p_ending_age);
  v_has_archive boolean;
  t text;
  v_src bigint;
  v_dst bigint;
  v_rows jsonb := '{}'::jsonb;
  v_archived jsonb := '{}'::jsonb;
  v_registry_del bigint;
  v_kingdom_del bigint;
  v_logs_runs bigint;
  v_logs_events bigint;
  v_rules bigint;
  v_builds_old bigint;
  v_warnings jsonb := '[]'::jsonb;
  v_current text;
  v_result jsonb;
begin
  if p_ending_age is null or p_new_age is null or p_new_age <= p_ending_age then
    raise exception 'The new age must be higher than the ending age (got % then %).', p_ending_age, p_new_age;
  end if;

  perform pg_advisory_xact_lock(hashtext('spartan_start_new_age'));

  v_archive := v_clear || array['spartan_province_registry', 'spartan_kingdom_registry', 'spartan_builds'];
  v_has_archive := exists (select 1 from information_schema.schemata where schema_name = v_schema);

  -- What would happen (counted for both the preview and the real run).
  foreach t in array v_archive loop
    execute format('select count(*) from public.%I', t) into v_src;
    v_rows := v_rows || jsonb_build_object(t, v_src);
  end loop;
  select count(*) into v_registry_del from public.spartan_province_registry where user_id is null;
  select count(*) into v_kingdom_del from public.spartan_kingdom_registry
    where kingdom_code not in (select kingdom_code from public.spartan_province_registry where user_id is not null and kingdom_code is not null);
  select count(*) into v_logs_runs from public.spartan_steward_runs where created_at < now() - interval '7 days';
  select count(*) into v_logs_events from public.spartan_steward_events where created_at < now() - interval '7 days';
  select count(*) into v_rules from public.spartan_race_rules where age_number = p_new_age;
  select count(*) into v_builds_old from public.spartan_builds where coalesce(rules_age_number, 0) <> p_new_age;

  if v_has_archive then
    v_warnings := v_warnings || to_jsonb(format('Archive schema %s already exists, so this age was already archived. A real run is blocked until it is renamed or dropped.', v_schema));
  end if;
  if v_rules = 0 then
    v_warnings := v_warnings || to_jsonb(format('Age %s rules are not loaded yet. Approve the age update in the bot to load them and recalculate builds.', p_new_age));
  end if;
  if v_builds_old > 0 then
    v_warnings := v_warnings || to_jsonb(format('%s build(s) are still pinned to an older age. The bot''s age update recalculates them.', v_builds_old));
  end if;

  v_result := jsonb_build_object(
    'preview', not p_confirm,
    'ending_age', p_ending_age,
    'new_age', p_new_age,
    'archive_schema', v_schema,
    'rows_before', v_rows,
    'will_clear', to_jsonb(v_clear),
    'registry_rows_removed', v_registry_del,
    'kingdom_rows_removed', v_kingdom_del,
    'steward_logs_pruned', jsonb_build_object('runs', v_logs_runs, 'events', v_logs_events),
    'warnings', v_warnings
  );

  if not p_confirm then
    return v_result;
  end if;

  if v_has_archive then
    raise exception 'Archive schema % already exists. Nothing was changed.', v_schema;
  end if;

  -- 1. Archive. Every copy must match its source row for row, or the whole run rolls back.
  execute format('create schema %I', v_schema);
  foreach t in array v_archive loop
    execute format('create table %I.%I as table public.%I', v_schema, t, t);
    execute format('select count(*) from public.%I', t) into v_src;
    execute format('select count(*) from %I.%I', v_schema, t) into v_dst;
    if v_src <> v_dst then
      raise exception 'Archive check failed for %: % rows live, % archived. Nothing was changed.', t, v_src, v_dst;
    end if;
    v_archived := v_archived || jsonb_build_object(t, v_dst);
  end loop;

  -- 2. Clear the live game tables (intel before vault; their link is ON DELETE SET NULL anyway).
  foreach t in array v_clear loop
    execute format('delete from public.%I', t);
  end loop;

  -- 3. Provinces nobody is linked to belong to last age's kingdoms. Linked ones stay until their
  --    owner's next identity capture updates them.
  delete from public.spartan_province_registry where user_id is null;
  delete from public.spartan_kingdom_registry
    where kingdom_code not in (select kingdom_code from public.spartan_province_registry where kingdom_code is not null);

  -- 4. Operational logs are not game data; keep a week.
  delete from public.spartan_steward_events where created_at < now() - interval '7 days';
  delete from public.spartan_steward_runs where created_at < now() - interval '7 days';

  -- 5. Record the new age (never moves it backwards).
  select value into v_current from public.bot_settings where key = 'current_age';
  if v_current is null then
    insert into public.bot_settings (key, value, updated_at) values ('current_age', p_new_age::text, now());
  elsif v_current ~ '^[0-9]+$' and v_current::integer < p_new_age then
    update public.bot_settings set value = p_new_age::text, updated_at = now() where key = 'current_age';
  end if;

  v_result := v_result || jsonb_build_object('preview', false, 'archived_rows', v_archived);
  insert into public.spartan_age_log (ending_age, new_age, action, summary) values (p_ending_age, p_new_age, 'new_age_started', v_result);
  return v_result;
end;
$fn$;

revoke all on function public.spartan_start_new_age(integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.spartan_start_new_age(integer, integer, boolean) to service_role;