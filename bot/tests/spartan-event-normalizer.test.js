const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStructuredNewsEvents } = require('../services/spartanEventNormalizer');

test('normalizes structured Discord attack reports and extracts losses/return time', () => {
  const [event] = parseStructuredNewsEvents(
    ':crossed_swords: Finkster [**silen#**] attacked __Ayoko na mag Utopia__ (3:11)|captured: **34**|loss: **113 Griffins and 129 horses**|kills: **45 (+87 prisoners)**|return: 12.38',
    { captureId: 'capture-1', capturedAt: '2026-11-07T15:38:46.550Z' },
  );
  assert.equal(event.event_type, 'attack');
  assert.equal(event.attacker, 'Finkster');
  assert.equal(event.defender, 'Ayoko na mag Utopia');
  assert.equal(event.target_kingdom, '3:11');
  assert.equal(event.acres_change, 34);
  assert.equal(event.troops_lost, 113);
  assert.equal(event.payload.unit_losses.horses, 129);
  assert.equal(event.payload.return_hours, 12.38);
  assert.equal(event.payload.normalizer, 'spartan-event-normalizer');
});

test('normalizes NEW KDNEWS attacks while excluding unrelated bot chatter', () => {
  const events = parseStructuredNewsEvents(
    'NEW KDNEWS: 6 - Ayoko na mag Utopia (3:11) invaded 9 - Finkster (6:8) and captured 75 acres of land.\\nAttempted to send message to zzzz which failed.',
    { captureId: 'capture-2', capturedAt: '2026-11-07T14:13:28.976Z' },
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'invaded');
  assert.equal(events[0].attacker, 'Ayoko na mag Utopia');
  assert.equal(events[0].defender, 'Finkster');
  assert.equal(events[0].target_kingdom, '6:8');
  assert.equal(events[0].acres_change, 75);
});

test('normalizes incoming province reports and preserves unknown losses', () => {
  const [event] = parseStructuredNewsEvents(
    'Forces from Rainbow Tomatoes (2:10) came through and ravaged our lands! They captured 46 acres! We lost 12 thieves and 9 wizards.',
    { captureId: 'capture-3', ownProvince: 'Finkster', ownKingdom: '6:8' },
  );
  assert.equal(event.event_type, 'incoming_attack');
  assert.equal(event.attacker, 'Rainbow Tomatoes');
  assert.equal(event.defender, 'Finkster');
  assert.equal(event.acres_change, 46);
  assert.equal(event.thieves_lost, 12);
  assert.equal(event.wizards_lost, 9);
});

test('normalizes dated Utopia kingdom news and recapture lines', () => {
  const events = parseStructuredNewsEvents(
    'November 7 of YR1 6 - Finkster (6:8) recaptured 24 acres of land from 6 - Ayoko (3:11)\\nNovember 7 of YR1 6 - Finkster (6:8) invaded 9 - Target (3:11) and captured 18 acres of land',
    { captureId: 'capture-4', capturedAt: '2026-11-07T16:00:00.000Z' },
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].event_type, 'recaptured');
  assert.equal(events[0].acres_change, 24);
  assert.equal(events[1].event_type, 'invaded');
  assert.equal(events[1].acres_change, 18);
});
