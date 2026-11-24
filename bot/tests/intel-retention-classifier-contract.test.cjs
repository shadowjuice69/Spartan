const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const classifier = fs.readFileSync(path.join(root, 'lib/spartan/capture-classifier.ts'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261124000100_align_intel_retention_classes.sql'), 'utf8')

test('database retention constraint accepts every classifier retention class', () => {
  const typeLine = classifier.match(/retentionClass:\s*([^\n]+)/)
  assert.ok(typeLine, 'classifier retention class union should exist')
  const uniqueClasses = [...new Set([...typeLine[1].matchAll(/'([a-z0-9_]+)'/g)].map(match => match[1]))]
  assert.ok(uniqueClasses.length >= 4, 'expected the classifier to declare retention classes')

  for (const retentionClass of uniqueClasses) {
    assert.match(
      migration,
      new RegExp("'" + retentionClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'::text"),
      'migration must allow ' + retentionClass
    )
  }
})

test('retention migration preserves the existing supported classes', () => {
  for (const retentionClass of ['intel_24h', 'intel_48h', 'intel_7d', 'permanent']) {
    assert.ok(migration.includes("'" + retentionClass + "'::text"))
  }
})
