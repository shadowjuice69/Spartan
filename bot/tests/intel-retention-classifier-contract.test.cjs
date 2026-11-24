const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const classifier = fs.readFileSync(path.join(root, 'lib/spartan/capture-classifier.ts'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261124000100_align_intel_retention_classes.sql'), 'utf8')

test('database retention constraint accepts every classifier retention class', () => {
  const typeBlock = classifier.match(/retentionClass:\s*'([^']+)'(?:\s*\|\s*'([^']+)')+/)
  assert.ok(typeBlock, 'classifier retention class union should exist')
  const declared = [...classifier.matchAll(/retentionClass:\s*'([^']+)'|\|\s*'([^']+)'/g)]
    .flatMap(match => [match[1], match[2]].filter(Boolean))
  const uniqueClasses = [...new Set(declared)]
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
