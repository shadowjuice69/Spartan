# Age reset runbook (`spartan_start_new_age`)

## Hard rules

- **Never** run a confirmed age transition while the current game age is still active.
- Confirm the in-game age has actually ended before proceeding. A database age value or a preview is not proof that the game age has ended.
- Always run the preview first. Omitting the confirmation argument (or passing `false`) is the non-writing preview.
- Run the confirmed form only after the preview has been reviewed, the age has ended in-game, and an operator explicitly authorizes the transition.
- War Intel classified as `war_until_age_end` remains live throughout the age. Under retention policy A, it is archived and cleared only by this age-transition procedure. Do not add a mid-age war expiry.
- Never reuse or overwrite an existing `age_<ending_age>` archive schema. If it already exists, stop and investigate; do not attempt to force the transition.

## Function calls

Replace both placeholders with the verified game ages. The new age must be greater than the ending age.

```sql
-- Preview only; no writes.
select public.spartan_start_new_age(<ending_age>, <new_age>);

-- Confirmed transition; archives and clears live game tables.
-- Run only after the age has ended in-game and the preview is approved.
select public.spartan_start_new_age(<ending_age>, <new_age>, true);
```

Do not copy an example age pair blindly. In particular, do not run a 117 → 118 confirmed transition while Age 117 is still active.

## Preview checklist — all items must be reviewed

1. The returned JSON explicitly reports `preview: true`.
2. `ending_age` and `new_age` match the actual game transition; `new_age > ending_age`.
3. The target archive schema `age_<ending_age>` does not already exist. If it exists, stop.
4. Read every warning:
   - New-age rules not loaded: resolve the rules-loading plan before proceeding; do not assume the SQL function loads wiki rules.
   - Builds pinned to the prior age: record the count and verify the bot age-update workflow will recalculate them.
   - Any other warning: understand and resolve it before confirmation.
5. Review `rows_before` and `will_clear`, including Intel records, capture vault, processing queue, data flows/edges, province history, event history, and other listed tables. Counts should be plausible for the ending age.
6. Confirm the age has actually ended in-game. If it is still active, stop here; do not run the confirmed statement.

## Confirmed transition

Only after every checklist item passes and the operator authorizes it, run the confirmed function call once.

The procedure creates `age_<ending_age>`, copies the configured live tables (including `spartan_intel_records`) into the archive, clears the configured live game tables, performs its documented registry/log cleanup, updates `bot_settings.current_age` when moving forward, and records the transition in `spartan_age_log`.

Do not rerun the confirmed call just because a client timed out. First inspect `spartan_age_log`, the archive schema, and `bot_settings.current_age` to determine whether the transition already completed.

## Post-transition verification

Run these checks only after a confirmed transition. They are read-only. Replace `<ending_age>` in the archive query with the actual numeric age schema suffix (for example, schema `age_117`).

```sql
-- Latest transition log entries.
select *
from public.spartan_age_log
order by created_at desc
limit 5;

-- Current age setting.
select *
from public.bot_settings
where key = 'current_age';

-- Confirm the archive schema exists.
select schema_name
from information_schema.schemata
where schema_name = 'age_<ending_age>';

-- Confirm archived Intel count.
-- Replace age_<ending_age> with the actual schema identifier before running.
select count(*) as archived_intel_count
from age_<ending_age>.spartan_intel_records;

-- Live Intel should be empty immediately after reset, or contain only
-- legitimate captures created after the transition.
select count(*) as live_intel_count
from public.spartan_intel_records;
```

Compare `archived_intel_count` with the preview's `rows_before` count for `spartan_intel_records`. Investigate any discrepancy; account for any legitimate writes between preview and transition rather than assuming counts must match exactly. For live Intel, distinguish post-reset captures from rows that should have been archived; do not delete rows to force a zero count.

Then verify that expected archive tables exist and contain the rows indicated by the preview, and that the live tables were cleared as described by `will_clear`. Check the bot's age/rules status and confirm builds were recalculated for the new age.

If the archive, log, current-age setting, or live-table counts disagree, stop and investigate. Do not repeat the confirmed transition or manually clear data to make the counts match.

## Current operational note

Age 117 is the active age at the time this runbook was written. Age 117 has not finished, and Age 118 has not started. The 117 → 118 preview was read-only; no confirmed transition is authorized or due. Keep all Age 117 Intel and war records intact until Age 117 actually ends and the operator authorizes the transition.
