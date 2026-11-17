#!/usr/bin/env node
// One-time, opt-in backfill for structured Discord game reports already projected
// into spartan_intel_records. Dry-run is the default; pass --apply to write rows.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { parseStructuredNewsEvents } = require('../bot/services/spartanEventNormalizer');

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run');
  if (apply && dryRun) throw new Error('Choose either --dry-run or --apply, not both.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Set Supabase URL and service-role/secret key before running this script.');
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pageSize = 500;
  let offset = 0, scanned = 0, parsed = 0, skippedOwner = 0, unrecognized = 0, missingProvince = 0, written = 0;
  const eventTypes = {};
  const samples = [];

  while (true) {
    const { data, error } = await db.from('spartan_intel_records')
      .select('capture_id,user_id,province_id,kingdom_id,captured_at,age,game_year,game_tick,raw_text')
      .eq('source', 'discord-bot').in('page_kind', ['news', 'attack'])
      .not('raw_text', 'is', null)
      .order('captured_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Intel read failed: ${error.message}`);
    const records = data || [];
    if (!records.length) break;
    scanned += records.length;
    const ownerIds = [...new Set(records.map(row => row.user_id).filter(Boolean))];
    const ownersResult = ownerIds.length
      ? await db.from('spartan_accounts').select('id,auth_user_id,province_name,province_location').in('id', ownerIds)
      : { data: [], error: null };
    if (ownersResult.error) throw new Error(`Account owner lookup failed: ${ownersResult.error.message}`);
    const ownerMap = new Map((ownersResult.data || []).map(row => [row.id, row]));
    const authIds = [...new Set((ownersResult.data || []).map(row => row.auth_user_id).filter(Boolean))];
    const registryResult = authIds.length
      ? await db.from('spartan_province_registry').select('province_id,user_id,province_name,kingdom_code').in('user_id', authIds)
      : { data: [], error: null };
    if (registryResult.error) throw new Error(`Province registry lookup failed: ${registryResult.error.message}`);
    const provinceMap = new Map((registryResult.data || []).map(row => [
      `${row.user_id}|${row.province_name}|${row.kingdom_code}`, row,
    ]));
    const rows = [];
    for (const record of records) {
      const owner = ownerMap.get(record.user_id);
      const userId = owner?.auth_user_id;
      if (!userId) { skippedOwner++; continue; }
      const canonicalProvince = provinceMap.get(`${userId}|${owner.province_name}|${owner.province_location}`);
      if (!canonicalProvince) missingProvince++;
      const events = parseStructuredNewsEvents(record.raw_text, {
        captureId: record.capture_id, capturedAt: record.captured_at,
        ownProvince: owner.province_name, ownKingdom: owner.province_location,
      });
      if (!events.length) unrecognized++;
      for (const event of events) {
        parsed++;
        eventTypes[event.event_type] = (eventTypes[event.event_type] || 0) + 1;
        if (samples.length < 12) samples.push({ province: owner.province_name, event_type: event.event_type, attacker: event.attacker, defender: event.defender, acres: event.acres_change, captured_at: record.captured_at });
        rows.push({
          user_id: userId, province_id: canonicalProvince?.province_id || null, kingdom_id: canonicalProvince?.kingdom_code || record.kingdom_id || owner.province_location || null,
          occurred_at: event.occurred_at, age: record.age || null, game_year: record.game_year || null,
          game_tick: record.game_tick || null, event_type: event.event_type, source: 'spartan-event-normalizer',
          source_id: event.source_id, attacker: event.attacker || null, defender: event.defender || null,
          target_kingdom: event.target_kingdom || null, acres_change: event.acres_change,
          troops_lost: event.troops_lost, thieves_lost: event.thieves_lost, wizards_lost: event.wizards_lost,
          payload: { ...event.payload, original_source: 'discord-bot', backfilled: true },
          raw_text: event.raw_text,
        });
      }
    }
    if (apply && rows.length) {
      const { error: writeError } = await db.from('spartan_event_history').upsert(rows, { onConflict: 'source_id' });
      if (writeError) throw new Error(`Event history write failed: ${writeError.message}`);
      written += rows.length;
    }
    offset += records.length;
    if (records.length < pageSize) break;
  }

  process.stdout.write(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run', scanned_intel_records: scanned,
    normalized_events: parsed, event_types: eventTypes, unrecognized_records: unrecognized,
    skipped_unmapped_owners: skippedOwner, missing_canonical_province: missingProvince,
    rows_written: written, sample_events: samples,
  }, null, 2) + '\n');
}

main().catch(error => {
  process.stderr.write(`[event-history-backfill] ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
