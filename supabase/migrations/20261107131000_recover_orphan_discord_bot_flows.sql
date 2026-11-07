-- Recover Discord bot event flows that were persisted without a queue row.
-- The function is idempotent: a flow is queued only when no queue row exists.
-- A ten-minute age threshold avoids racing normal capture-to-queue ingestion.

create or replace function public.spartan_recover_orphan_bot_event_flows()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inserted integer;
begin
  -- Serialize the scheduled sweep and any manual invocation.
  perform pg_advisory_xact_lock(73102, 1);

  insert into public.spartan_processing_queue (
    flow_id,
    priority,
    processor,
    status,
    attempts,
    available_at,
    stage,
    payload
  )
  select
    f.flow_id,
    100,
    'spartan-orphan-recovery',
    'pending',
    0,
    now(),
    'orphan_recovery',
    jsonb_build_object(
      'recovered_by', 'spartan_recover_orphan_bot_event_flows',
      'reason', 'received Discord bot event flow had no queue row',
      'original_created_at', f.created_at
    )
  from public.spartan_data_flow f
  where f.source = 'discord-bot'
    and f.page_kind = 'bot_event'
    and f.status = 'received'
    and f.created_at < now() - interval '10 minutes'
    and exists (
      select 1
      from public.spartan_capture_vault c
      where c.capture_id = f.capture_id
    )
    and not exists (
      select 1
      from public.spartan_processing_queue q
      where q.flow_id = f.flow_id
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

revoke all on function public.spartan_recover_orphan_bot_event_flows() from public, anon, authenticated;
grant execute on function public.spartan_recover_orphan_bot_event_flows() to service_role;

-- Run once immediately to recover the already-stranded events.
select public.spartan_recover_orphan_bot_event_flows();

-- Continue checking every five minutes. The ten-minute guard prevents racing
-- ordinary ingestion, and the function's advisory lock + NOT EXISTS are idempotent.
select cron.schedule(
  'spartan-orphan-flow-recovery',
  '*/5 * * * *',
  'select public.spartan_recover_orphan_bot_event_flows();'
);
