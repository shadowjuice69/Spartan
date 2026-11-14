const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const migration = fs.readFileSync(
  path.join(__dirname, '../../supabase/migrations/20261108040000_archive_expired_intel_before_cleanup.sql'),
  'utf8'
)

test('expired Intel is archived and retained during the bridge phase', () => {
  const functionAt = migration.indexOf('create or replace function public.spartan_retention_cleanup()')
  const archiveAt = migration.indexOf("insert into public.spartan_operational_archive (source_table, source_id, archived_at, record)", functionAt)
  assert.ok(functionAt >= 0, 'retention function exists')
  assert.ok(archiveAt > functionAt, 'function archives Intel')
  assert.doesNotMatch(migration.slice(functionAt), /delete from public\.spartan_intel_records/i, 'bridge phase keeps hot Intel intact')
  assert.match(migration, /expired_intel_retained/i)
  assert.match(migration, /on conflict \(source_table, source_id\) do nothing/i)
  assert.match(migration, /current_row\.id::text = a\.source_id/i)
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

test('application consumers use the archive-aware Intel read view', () => {
  const consumers = [
    'app/api/page-models/route.ts',
    'app/api/intel-data/route.ts',
    'app/api/data-coverage/route.ts',
    'app/api/history/route.ts',
    'app/api/enemy-intel/route.ts',
    'app/api/front-line/route.ts',
    'app/api/intel-backlog/route.ts',
    'app/api/kingdom-data/route.ts',
  ].map(file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'))
  for (const source of consumers) assert.match(source, /spartan_intel_records_with_archive/)
  const coverage = consumers[2]
  assert.match(coverage, /from\('spartan_operational_archive'\)/)
  assert.match(coverage, /record->>user_id/)
  assert.match(consumers[7], /spartan_capture_vault/)
  assert.match(consumers[7], /byCapture/)
})

test('Aid has a dedicated page consumer', () => {
  const vertical = fs.readFileSync(path.join(__dirname, '../../components/spartan/IntelVerticalPage.tsx'), 'utf8')
  const route = fs.readFileSync(path.join(__dirname, '../../app/command/[section]/page.tsx'), 'utf8')
  assert.match(vertical, /title: "AID INTELLIGENCE"/)
  assert.match(route, /'aid'/)
  assert.match(vertical, /trade_balance: numberAfter\("Current trade balance"\)/)
  assert.match(vertical, /shipment: sent \?/)
  assert.match(vertical, /incoming_aid: incoming/)
})
