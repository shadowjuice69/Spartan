-- Preserve expired Intel before retention removes it from the hot table.
-- The archive is private (service_role only); the read view is also service_role only.

-- One-time, additive backfill. Re-running is safe and never deletes a hot row.
insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)
select 'spartan_intel_records', i.id::text, now(), to_jsonb(i)
from public.spartan_intel_records i
where i.expires_at is not null
  and i.expires_at < now()
on conflict (source_table, source_id) do nothing;

-- Present active rows and archived rows through one compatible read surface.
-- Active rows win if a row temporarily exists in both places.
create or replace view public.spartan_intel_records_with_archive
with (security_invoker = true)
as
select i.*, false as archived, null::timestamptz as archived_at
from public.spartan_intel_records i
union all
select archived_record.*, true as archived, a.archived_at
from public.spartan_operational_archive a
cross join lateral jsonb_populate_record(
  null::public.spartan_intel_records,
  a.record
) as archived_record
where a.source_table = 'spartan_intel_records'
  and not exists (
    select 1
    from public.spartan_intel_records current_row
    where current_row.id::text = a.source_id
  );

revoke all on public.spartan_intel_records_with_archive from public, anon, authenticated;
grant select on public.spartan_intel_records_with_archive to service_role;

-- Keep the existing cleanup schedule and all other retention behavior.
-- The only behavior change is that expired Intel is copied to the private archive
-- before it is deleted from the hot table.
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
  v_intel_archived bigint;
  v_queue bigint;
  v_edges bigint;
  v_flows bigint;
begin
  insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)
  select 'spartan_intel_records', i.id::text, now(), to_jsonb(i)
    from public.spartan_intel_records i
   where i.expires_at is not null
     and i.expires_at < now()
  on conflict (source_table, source_id) do nothing;
  get diagnostics v_intel_archived = row_count;

  -- Bridge phase: keep expired rows in the hot table so the currently
  -- deployed application continues to work until the archive-aware reader
  -- is deployed and verified. A later, separate retirement migration may
  -- remove these rows after that verification.
  select count(*) into v_intel
    from public.spartan_intel_records i
   where i.expires_at is not null
     and i.expires_at < now();

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
       and not exists (
         select 1
           from public.spartan_data_flow f
          where f.flow_id = e.flow_id
            and (
              f.status not in ('processed', 'failed')
              or exists (
                select 1 from public.spartan_processing_queue q where q.flow_id = f.flow_id
              )
            )
       )
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
    'expired_intel_retained', v_intel,
    'newly_archived_intel', v_intel_archived,
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

notify pgrst, 'reload schema';
