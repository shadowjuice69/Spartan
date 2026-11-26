# Retained Discord Bot Intel recovery runbook

## Scope and safety

This is a one-time, operator-invoked recovery for exactly six retained Discord events from October 27, 2026. It is not part of the normal queue worker, startup backfill, or scheduled jobs.

The allowlist is embedded in `bot/services/retainedBotEventRecovery.js`. Each event is pinned to its original capture ID, Discord message ID, queue ID for audit context, and exact `spartan_data_flow.flow_id`.

Queue 11488 is intentionally excluded. Its source is classified as `source_missing_unresolved`; do not replay or reconstruct it.

## Dry run

Run:

```bash
node bot/scripts/recover-retained-bot-events.js
```

The default mode is read-only. It checks source events, original flows, author metadata, message IDs, capture IDs, and existing canonical Intel. It does not invoke the projector or write data.

Review all six results. Any rejected or missing source is a stop condition; do not broaden the allowlist.

## Explicit execution gate

Execution requires both:

```bash
SPARTAN_RECOVER_BOT_EVENTS=1 node bot/scripts/recover-retained-bot-events.js --execute
```

The runner uses the canonical Spartan Supabase target guard in `bot/services/supabase.js`. The normal queue worker and its retry policy are not invoked or modified by this runner.

For each event the recovery path:
1. Loads only the allowlisted `spartan_bot_events` row and its exact original `spartan_data_flow` row.
2. Requires `metadata.author_bot = true`, a non-empty body, and the allowlisted Discord message ID.
3. Checks both `bot-UUID` and bare UUID capture IDs, then checks the Discord `source_id`.
4. Builds a vault-less capture using the original event timestamp and payload.
5. Calls the existing Bot Intel classifier/projection code in recovery mode.
6. Uses a plain INSERT, with `UNIQUE(capture_id)` as the final race-condition guard. A unique conflict is treated as an idempotent skip.
7. Writes `source_vault_id = null`; it never fabricates a vault row or extends the original 48-hour expiry.

The script does not update queue rows, flow rows, data edges, retention settings, age state, or capture pipeline configuration.

## Post-execution verification

Run these read-only checks after an explicitly authorized execution.

### 1. Inspect all six expected captures and message IDs

```sql
select capture_id, source_id, page_kind, intel_type, source_vault_id,
       retention_class, captured_at, expires_at, created_at
from public.spartan_intel_records
where capture_id in (
  'bot-0c975d16-094c-4d5b-80b8-498ed6234fb5',
  'bot-1a5e34ca-7248-4bfc-b777-8caf0b93d000',
  'bot-038c6d6d-8bdf-4135-8118-9762c25e0910',
  'bot-b248deca-1a6d-4c72-9cbd-b895a0791842',
  'bot-edf8edf3-7ec5-478a-96ab-87782077c0a1',
  'bot-d5e2d94d-19bd-4b17-9173-036159680afd'
)
or source_id in (
  '1564522035852349561',
  '1564522293000929331',
  '1564522337460682854',
  '1564522380750233632',
  '1564522509087539261',
  '1564560942488879216'
)
order by created_at;
```

### 2. No duplicate capture IDs among the six

```sql
select capture_id, count(*)
from public.spartan_intel_records
where capture_id in (
  'bot-0c975d16-094c-4d5b-80b8-498ed6234fb5',
  'bot-1a5e34ca-7248-4bfc-b777-8caf0b93d000',
  'bot-038c6d6d-8bdf-4135-8118-9762c25e0910',
  'bot-b248deca-1a6d-4c72-9cbd-b895a0791842',
  'bot-edf8edf3-7ec5-478a-96ab-87782077c0a1',
  'bot-d5e2d94d-19bd-4b17-9173-036159680afd'
)
group by 1
having count(*) > 1;
```

Expected: zero rows.

### 3. Queue 11488 remains unresolved and has no canonical Intel projection

```sql
select count(*) as intel_for_11488_capture
from public.spartan_intel_records
where capture_id in (
  'bot-931c2242-3ec9-4e70-8328-6fd4d0fafc96',
  '931c2242-3ec9-4e70-8328-6fd4d0fafc96'
)
or source_id = '1564560812998135859';
```

Expected: zero, consistent with the pre-recovery baseline. Do not modify queue 11488.

### 4. Idempotency

Record the six-event row count after the first execution. Run the same gated command again only if separately authorized. The second run must report zero inserts and the database count must remain unchanged.

## Pass criteria

- First run inserts no more than six rows, all from the fixed allowlist.
- A second run inserts zero rows.
- No duplicate capture IDs.
- `source_vault_id = null` is accepted.
- Original `captured_at` and original 48-hour expiry are preserved.
- Queue 11488 remains unresolved and absent from canonical Intel.
