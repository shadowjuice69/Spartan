-- Canonical identity boundary for scraper-owned data.
--
-- spartan_accounts.id is the internal Spartan owner ID.
-- spartan_accounts.auth_user_id is the Supabase Auth login ID.
-- spartan_access.discord_user_id is the Discord identity.
-- provinces.id is the Utopia province identity.
--
-- Capture devices and the capture vault store the Spartan account ID.
-- History tables currently retain Supabase Auth IDs for their existing ownership model.

create or replace function public.spartan_account_id_for(input_id uuid)
returns uuid
language sql
stable
security invoker
as $$
  select a.id
  from public.spartan_accounts a
  where a.id = input_id or a.auth_user_id = input_id
  limit 1
$$;

create or replace function public.normalize_spartan_capture_device_owner()
returns trigger
language plpgsql
security invoker
as $$
declare canonical_id uuid; current_status text;
begin
  canonical_id := public.spartan_account_id_for(new.owner_id);
  if canonical_id is null then
    raise exception 'Invalid Spartan capture owner identity: %', new.owner_id using errcode='23503';
  end if;

  select account_status into current_status
  from public.spartan_accounts
  where id = canonical_id;

  if current_status is distinct from 'active' then
    raise exception 'Spartan account is not permitted to use the scraper (status: %)', coalesce(current_status,'missing') using errcode='42501';
  end if;

  new.owner_id := canonical_id;
  return new;
end;
$$;

create or replace function public.normalize_spartan_capture_vault_owner()
returns trigger
language plpgsql
security invoker
as $$
declare canonical_id uuid; current_status text;
begin
  canonical_id := public.spartan_account_id_for(new.user_id);
  if canonical_id is null then
    raise exception 'Invalid Spartan capture owner identity: %', new.user_id using errcode='23503';
  end if;

  select account_status into current_status
  from public.spartan_accounts
  where id = canonical_id;

  if current_status is distinct from 'active' then
    raise exception 'Spartan account is not permitted to submit scraper captures (status: %)', coalesce(current_status,'missing') using errcode='42501';
  end if;

  new.user_id := canonical_id;
  return new;
end;
$$;

drop trigger if exists enforce_spartan_capture_device_owner_status on public.spartan_capture_devices;
drop trigger if exists enforce_spartan_capture_vault_owner_status on public.spartan_capture_vault;
drop trigger if exists a_normalize_spartan_capture_device_owner on public.spartan_capture_devices;
drop trigger if exists a_normalize_spartan_capture_vault_owner on public.spartan_capture_vault;

create trigger a_normalize_spartan_capture_device_owner
before insert or update of owner_id on public.spartan_capture_devices
for each row execute function public.normalize_spartan_capture_device_owner();

create trigger a_normalize_spartan_capture_vault_owner
before insert or update of user_id on public.spartan_capture_vault
for each row execute function public.normalize_spartan_capture_vault_owner();

-- Repair legacy rows that were written with the Supabase Auth ID.
update public.spartan_capture_devices d
set owner_id = a.id
from public.spartan_accounts a
where d.owner_id = a.auth_user_id;

update public.spartan_capture_vault v
set user_id = a.id
from public.spartan_accounts a
where v.user_id = a.auth_user_id;
