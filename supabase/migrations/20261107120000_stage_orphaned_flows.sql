-- Prevent duplicate active queue entries for a single flow while retaining completed/failed history.
create unique index if not exists spartan_processing_queue_one_active_flow_idx
  on public.spartan_processing_queue (flow_id)
  where status in ('pending', 'processing', 'retry');

-- Re-stage received/retry flows whose original queue insertion was missed.
-- A vault-backed capture is required so the worker can safely load the payload.
create or replace function public.spartan_stage_orphan_flows(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staged integer := 0;
begin
  with candidates as (
    select f.flow_id, f.created_at
      from public.spartan_data_flow f
     where f.status in ('received', 'retry')
       and f.capture_id is not null
       and exists (
         select 1
           from public.spartan_capture_vault v
          where v.capture_id = f.capture_id
       )
       and not exists (
         select 1
           from public.spartan_processing_queue q
          where q.flow_id = f.flow_id
       )
     order by f.created_at asc
     for update of f skip locked
     limit greatest(1, least(coalesce(p_limit, 100), 500))
  ),
  inserted as (
    insert into public.spartan_processing_queue
      (flow_id, priority, status, attempts, available_at, created_at)
    select flow_id, 100, 'pending', 0, now(), created_at
      from candidates
    on conflict do nothing
    returning id
  )
  select count(*)::integer into v_staged from inserted;

  return v_staged;
end;
$function$;

revoke all on function public.spartan_stage_orphan_flows(integer) from public, anon, authenticated;
grant execute on function public.spartan_stage_orphan_flows(integer) to service_role;

-- One-time recovery of currently orphaned, vault-backed flows.
select public.spartan_stage_orphan_flows(100) as staged_orphan_flows;
