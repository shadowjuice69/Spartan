-- Preserve operational history in an archive before removing old rows from hot tables.
-- The existing daily spartan-retention-cleanup cron job calls spartan_retention_cleanup().

create table if not exists public.spartan_operational_archive (
  source_table text not null,
  source_id text not null,
  archived_at timestamptz not null default now(),
  record jsonb not null,
  primary key (source_table, source_id)
);

create index if not exists spartan_operational_archive_archived_at_idx
  on public.spartan_operational_archive (archived_at desc);

alter table public.spartan_operational_archive enable row level security;
revoke all on public.spartan_operational_archive from public, anon, authenticated;
grant select on public.spartan_operational_archive to service_role;

create or replace function public.spartan_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_events bigint;
  v_runs bigint;
  v_issues bigint;
  v_intel bigint;
  v_queue bigint;
  v_edges bigint;
  v_flows bigint;
begin
  -- Keep the existing short-lived Intel and steward diagnostic retention rules.
  delete from public.spartan_intel_records
   where expires_at is not null and expires_at < now();
  get diagnostics v_intel = row_count;

  delete from public.spartan_steward_events
   where created_at < now() - interval '7 days';
  get diagnostics v_events = row_count;

  delete from public.spartan_steward_runs
   where created_at < now() - interval '7 days';
  get diagnostics v_runs = row_count;

  delete from public.spartan_system_issues
   where status = 'resolved'
     and last_detected_at < now() - interval '14 days';
  get diagnostics v_issues = row_count;

  -- Archive terminal queue rows after 30 days. Pending, retry, and processing
  -- items are never eligible, so this cannot erase recoverable work.
  with removed as (
    delete from public.spartan_processing_queue q
     where q.status in ('completed', 'failed')
       and coalesce(q.completed_at, q.created_at) < now() - interval '30 days'
    returning q.id, to_jsonb(q) as record
  )
  insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)
  select 'spartan_processing_queue', removed.id::text, now(), removed.record
    from removed
  on conflict (source_table, source_id) do nothing;
  get diagnostics v_queue = row_count;

  -- Preserve provenance edges for 90 days in the hot table, then archive them.
  with removed as (
    delete from public.spartan_data_edges e
     where e.created_at < now() - interval '90 days'
    returning e.id, to_jsonb(e) as record
  )
  insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)
  select 'spartan_data_edges', removed.id::text, now(), removed.record
    from removed
  on conflict (source_table, source_id) do nothing;
  get diagnostics v_edges = row_count;

  -- Only archive completed/failed flows after 90 days and only when no live
  -- queue item still references them. The full row remains recoverable in archive.
  with removed as (
    delete from public.spartan_data_flow f
     where f.status in ('processed', 'failed')
       and coalesce(f.processed_at, f.created_at) < now() - interval '90 days'
       and not exists (
         select 1 from public.spartan_processing_queue q where q.flow_id = f.flow_id
       )
    returning f.id, to_jsonb(f) as record
  )
  insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)
  select 'spartan_data_flow', removed.id::text, now(), removed.record
    from removed
  on conflict (source_table, source_id) do nothing;
  get diagnostics v_flows = row_count;

  return jsonb_build_object(
    'expired_intel', v_intel,
    'steward_events', v_events,
    'steward_runs', v_runs,
    'resolved_issues', v_issues,
    'archived_queue', v_queue,
    'archived_edges', v_edges,
    'archived_flows', v_flows,
    'ran_at', now()
  );
end;
$function$;

revoke all on function public.spartan_retention_cleanup() from public, anon, authenticated;
grant execute on function public.spartan_retention_cleanup() to service_role;
