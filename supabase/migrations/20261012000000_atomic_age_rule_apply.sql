-- Replace one age's rules and mark the staged update active in a single transaction.
-- If any delete, insert, status update, or setting update fails, PostgreSQL rolls back all changes.
create or replace function public.spartan_apply_age_update_atomic(
  p_age_number integer,
  p_update_id bigint,
  p_admin_id text,
  p_race_rows jsonb,
  p_personality_rows jsonb,
  p_game_rows jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_age_number is null or p_update_id is null or p_admin_id is null then
    raise exception 'Missing required age approval fields';
  end if;

  if not exists (
    select 1 from public.age_updates
    where id = p_update_id and age_number = p_age_number and status = 'pending'
    for update
  ) then
    raise exception 'Age update is not pending or does not match the requested age';
  end if;

  delete from public.spartan_race_rules where age_number = p_age_number;
  delete from public.spartan_personality_rules where age_number = p_age_number;
  delete from public.spartan_game_rules where age_number = p_age_number;

  if jsonb_typeof(coalesce(p_race_rows, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_personality_rows, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_game_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Age rule payloads must be JSON arrays';
  end if;

  insert into public.spartan_race_rules
  select * from jsonb_populate_recordset(null::public.spartan_race_rules, coalesce(p_race_rows, '[]'::jsonb));

  insert into public.spartan_personality_rules
  select * from jsonb_populate_recordset(null::public.spartan_personality_rules, coalesce(p_personality_rows, '[]'::jsonb));

  insert into public.spartan_game_rules
  select * from jsonb_populate_recordset(null::public.spartan_game_rules, coalesce(p_game_rows, '[]'::jsonb));

  update public.age_updates
    set status = 'approved', approved_by = p_admin_id, approved_at = now()
    where id = p_update_id and status = 'pending';

  if not found then
    raise exception 'Pending age update changed during approval';
  end if;

  insert into public.bot_settings(key, value, updated_at)
    values ('current_age', p_age_number::text, now())
    on conflict (key) do update
      set value = excluded.value, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.spartan_apply_age_update_atomic(integer, bigint, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.spartan_apply_age_update_atomic(integer, bigint, text, jsonb, jsonb, jsonb) from anon;
revoke all on function public.spartan_apply_age_update_atomic(integer, bigint, text, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.spartan_apply_age_update_atomic(integer, bigint, text, jsonb, jsonb, jsonb) to service_role;
