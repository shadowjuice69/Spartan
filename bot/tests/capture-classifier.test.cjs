const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '../..')
const source = fs.readFileSync(path.join(root, 'lib/spartan/capture-classifier.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
})
const classifierModule = { exports: {} }
vm.runInNewContext(compiled.outputText, {
  exports: classifierModule.exports,
  module: classifierModule,
})
const { classifyCapture } = classifierModule.exports

test('war URL routes receive age-end retention', () => {
  for (const url of [
    'https://utopia-game.com/gen/war',
    'https://utopia-game.com/gen/war?view=current',
    'https://utopia-game.com/gen/war/forum',
    'https://utopia-game.com/wol/war_forum/topics/',
  ]) {
    const result = classifyCapture(url, '', '')
    assert.equal(result.pageKind, 'war', url)
    assert.equal(result.retentionClass, 'war_until_age_end', url)
    assert.equal(result.source, 'url', url)
  }
})

test('war substring matches do not classify unrelated URLs as war', () => {
  for (const url of [
    'https://utopia-game.com/gen/forward',
    'https://utopia-game.com/gen/hardware',
  ]) {
    const result = classifyCapture(url, '', '')
    assert.notEqual(result.pageKind, 'war', url)
    assert.equal(result.retentionClass, 'intel_48h', url)
  }
})

test('a query-only war reference does not override a specific science route', () => {
  const result = classifyCapture('https://utopia-game.com/gen/science?ref=war', '', '')
  assert.equal(result.pageKind, 'science')
  assert.equal(result.retentionClass, 'intel_48h')
})

test('a query-only war reference does not override province state', () => {
  const result = classifyCapture('https://utopia-game.com/gen/province?ref=war', '', '')
  assert.equal(result.pageKind, 'province_state')
  assert.equal(result.retentionClass, 'intel_48h')
})

test('only explicit war scraper kinds receive age-end fallback retention', () => {
  for (const scraperKind of ['war', 'war_forum']) {
    const result = classifyCapture('', '', scraperKind)
    assert.equal(result.pageKind, scraperKind)
    assert.equal(result.source, 'fallback')
    assert.equal(result.retentionClass, 'war_until_age_end')
  }
})

test('generic UtopiaIntel and throne scraper fallbacks remain 48-hour retention', () => {
  for (const scraperKind of ['utopiaintel', 'throne']) {
    const result = classifyCapture('', '', scraperKind)
    assert.equal(result.pageKind, scraperKind)
    assert.equal(result.source, 'fallback')
    assert.equal(result.retentionClass, 'intel_48h')
  }
})
