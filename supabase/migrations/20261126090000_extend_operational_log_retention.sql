-- Extend extra retention cleanup with a 30-day cap for operational Discord Bot
-- event logs and security activity logs. Canonical Intel, capture-vault history,
-- province history, operational archives, war records, and security sessions
-- are intentionally not touched by this migration.

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
  v_bot_event_logs bigint;
  v_security_activity_logs bigint;
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

  delete from public.spartan_bot_events
   where created_at < now() - interval '30 days';
  get diagnostics v_bot_event_logs = row_count;

  delete from public.spartan_security_events
   where created_at < now() - interval '30 days';
  get diagnostics v_security_activity_logs = row_count;

  return jsonb_build_object(
    'vault_throne', v_throne,
    'vault_bot_events', v_bot,
    'steward_events', v_events,
    'steward_runs', v_runs,
    'bot_event_logs_30d', v_bot_event_logs,
    'security_activity_logs_30d', v_security_activity_logs,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.spartan_retention_cleanup_extra() from public, anon, authenticated;
