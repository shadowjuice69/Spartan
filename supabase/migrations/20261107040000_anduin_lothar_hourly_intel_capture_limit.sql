-- Enforce a one-hour, province-wide Intel capture cooldown for Anduin Lothar.
-- The database lock makes the limit safe when multiple capture requests arrive together.

create table if not exists public.spartan_capture_rate_limits (
  province_id text primary key,
  last_accepted_at timestamptz not null
);

alter table public.spartan_capture_rate_limits enable row level security;
revoke all on public.spartan_capture_rate_limits from public, anon, authenticated;

insert into public.spartan_capture_rate_limits (province_id, last_accepted_at)
select
  'aeff76bc-0762-47d4-a329-5483c6f79e21',
  coalesce(max(created_at), '-infinity'::timestamptz)
from public.spartan_capture_vault
where province_id = 'aeff76bc-0762-47d4-a329-5483c6f79e21'
on conflict (province_id) do update
set last_accepted_at = greatest(
  public.spartan_capture_rate_limits.last_accepted_at,
  excluded.last_accepted_at
);

create or replace function public.spartan_claim_capture_slot(p_province_id text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_province_id is null or btrim(p_province_id) = '' then
    raise exception 'province_id is required';
  end if;

  insert into public.spartan_capture_rate_limits (province_id, last_accepted_at)
  values (p_province_id, '-infinity'::timestamptz)
  on conflict (province_id) do nothing;

  select last_accepted_at
    into v_last
    from public.spartan_capture_rate_limits
   where province_id = p_province_id
   for update;

  if v_last > v_now - interval '1 hour' then
    return query
      select false,
        greatest(1, ceil(extract(epoch from (v_last + interval '1 hour' - v_now)))::integer);
    return;
  end if;

  update public.spartan_capture_rate_limits
     set last_accepted_at = v_now
   where province_id = p_province_id;

  return query select true, 0;
end;
$$;

revoke all on function public.spartan_claim_capture_slot(text) from public, anon, authenticated;
grant execute on function public.spartan_claim_capture_slot(text) to service_role;
