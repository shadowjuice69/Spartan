'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function stub(relativePath, exports) {
  const resolved = require.resolve(path.join('..', relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  return resolved;
}
function unstub(...resolved) { for (const key of resolved) delete require.cache[key]; }

test('build recalculation sends only the build race and personality rules and retries bad JSON once', async () => {
  const prompts = [];
  let call = 0;
  const builds = [{ id: 1, name: 'elf mystic', race: 'Elf', personality: 'Mystic', author: 'a', buildings: { homes: 10 }, science: {}, military_requirement: {} }];
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: builds, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 1 }, error: null }) }) }) })
    })
  };
  const keys = [
    stub('services/supabase', { getClient: () => sb }),
    stub('services/logger', { info() {}, warn() {}, error() {} }),
    stub('services/openrouterService', {
      askOpenRouter: async (prompt) => {
        prompts.push(prompt);
        call += 1;
        return call === 1 ? 'Sure! Here is the updated build you asked for.' : '{"buildings":{"homes":12},"science":{},"military_requirement":{}}';
      }
    })
  ];
  const target = require.resolve('../services/buildAgeRecalculator');
  delete require.cache[target];
  try {
    const { recalculateBuildLibrary } = require('../services/buildAgeRecalculator');
    const rules = {
      races: { Elf: { archetype: 'Magic Focus TM' }, Avian: { archetype: 'AVIAN-ONLY-MARKER' } },
      personalities: { 'The Mystic': { archetype: 'Magic' }, 'The Rogue': { archetype: 'ROGUE-ONLY-MARKER' } },
      buildings: {}, science: {}, game_rules: {}, spells: {}, thievery: {}
    };
    const result = await recalculateBuildLibrary(117, 14, rules);
    assert.equal(prompts.length, 2);
    assert.equal(result.failed.length, 0);
    assert.equal(result.updated, 1);
    assert.match(prompts[0], /Magic Focus TM/);
    assert.match(prompts[0], /"Magic"/);
    assert.equal(/AVIAN-ONLY-MARKER|ROGUE-ONLY-MARKER/.test(prompts[0]), false);
    assert.match(prompts[1], /not valid JSON/);
  } finally {
    delete require.cache[target];
    unstub(...keys);
  }
});

test('a repeat Apply click on an already-approved update is ignored instead of erroring', async () => {
  const answers = [{ data: null, error: null }, { data: { id: 14, age_number: 117, status: 'approved' }, error: null }];
  let i = 0;
  const chain = { select() { return chain; }, eq() { return chain; }, maybeSingle() { return Promise.resolve(answers[i++]); } };
  const keys = [
    stub('services/supabase', { getClient: () => ({ from: () => chain }) }),
    stub('services/logger', { info() {}, warn() {}, error() {} }),
    stub('services/buildAgeRecalculator', { recalculateBuildLibrary: async () => ({}) })
  ];
  const target = require.resolve('../services/ageUpdateService');
  delete require.cache[target];
  try {
    const { approveAgeUpdate } = require('../services/ageUpdateService');
    const result = await approveAgeUpdate(14, 'admin');
    assert.deepEqual(result, { alreadyHandled: true, status: 'approved', age_number: 117 });
  } finally {
    delete require.cache[target];
    unstub(...keys);
  }
});
