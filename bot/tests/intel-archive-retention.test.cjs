const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const migration = fs.readFileSync(
  path.join(__dirname, '../../supabase/migrations/20261108040000_archive_expired_intel_before_cleanup.sql'),
  'utf8'
)

test('expired Intel is archived before cleanup deletes it', () => {
  const archiveAt = migration.indexOf("insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)")
  const deleteAt = migration.indexOf('delete from public.spartan_intel_records i')
  assert.ok(archiveAt >= 0, 'archive insert exists')
  assert.ok(deleteAt > archiveAt, 'hot-table delete follows archive insert')
  assert.match(migration, /on conflict \(source_table, source_id\) do nothing/i)
  assert.match(migration, /a\.source_id = i\.id::text/i)
})

test('archive read view is private and prefers active hot rows', () => {
  assert.match(migration, /create or replace view public\.spartan_intel_records_with_archive/i)
  assert.match(migration, /security_invoker = true/i)
  assert.match(migration, /not exists\s*\(\s*select 1\s*from public\.spartan_intel_records current_row/i)
  assert.match(migration, /revoke all on public\.spartan_intel_records_with_archive from public, anon, authenticated/i)
  assert.match(migration, /grant select on public\.spartan_intel_records_with_archive to service_role/i)
})

test('existing daily cleanup function keeps the other retention jobs', () => {
  for (const table of ['spartan_steward_events', 'spartan_steward_runs', 'spartan_system_issues', 'spartan_processing_queue', 'spartan_data_edges', 'spartan_data_flow']) {
    assert.match(migration, new RegExp('public\\.' + table))
  }
  assert.match(migration, /spartan_retention_cleanup\(\)/)
})
