# Spartan data coverage

The authenticated dashboard at `/command/data-coverage` is a read-only inventory of the current user's Spartan data.

## Sources and ownership

- `spartan_capture_vault` is queried by the linked Spartan account ID. The inventory scans at most the newest 1,500 captures.
- `spartan_intel_records` is counted by the same account ID.
- `spartan_province_history` and `spartan_event_history` are counted and sampled by the authenticated user ID, matching the dashboard page-model ownership convention.
- `spartan_data_flow` rows are included only when their capture IDs belong to the authenticated account's latest capture sample. The flow table itself has no user ID column, so it is never queried as a global feed for this page.
- `spartan_province_registry` is filtered to the authenticated user ID and linked account ID.

The endpoint returns field names and counts only. It does not return raw capture text or raw payloads to the browser.

## What the counts mean

- Capture field counts are the number of sampled capture records containing a matching key anywhere in the parsed payload.
- Province/event history field counts are non-null values in the newest 250 stored rows.
- Capture type destination labels are known or candidate consumers based on the existing Spartan page architecture. They are diagnostic routing hints, not proof that every field is rendered by every listed page.
- A missing field means no matching key/value was found in the sampled data. It does not prove that the game never exposes that field.
- Missing numeric values remain unknown. Do not substitute zero or infer population from peons, or home defense from total defense.

## Event history

The structured event normalizer accepts only recognized Utopia game-feed formats. It excludes ordinary Discord chatter. Event history uses stable capture/line source IDs and records capture-time timestamps where the source does not provide a precise event timestamp.

The News page reads the normalized event history for the authenticated user and deduplicates it against the existing KDNEWS and MPNEWS feed before display.

## Backfill safety

`scripts/backfill-structured-event-history.js` defaults to dry-run. Review the printed scan/parse/owner counts before using `--apply`. Applying the backfill writes only to `spartan_event_history` using `source_id` conflict handling; it does not modify the capture vault or Intel records.
