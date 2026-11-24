const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bookKey,
  booksMapFromParsed,
  formatBuildLabel,
  rankCategory,
  categoryLines,
  buildPlanLines,
} = require('../services/investPlan');

test('bookKey normalizes science names', () => {
  assert.equal(bookKey('  Channeling  '), 'channeling');
  assert.equal(bookKey(null), '');
});

test('booksMapFromParsed normalizes names and safely handles invalid counts', () => {
  assert.deepEqual(
    booksMapFromParsed([
      { name: 'Alchemy', books: '1200' },
      { name: 'CHANNELING', books: 'not-a-number' },
      { name: '', books: 50 },
    ]),
    { alchemy: 1200, channeling: 0 }
  );
});

test('rankCategory ranks by share deficit rather than raw book count', () => {
  const result = rankCategory(
    {
      Alchemy: { type: 'weight', value: 60 },
      Channeling: { type: 'weight', value: 40 },
    },
    { alchemy: 900, channeling: 100 }
  );

  assert.equal(result.rows[0].name, 'Channeling');
  assert.equal(result.rows[1].name, 'Alchemy');
  assert.equal(result.totalWeight, 100);
  assert.equal(result.totalBooks, 1000);
});

test('fixed actual_pct sciences are listed separately and not ranked', () => {
  const result = rankCategory(
    {
      Alchemy: { type: 'weight', value: 100 },
      Crime: { type: 'actual_pct', value: 12.5 },
    },
    { alchemy: 400 }
  );

  assert.deepEqual(result.fixed, [{ name: 'Crime', value: 12.5 }]);
  assert.deepEqual(result.rows.map((row) => row.name), ['Alchemy']);
});

test('categoryLines shows ranked recommendations and fixed targets', () => {
  const lines = categoryLines(
    'arcane',
    {
      Alchemy: { type: 'weight', value: 70 },
      Channeling: { type: 'weight', value: 30 },
      Crime: { type: 'actual_pct', value: 10 },
    },
    { alchemy: 900, channeling: 100 }
  );

  assert.ok(lines.some((item) => item.includes('Invest next: **Channeling**')));
  assert.ok(lines.some((item) => item.includes('Crime — target 10%')));
  assert.match(lines[0], /🔮/);
});

test('buildPlanLines formats build metadata and inactive warning', () => {
  const output = buildPlanLines({
    provinceName: 'Finkster',
    build: {
      name: 'Mystic',
      race: 'Elf',
      personality: 'Mystic',
      active: false,
      science: { arcane: { Alchemy: { type: 'weight', value: 100 } } },
    },
    currentBooks: { alchemy: 250 },
  });

  assert.ok(output.includes('Investment Plan — Finkster'));
  assert.ok(output.includes('Build: **Mystic** (Elf Mystic)'));
  assert.ok(output.includes('inactive'));
});
