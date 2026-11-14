-- Extra retention (already applied to Supabase Nov 14 2026 as retention_cleanup_extra):
-- old Throne vault pages and bot events after 7 days, steward runs/events after 2 days.
create or replace function public.spartan_retention_cleanup_extra()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_throne bigint;
  v_bot bigint;
  v_events bigint;
  v_runs bigint;
begin
  delete from public.spartan_capture_vault
   where page_kind = 'throne'
     and created_at < now() - interval '7 days';
  get diagnostics v_throne = row_count;

  delete from public.spartan_capture_vault
   where page_kind = 'bot_event'
     and created_at < now() - interval '7 days';
  get diagnostics v_bot = row_count;

  delete from public.spartan_steward_events
   where created_at < now() - interval '2 days';
  get diagnostics v_events = row_count;

  delete from public.spartan_steward_runs
   where created_at < now() - interval '2 days';
  get diagnostics v_runs = row_count;

  return jsonb_build_object(
    'vault_throne', v_throne,
    'vault_bot_events', v_bot,
    'steward_events', v_events,
    'steward_runs', v_runs,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.spartan_retention_cleanup_extra() from public, anon, authenticated;

select cron.schedule(
  'spartan-retention-cleanup-extra',
  '10 9 * * *',
  $cron$select public.spartan_retention_cleanup_extra()$cron$
);
