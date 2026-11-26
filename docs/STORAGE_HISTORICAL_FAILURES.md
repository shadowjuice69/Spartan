# Storage steward — historical unrecoverable failures

## Policy

- Leave all six rows as `processing_status = 'failed'`.
- Preserve their original `failure_reason`, `failed_at`, and other row data.
- Do not reset them to `stored`, delete them, or automatically retry them.
- These are documented historical gaps, not recoverable Intel.
- The storage worker selects only `processing_status = 'stored'`; these six rows therefore do not re-enter the worker.

## Investigation and disposition

Investigated in November 2026. No recoverable payload or linked record was found in:

- `spartan_intel_records` (destination)
- `spartan_capture_vault` (source)
- age archive schemas
- flow / data-flow records
- processing queue
- steward events

Conclusion: unrecoverable; no payload remains to restore.

## Capture IDs

| Capture ID | Recorded failure | Failed at (UTC) |
| --- | --- | --- |
| `3a94f784-f515-4b0e-9c64-174ce84f3710` | Vault source could not be deleted after destination verification | 2026-09-30 11:53:41 |
| `ed25f197-a8dc-4e84-b9d1-ccaeb982ea77` | Vault source could not be deleted after destination verification | 2026-09-30 11:53:44 |
| `6c202ff5-51ea-431d-94ad-98f88e22f346` | Vault source could not be deleted after destination verification | 2026-10-02 04:47:53 |
| `0e459fa9-ba9f-43e0-aefc-e8714a72c5e0` | Vault source could not be deleted after destination verification | 2026-10-02 04:47:54 |
| `ce15f3af-594a-4df4-b065-b4f5c829cceb` | Vault source could not be deleted after destination verification | 2026-10-02 15:35:27 |
| `2cae1328-4607-4cd6-be2c-c9f202949202` | upstream request timeout | 2026-10-27 10:01:40 |

All six rows were recorded with one processing attempt.

## Registry health interpretation

`spartan_steward_registry.error_count` is a lifetime cumulative counter. It is historical telemetry, not an open-incident count. Do not decrement or rewrite it to make the dashboard appear healthy.

The registry's `last_status` and `metadata.last_cycle` describe the most recent cycle only. A current `pass` does not erase the historical error total.

A historical-failure list is also stored under:

`spartan_steward_registry.metadata.historical_unrecoverable_failures`

It contains the six capture IDs, documentation timestamp, policy, and disposition note. The registry metadata update did not modify the six storage rows or the lifetime counters.

## Verification checklist

Run these read-only checks before calling the historical-failure documentation complete.

### Six rows remain unchanged

```sql
select capture_id, processing_status, failure_reason, failed_at, processing_attempts
from public.spartan_internal_storage
where capture_id in (
  '2cae1328-4607-4cd6-be2c-c9f202949202',
  'ce15f3af-594a-4df4-b065-b4f5c829cceb',
  '0e459fa9-ba9f-43e0-aefc-e8714a72c5e0',
  '6c202ff5-51ea-431d-94ad-98f88e22f346',
  'ed25f197-a8dc-4e84-b9d1-ccaeb982ea77',
  '3a94f784-f515-4b0e-9c64-174ce84f3710'
)
order by failed_at;
```

Expected: exactly six rows, all still `failed`, with their original reasons/timestamps and one attempt. Compare with the capture-ID table above.

### Worker selection remains unchanged

Inspect `lib/spartan/internal-storage.ts` and confirm `processStorageQueue` still selects only:

```ts
.eq('processing_status', 'stored')
```

Do not broaden the worker query to include failed rows.

### Latest steward cycle

```sql
select
  steward_key,
  last_status,
  metadata -> 'last_cycle' as last_cycle,
  error_count,
  processed_count
from public.spartan_steward_registry
where steward_key = 'storage';
```

`last_cycle` should describe the latest worker run (including its timestamp and per-cycle failed count); it should not count the six historical rows again. `error_count` remains lifetime cumulative.

### Active-failure query

Use this query for operational active-incident lists and counts. It excludes only the six documented IDs from registry metadata; any other failed row (including a row with a null capture ID) remains visible.

```sql
select
  s.id,
  s.capture_id,
  s.failure_reason,
  s.failed_at,
  s.processing_attempts
from public.spartan_internal_storage s
where s.processing_status = 'failed'
  and not exists (
    select 1
    from public.spartan_steward_registry r
    cross join lateral jsonb_array_elements_text(
      coalesce(
        r.metadata #> '{historical_unrecoverable_failures,capture_ids}',
        '[]'::jsonb
      )
    ) as historical(capture_id)
    where r.steward_key = 'storage'
      and historical.capture_id = s.capture_id::text
  )
order by coalesce(s.failed_at, s.updated_at) desc;
```

Expected at the verification checkpoint: zero rows, unless genuine new failures have occurred. For an active count, wrap the same filtered query in `select count(*)`. Do not use the raw count of every `processing_status = 'failed'` row as the active-incident total.
