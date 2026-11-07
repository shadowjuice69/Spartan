-- Remove derived province projections whose only source was a Discord bot event.
-- The raw capture vault, bot Intel records, and all other audit history remain intact.
-- Apply only after the processor code that excludes bot_event projections is live.

delete from public.spartan_state_projection p
using public.spartan_data_flow f
where f.flow_id = p.source_flow_id
  and f.source = 'discord-bot'
  and f.page_kind = 'bot_event';
