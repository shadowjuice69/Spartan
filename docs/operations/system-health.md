# Spartan System Health

## Endpoints

- `GET /api/health` is a public liveness check. It confirms that the Next.js process can answer a request; it does not query Supabase and is not a readiness check.
- `GET /api/health/capture` requires a signed-in, active Spartan account. It reports only that account's province capture and processing status.
- `/command/system-health` is the signed-in dashboard view of the account-scoped capture health endpoint.

## Dashboard interpretation

- Capture freshness is sampled from the latest 500 capture receipts for the active province.
- Recent flow status is sampled from the latest 500 flows.
- Open/failed flow count is separately queried for up to 1,000 flows in `received`, `retry`, `failed`, or `quarantined` states so older backlog is not hidden by the recent sample.
- Stale processing means a queue item has remained `processing` with a lock older than 30 minutes.
- Queue counts cover the sampled recent flows plus all queried open/failed flows; they are not global kingdom totals.

## Processing rules

- Discord `bot_event` records are Intel-only. They must never create or update `spartan_state_projection` rows.
- Ordinary page captures may merge partial-page state into a prior projection. If the prior projection was sourced from a legacy bot event, its wrapper fields are discarded before merging.
- The queue recovery migration uses the existing `claim_spartan_queue(text, integer)` signature and treats `locked_at` as a 30-minute worker lease. The existing five-attempt ceiling remains in effect.
- Operational archive retention is separate from raw capture and province-history retention. Terminal queue rows are archived after 30 days; old provenance edges are archived after 90 days only when their flow is terminal and has no live queue item; processed/failed flows are archived after 90 days. Pending, retry, processing, and other recoverable work is excluded.

## Render configuration

After the liveness endpoint is deployed, the Render service health-check path can be set to `/api/health` in the service settings. The endpoint is intentionally public and returns no account, database, or credential data.
