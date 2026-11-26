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

test('rankCategory gap is exact targetShare minus haveShare', () => {
  // weights 60/40 → target shares 0.6 / 0.4
  // books 900/100 → have shares 0.9 / 0.1
  // gaps: Alchemy 0.6-0.9 = -0.3, Channeling 0.4-0.1 = 0.3
  const { rows } = rankCategory(
    {
      Alchemy: { type: 'weight', value: 60 },
      Channeling: { type: 'weight', value: 40 },
    },
    { alchemy: 900, channeling: 100 }
  );

  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.ok(Math.abs(byName.Channeling.gap - 0.3) < 1e-12);
  assert.ok(Math.abs(byName.Alchemy.gap - -0.3) < 1e-12);
  assert.equal(byName.Channeling.have, 100);
  assert.equal(byName.Alchemy.have, 900);
});

test('zero-book sciences rank ahead when they have positive weight', () => {
  const { rows } = rankCategory(
    {
      Sorcery: { type: 'weight', value: 6 },
      Channeling: { type: 'weight', value: 10 },
    },
    { sorcery: 0, channeling: 100000 }
  );

  assert.equal(rows[0].name, 'Sorcery');
  assert.equal(rows[0].have, 0);
  assert.ok(rows[0].gap > rows[1].gap);
});

test('all zero books: ranking falls back to weight order via equal haveShare', () => {
  // haveShare is 0 for all → gap === targetShare === weight/totalWeight
  const { rows, totalBooks } = rankCategory(
    {
      A: { type: 'weight', value: 10 },
      B: { type: 'weight', value: 5 },
      C: { type: 'weight', value: 1 },
    },
    { a: 0, b: 0, c: 0 }
  );

  assert.equal(totalBooks, 0);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['A', 'B', 'C']
  );
  assert.ok(Math.abs(rows[0].gap - 10 / 16) < 1e-12);
  assert.ok(Math.abs(rows[1].gap - 5 / 16) < 1e-12);
});

test('zero total weight yields zero gaps and stable rows', () => {
  const { rows, totalWeight } = rankCategory(
    {
      A: { type: 'weight', value: 0 },
      B: { type: 'weight', value: 0 },
    },
    { a: 50, b: 50 }
  );

  assert.equal(totalWeight, 0);
  for (const row of rows) assert.equal(row.gap, 0);
});

test('empty category yields no ranked or fixed sciences', () => {
  const { rows, fixed, totalBooks, totalWeight } = rankCategory({}, { a: 100 });

  assert.deepEqual(rows, []);
  assert.deepEqual(fixed, []);
  assert.equal(totalBooks, 0);
  assert.equal(totalWeight, 0);
});

test('fixed-% never appears in ranked rows even with zero books', () => {
  const { rows, fixed } = rankCategory(
    {
      Crime: { type: 'actual_pct', value: 15 },
      Alchemy: { type: 'weight', value: 100 },
    },
    { crime: 0, alchemy: 0 }
  );

  assert.deepEqual(
    rows.map((r) => r.name),
    ['Alchemy']
  );
  assert.deepEqual(fixed, [{ name: 'Crime', value: 15 }]);
});

test('categoryLines Invest next uses top three by gap including zero-book', () => {
  const lines = categoryLines(
    'military',
    {
      Resilience: { type: 'weight', value: 10 },
      Heroism: { type: 'weight', value: 7 },
      Siege: { type: 'weight', value: 5 },
      Tactics: { type: 'weight', value: 10 },
    },
    { resilience: 20337, heroism: 3597, siege: 0, tactics: 150630 }
  );

  const next = lines.find((l) => l.startsWith('Invest next:'));
  assert.ok(next);
  // Siege (0 books) and Heroism should outrank overloaded Tactics
  assert.match(next, /Siege/);
  assert.match(next, /Heroism/);
  assert.ok(!next.includes('Tactics') || next.indexOf('Siege') < next.indexOf('Tactics'));
});

