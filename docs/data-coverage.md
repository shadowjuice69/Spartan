# Spartan data coverage

The authenticated dashboard at `/command/data-coverage` is a read-only inventory of the current user's Spartan data.

## Sources and ownership

- `spartan_capture_vault` is queried by the linked Spartan account ID. The inventory scans at most the newest 1,500 captures.
- `spartan_intel_records_with_archive` is counted by the same account ID, combining active Intel with archived records while preserving the original record identity.
- `spartan_province_history` and `spartan_event_history` are counted and sampled by the authenticated user ID, matching the dashboard page-model ownership convention.
- `spartan_data_flow` rows are included only when their capture IDs belong to the newest 200 captures in the authenticated account's sample. The flow table itself has no user ID column, so it is never queried as a global feed for this page.
- `spartan_province_registry` is filtered to the authenticated user ID and linked account ID. Normalized event rows resolve their province ID through this canonical registry; missing mappings remain null rather than reusing the Spartan account ID.

The endpoint returns field names and counts only. It does not return raw capture text or raw payloads to the browser.

## What the counts mean

- Capture field counts are the number of sampled capture records containing a matching key anywhere in the parsed payload.
- Province/event history field counts are non-null values in the newest 250 stored rows.
- Capture type destination labels are known or candidate consumers based on the existing Spartan page architecture. They are diagnostic routing hints, not proof that every field is rendered by every listed page.
- A missing field means no matching key/value was found in the sampled data. It does not prove that the game never exposes that field.
- Missing numeric values remain unknown. Do not substitute zero or infer population from peons, or home defense from total defense.

## Event history

The structured event normalizer accepts only recognized Utopia game-feed formats. It excludes ordinary Discord chatter. Discord attack reports preserve unit losses, return hours, kills, prisoners, spec credits, reported peasant counts, offense sent, and generals in the event payload. KDNEWS events preserve acres and people-killed counts when present. Event history uses stable capture/line source IDs and records capture-time timestamps where the source does not provide a precise event timestamp.

The Command Center, News, and War Room read normalized event history for the authenticated user. News deduplicates normalized rows against KDNEWS and MPNEWS before display. Return Tracker consumes the War Room event model, so it uses the same normalized combat events and reported return durations.

## Backfill safety

`scripts/backfill-structured-event-history.js` defaults to dry-run. Run `node scripts/backfill-structured-event-history.js --dry-run` to review scanned records, normalized event types, unrecognized records, unmapped owners, and sample events. Review the preview before using `--apply`. Applying the backfill writes only to `spartan_event_history` using `source_id` conflict handling; it does not modify the capture vault or Intel records.

## Province history display

The Province, Military, and War Room page models combine stored `spartan_province_history` rows with current-age Throne captures retained in `spartan_capture_vault`. The retained captures are parsed at read-time into chart snapshots; this does not write to the vault, history table, or capture pipeline. Both stored history and retained captures are bounded to the current age start when an age-log marker is available.

## Intel retention and archive bridge

- Expired `spartan_intel_records` rows are copied in full to the private `spartan_operational_archive` table. During the bridge phase, the daily cleanup archives expired Intel but deliberately keeps the hot rows so the currently deployed application continues to work.
- The cleanup function is scheduled daily by `pg_cron` at 09:00 UTC. The archive write is idempotent on (`source_table`, `source_id`). A separate retirement migration will remove expired hot rows only after archive-aware page reads have been deployed and verified.
- Application reads use `spartan_intel_records_with_archive`, a service-role-only view that returns active rows plus archived rows not present in the hot table. Active rows win if a row exists in both places.

- Aid captures are available in the dedicated `/command/aid` vertical, which extracts trade balance, resource availability, aid shipment notices, and incoming-aid settings from retained page text without changing capture ingestion.
- The view exposes `archived` and `archived_at` metadata. Intel Vertical labels expired or archived records as **last known**. Data Coverage counts archive copies directly from `spartan_operational_archive` using the embedded account owner ID, while its combined Intel total uses the de-duplicated read view; archived copies are therefore not double-counted.
- Archive data is a recovery bridge, not a claim that old intel is current. Page models preserve the original `captured_at` timestamp; consumers must display its age and never present archived data as live.
- Do not delete expired hot Intel, archived Intel, or retire the archive view until page-level reads have been verified against the archive and the replacement structured history is complete.
