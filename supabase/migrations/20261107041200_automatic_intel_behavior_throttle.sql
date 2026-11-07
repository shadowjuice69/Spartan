-- Automatic province-wide Intel behavior throttle.
-- First 25 submissions in a rolling 60-minute window are accepted.
-- Submission 26 starts a 60-minute cooldown. Anduin Lothar retains the
-- existing stricter one-capture-per-hour policy.

create table if not exists public.spartan_intel_throttle_state (
  province_id text primary key,
  recent_attempts timestamptz[] not null default '{}',
  throttle_until timestamptz,
  blocked_attempts bigint not null default 0,
  total_throttles bigint not null default 0,
  last_seen_at timestamptz,
  last_reason text
);

create table if not exists public.spartan_intel_throttle_events (
  id bigint generated always as identity primary key,
  province_id text not null,
  triggered_at timestamptz not null default clock_timestamp(),
  attempt_count integer not null,
  window_minutes integer not null default 60,
  cooldown_minutes integer not null default 60,
  reason text not null
);

alter table public.spartan_intel_throttle_state enable row level security;
alter table public.spartan_intel_throttle_events enable row level security;
revoke all on public.spartan_intel_throttle_state from public, anon, authenticated;
revoke all on public.spartan_intel_throttle_events from public, anon, authenticated;

create or replace function public.spartan_record_intel_attempt(p_province_id text)
returns table (allowed boolean, retry_after_seconds integer, attempts_in_window integer, throttled boolean, reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_recent timestamptz[];
  v_count integer;
  v_until timestamptz;
  v_manual record;
begin
  if p_province_id is null or btrim(p_province_id) = '' then
    raise exception 'province_id is required';
  end if;

  -- Anduin's explicit one-capture-per-hour rule remains stricter.
  if p_province_id = 'aeff76bc-0762-47d4-a329-5483c6f79e21' then
    select * into v_manual from public.spartan_claim_capture_slot(p_province_id);
    return query select v_manual.allowed,
      greatest(0, coalesce(v_manual.retry_after_seconds, 0)),
      1, not v_manual.allowed, 'anduin_manual_hourly_limit'::text;
    return;
  end if;

  insert into public.spartan_intel_throttle_state(province_id)
  values (p_province_id) on conflict (province_id) do nothing;

  select recent_attempts, throttle_until into v_recent, v_until
  from public.spartan_intel_throttle_state
  where province_id = p_province_id for update;

  if v_until is not null and v_until > v_now then
    update public.spartan_intel_throttle_state
      set blocked_attempts = blocked_attempts + 1, last_seen_at = v_now, last_reason = 'active_cooldown'
      where province_id = p_province_id;
    return query select false,
      greatest(1, ceil(extract(epoch from (v_until - v_now)))::integer),
      coalesce(cardinality(v_recent), 0), true, 'active_cooldown'::text;
    return;
  end if;

  if v_until is not null and v_until <= v_now then
    v_recent := '{}'::timestamptz[];
    v_until := null;
  end if;

  select coalesce(array_agg(t order by t), '{}'::timestamptz[])
    into v_recent
    from unnest(coalesce(v_recent, '{}'::timestamptz[])) as t
    where t > v_now - interval '60 minutes';

  v_count := coalesce(cardinality(v_recent), 0);

  -- First 25 are accepted; the 26th triggers a one-hour cooldown.
  if v_count >= 25 then
    v_recent := v_recent || v_now;
    v_until := v_now + interval '60 minutes';
    update public.spartan_intel_throttle_state
      set recent_attempts = v_recent, throttle_until = v_until,
          total_throttles = total_throttles + 1, last_seen_at = v_now,
          last_reason = '26th_submission_within_60_minutes'
      where province_id = p_province_id;
    insert into public.spartan_intel_throttle_events
      (province_id, triggered_at, attempt_count, window_minutes, cooldown_minutes, reason)
    values (p_province_id, v_now, v_count + 1, 60, 60, '26th_submission_within_60_minutes');
    return query select false, 3600, v_count + 1, true,
      '26th_submission_within_60_minutes'::text;
    return;
  end if;

  v_recent := v_recent || v_now;
  update public.spartan_intel_throttle_state
    set recent_attempts = v_recent, throttle_until = null, last_seen_at = v_now, last_reason = null
    where province_id = p_province_id;
  return query select true, 0, v_count + 1, false, 'within_limit'::text;
end;
$$;

revoke all on function public.spartan_record_intel_attempt(text) from public, anon, authenticated;
grant execute on function public.spartan_record_intel_attempt(text) to service_role;
