const test = require('node:test');
const assert = require('node:assert/strict');
const { isStructuredGameIntelMessage } = require('../services/spartanQueueProcessor');

test('accepts structured attack reports with casualty data', () => {
  assert.equal(isStructuredGameIntelMessage(':crossed_swords: ZzZz [**zzz#**] attacked __Plague Doctor__ (6:7)|captured: **26**|loss: **60 Skeletons, 9 Ghouls and 35 horses**|kills: **43**'), true);
});

test('accepts structured spy results but not casual mentions of spying', () => {
  assert.equal(isStructuredGameIntelMessage(':detective::green_heart: Finkster silen#  <<__spy on throne__ **| The Branch Manager (6:7)**>>|28 sent (0.13)|2.49 vs 4.32'), true);
  assert.equal(isStructuredGameIntelMessage('I will spy on them tomorrow, anyone online?'), false);
});

test('accepts structured dragon contributions and Kingdom News', () => {
  assert.equal(isStructuredGameIntelMessage(':dragon_face: __DRAGON__ Chapter One [mezl] sent __10 troops__ and weakened dragon by __91__ points!'), true);
  assert.equal(isStructuredGameIntelMessage(':new: NEW KDNEWS: April 3 of YR0 1 - Someone (6:7) invaded 9 - Finkster (6:8) and captured 18 acres of land.'), true);
});

test('rejects chat, tick announcements, and ordinary status chatter', () => {
  assert.equal(isStructuredGameIntelMessage('<@392716724144832514> 45k off 54k nw hit who?'), false);
  assert.equal(isStructuredGameIntelMessage('hey i need a sitter @here'), false);
  assert.equal(isStructuredGameIntelMessage('**5 minutes till new TICK! New date: Apr8YR0**'), false);
  assert.equal(isStructuredGameIntelMessage(':new: **UTOPIA HAS TICKED! New date: Apr8YR0**\nAnduin Lothar __incite riots__ expired'), false);
});
