-- Reliability and query-performance hardening for the Spartan processing pipeline.
-- This migration is intentionally additive: it does not replay or delete existing records.

create index if not exists spartan_processing_queue_claim_idx
  on public.spartan_processing_queue (priority desc, created_at asc, available_at asc)
  where status in ('pending', 'retry');

create index if not exists spartan_processing_queue_stale_lease_idx
  on public.spartan_processing_queue (locked_at asc)
  where status = 'processing' and locked_at is not null;

create index if not exists spartan_processing_queue_flow_id_idx
  on public.spartan_processing_queue (flow_id);

create index if not exists spartan_data_flow_flow_id_idx
  on public.spartan_data_flow (flow_id);

create index if not exists spartan_data_flow_status_created_idx
  on public.spartan_data_flow (status, created_at asc);

create index if not exists spartan_data_flow_capture_source_kind_idx
  on public.spartan_data_flow (capture_id, source, page_kind);

create index if not exists spartan_data_edges_flow_event_id_idx
  on public.spartan_data_edges (flow_id, event_type, id desc);

create index if not exists spartan_steward_events_flow_created_idx
  on public.spartan_steward_events (flow_id, created_at desc)
  where flow_id is not null;

create index if not exists spartan_steward_events_queue_created_idx
  on public.spartan_steward_events (queue_id, created_at desc)
  where queue_id is not null;

create index if not exists spartan_steward_runs_capture_created_idx
  on public.spartan_steward_runs (capture_id, created_at desc)
  where capture_id is not null;

-- Recover abandoned queue leases. A worker that dies leaves status='processing';
-- its locked_at timestamp is the lease. After 30 minutes another worker can claim it.
-- Items already at the retry ceiling are marked failed instead of looping forever.
create or replace function public.claim_spartan_queue(
  p_worker text,
  p_limit integer default 10
)
returns table (
  id bigint,
  flow_id uuid,
  priority integer,
  processor text,
  status text,
  attempts integer,
  available_at timestamptz,
  locked_at timestamptz,
  completed_at timestamptz,
  error jsonb,
  created_at timestamptz
)
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Terminalize expired leases that have exhausted the processor's five-attempt policy.
  with exhausted as (
    update public.spartan_processing_queue q
       set status = 'failed',
           locked_at = null,
           error = coalesce(q.error, '{}'::jsonb) || jsonb_build_object(
             'message', 'Worker lease expired after retry limit',
             'recovered_at', now(),
             'attempts', q.attempts
           )
     where q.status = 'processing'
       and q.locked_at < now() - interval '30 minutes'
       and q.attempts >= 5
    returning q.flow_id
  )
  update public.spartan_data_flow f
     set status = 'failed',
         stage = 'processor',
         current_stage = 'processor',
         error = coalesce(f.error, '{}'::jsonb) || jsonb_build_object(
           'message', 'Worker lease expired after retry limit',
           'recovered_at', now()
         )
   where f.flow_id in (select exhausted.flow_id from exhausted);

  return query
  with candidates as (
    select q.id
      from public.spartan_processing_queue q
     where (
       (q.status in ('pending', 'retry') and q.available_at <= now())
       or
       (q.status = 'processing'
        and q.locked_at is not null
        and q.locked_at < now() - interval '30 minutes'
        and q.attempts < 5)
     )
     order by q.priority desc, q.created_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 10), 100))
  ),
  claimed as (
    update public.spartan_processing_queue q
       set status = 'processing',
           processor = coalesce(nullif(p_worker, ''), 'spartan-processor'),
           attempts = q.attempts + 1,
           locked_at = now(),
           error = case
             when q.status = 'processing' then
               coalesce(q.error, '{}'::jsonb) || jsonb_build_object(
                 'message', 'Recovered expired worker lease',
                 'recovered_at', now(),
                 'previous_processor', q.processor
               )
             else null
           end
      from candidates c
     where q.id = c.id
    returning q.*
  )
  select claimed.id, claimed.flow_id, claimed.priority, claimed.processor,
         claimed.status, claimed.attempts, claimed.available_at,
         claimed.locked_at, claimed.completed_at, claimed.error,
         claimed.created_at
    from claimed;
end;
$function$;

revoke all on function public.claim_spartan_queue(text, integer) from public, anon, authenticated;
grant execute on function public.claim_spartan_queue(text, integer) to service_role;
