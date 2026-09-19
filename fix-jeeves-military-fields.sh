#!/data/data/com.termux/files/usr/bin/bash
# Run from repo root: bash fix-jeeves-military-fields.sh
#
# spartan_province_history has columns for soldiers/off_specs/def_specs/elites/
# thieves/wizards/offense/defense, but nothing has ever populated them, so
# Jeeves showed 0 for all of them. Only acres/networth worked, via a small
# live-parser fallback (parseLive) that reads the Throne page's resource-bar
# table straight out of the raw captured DOM.
#
# The Throne page also has a second table (class="column-stats") with all the
# military numbers — but off-spec/def-spec/elite unit names are RACE-FLAVORED
# (a Halfling's off-spec is "Strongarms", not "Off Specialists"), so they can't
# be matched by label text. This patch parses that table POSITIONALLY instead
# (the row/column layout is fixed regardless of race) and feeds those values
# into the same live-fallback path already used for acres/networth.
#
# Note: Mana and Stealth are NOT on the Throne page at all (confirmed against
# a real capture) — those live on the Wizards/Thievery pages respectively,
# which the scraper doesn't capture yet. This patch does not add those two;
# they'll need their own page captures + parser later.
set -e

cat > ./_fix-jeeves-fields.js << 'EOF'
const fs = require('fs');
const path = 'app/api/welcome/route.ts';
let src = fs.readFileSync(path, 'utf8');

const oldParseLive = `function parseLive(raw: unknown) { const h = String(raw || ''); const m = h.match(/<table[^>]*id="resource-bar"[\\s\\S]*?<tbody>[\\s\\S]*?<tr>([\\s\\S]*?)<\\/tr>/i); if (!m) return null; const c = [...m[1].matchAll(/<th[^>]*>\\s*([^<]+?)\\s*<\\/th>/gi)].map(x => x[1].replace(/,/g, '').trim()); if (c.length < 6) return null; const [gold, population, food, runes, networth, acres] = c.map(num); return { acres, networth, population, gold, food, runes } }`;

const newParseLive = `function parseLive(raw: unknown) { const h = String(raw || ''); const out: Row = {}; const m = h.match(/<table[^>]*id="resource-bar"[\\s\\S]*?<tbody>[\\s\\S]*?<tr>([\\s\\S]*?)<\\/tr>/i); if (m) { const c = [...m[1].matchAll(/<th[^>]*>\\s*([^<]+?)\\s*<\\/th>/gi)].map(x => x[1].replace(/,/g, '').trim()); if (c.length >= 6) { const [gold, population, food, runes, networth, acres] = c.map(num); Object.assign(out, { acres, networth, population, gold, food, runes }) } } const cm = h.match(/column-stats[\\s\\S]*?<tbody>([\\s\\S]*?)<\\/tbody>/i); if (cm) { const cells = [...cm[1].matchAll(/<td[^>]*>([\\s\\S]*?)<\\/td>/gi)].map(x => x[1]); const firstNumber = (cellHtml: string) => { const t = String(cellHtml || '').replace(/<[^>]+>/g, ' '); const mm = t.match(/-?[\\d,]+(?:\\.\\d+)?/); return mm ? Number(mm[0].replace(/,/g, '')) : null }; if (cells.length >= 20) { Object.assign(out, { acres: out.acres ?? firstNumber(cells[4]), networth: out.networth ?? firstNumber(cells[18]), gold: out.gold ?? firstNumber(cells[10]), food: out.food ?? firstNumber(cells[12]), runes: out.runes ?? firstNumber(cells[14]), population: out.population ?? firstNumber(cells[6]), soldiers: firstNumber(cells[1]), off_specs: firstNumber(cells[3]), def_specs: firstNumber(cells[5]), elites: firstNumber(cells[7]), thieves: firstNumber(cells[9]), wizards: firstNumber(cells[11]), war_horses: firstNumber(cells[13]), prisoners: firstNumber(cells[15]), offense: firstNumber(cells[17]), defense: firstNumber(cells[19]) }) } } return Object.keys(out).length ? out : null }`;

if (!src.includes(oldParseLive)) { console.error('parseLive BLOCK NOT FOUND — aborting, no changes made.'); process.exit(1); }
src = src.replace(oldParseLive, newParseLive);

const oldState = `const state: Row = { acres: live?.acres ?? num(latest.acres), networth: live?.networth ?? num(latest.networth), population: live?.population ?? num(latest.population), soldiers: num(latest.soldiers), off_specs: num(latest.off_specs), def_specs: num(latest.def_specs), elites: num(latest.elites), thieves: num(latest.thieves), wizards: num(latest.wizards), offense: num(latest.offense), defense: num(latest.defense), mana: num(latest.mana), stealth: num(latest.stealth) };`;

const newState = `const state: Row = { acres: live?.acres ?? num(latest.acres), networth: live?.networth ?? num(latest.networth), population: live?.population ?? num(latest.population), soldiers: live?.soldiers ?? num(latest.soldiers), off_specs: live?.off_specs ?? num(latest.off_specs), def_specs: live?.def_specs ?? num(latest.def_specs), elites: live?.elites ?? num(latest.elites), thieves: live?.thieves ?? num(latest.thieves), wizards: live?.wizards ?? num(latest.wizards), offense: live?.offense ?? num(latest.offense), defense: live?.defense ?? num(latest.defense), mana: num(latest.mana), stealth: num(latest.stealth) };`;

if (!src.includes(oldState)) { console.error('state BLOCK NOT FOUND — aborting, no changes made.'); process.exit(1); }
src = src.replace(oldState, newState);

fs.writeFileSync(path, src);
console.log('patched OK');
EOF

node ./_fix-jeeves-fields.js
rm ./_fix-jeeves-fields.js

echo ""
echo "Done. Fields now live-parsed from the Throne page: soldiers, off_specs, def_specs,"
echo "elites, thieves, wizards, war_horses, prisoners, offense, defense."
echo "Still not populated: mana, stealth (not present on the Throne page)."
echo ""
echo "Next: git add -A && git commit -m 'Jeeves: live-parse military fields from Throne column-stats table' "
echo "      git fetch && git merge origin/main && git push"
