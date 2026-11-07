const crypto = require('crypto');

const number = (value) => {
  if (value == null || value === '') return null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const cleanParty = (value) => String(value || '').replace(/^\s*\d+\s*-\s*/, '').replace(/\s+/g, ' ').trim();

function unitLosses(value) {
  const result = { troops: 0, thieves: 0, wizards: 0, horses: 0, raw: String(value || '').trim() };
  for (const match of String(value || '').matchAll(/([\d,]+)\s+([a-z][a-z -]*)/gi)) {
    const count = number(match[1]) || 0;
    const unit = match[2].toLowerCase();
    if (/thief/.test(unit)) result.thieves += count;
    else if (/wizard/.test(unit)) result.wizards += count;
    else if (/horse/.test(unit)) result.horses += count;
    else result.troops += count;
  }
  return result;
}

function parseStructuredNewsEvents(rawText, options = {}) {
  const text = String(rawText || '').replace(/\u00a0/g, ' ');
  const expanded = text.replace(/(?=\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s+of\s+YR\d+\s+)/gi, '\\n');
  const lines = expanded.split(/\r?\n|\\n/).map((line) => line.trim()).filter(Boolean);
  const capturedAt = options.capturedAt && Number.isFinite(Date.parse(options.capturedAt))
    ? new Date(options.capturedAt).toISOString()
    : new Date().toISOString();
  const captureId = String(options.captureId || 'capture');
  const events = [];

  lines.forEach((line, index) => {
    let event = null;
    const botAttack = line.match(/^\s*(?::[a-z0-9_]+:\s*)?(.+?)\s+\[\*\*.*?\*\*\]\s+(attacked|invaded|recaptured|captured|ambushed|pillaged|looted)\s+__(.+?)__\s*\((\d+:\d+)\)/i);
    if (botAttack) {
      const action = botAttack[2].toLowerCase();
      const captured = line.match(/\b(?:captured|recaptured):\s*\*{0,2}([\d,]+)/i);
      const loss = line.match(/\bloss:\s*\*{0,2}([^|]+)/i);
      const losses = unitLosses(loss?.[1] || '');
      const returnMatch = line.match(/\breturn:\s*([\d.]+)/i);
      event = {
        event_type: action === 'attacked' ? 'attack' : action,
        attacker: cleanParty(botAttack[1]),
        defender: botAttack[3].trim(),
        target_kingdom: botAttack[4],
        acres_change: number(captured?.[1]),
        troops_lost: losses.troops || null,
        thieves_lost: losses.thieves || null,
        wizards_lost: losses.wizards || null,
        payload: { format: 'discord_attack_report', action, unit_losses: losses, return_hours: number(returnMatch?.[1]), normalizer: 'spartan-event-normalizer' },
      };
    }

    if (!event) {
      const kdNews = line
        .replace(/^\s*(?::[a-z0-9_]+:\s*)?NEW KDNEWS:\s*/i, '')
        .replace(/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s+of\s+YR\d+\s+/i, '');
      const recapture = kdNews.match(/^(.+?)\s+\((\d+:\d+)\)\s+(recaptured|captured)\s+([\d,]+)\s+acres?\s+of\s+land\s+from\s+(.+?)\s+\((\d+:\d+)\)/i);
      if (recapture) {
        event = {
          event_type: recapture[3].toLowerCase(),
          attacker: cleanParty(recapture[1]),
          defender: cleanParty(recapture[5]),
          target_kingdom: recapture[6],
          acres_change: number(recapture[4]),
          payload: { format: 'utopia_news', normalizer: 'spartan-event-normalizer' },
        };
      } else {
        const match = kdNews.match(/^(.+?)\s+\((\d+:\d+)\)\s+(invaded|recaptured|captured|ambushed|attacked|pillaged|looted)\s+(.+?)\s+\((\d+:\d+)\)(?:\s+and\s+(?:captured|took)\s+([\d,]+)\s+acres?)?/i);
        if (match) {
          event = {
            event_type: match[3].toLowerCase(),
            attacker: cleanParty(match[1]),
            defender: cleanParty(match[4]),
            target_kingdom: match[5],
            acres_change: number(match[6]),
            payload: { format: line.startsWith('NEW KDNEWS:') ? 'discord_kdnews' : 'utopia_news', normalizer: 'spartan-event-normalizer' },
          };
        }
      }
    }

    if (!event) {
      const incoming = line.match(/Forces from (.+?)\s+\((\d+:\d+)\) came through and ravaged our lands! They captured ([\d,]+) acres! We lost (.+?)(?:\.|$)/i);
      if (incoming) {
        const losses = unitLosses(incoming[4]);
        event = {
          event_type: 'incoming_attack',
          attacker: cleanParty(incoming[1]),
          defender: options.ownProvince || null,
          target_kingdom: options.ownKingdom || null,
          acres_change: number(incoming[3]),
          troops_lost: losses.troops || null,
          thieves_lost: losses.thieves || null,
          wizards_lost: losses.wizards || null,
          payload: { format: 'province_report', unit_losses: losses, normalizer: 'spartan-event-normalizer' },
        };
      }
    }

    if (!event) return;
    const digest = crypto.createHash('sha1').update(line).digest('hex').slice(0, 12);
    events.push({
      ...event,
      occurred_at: capturedAt,
      source_id: `${captureId}:event:${index}:${digest}`,
      raw_text: line,
      payload: { ...event.payload, capture_id: captureId, observed_at: capturedAt },
    });
  });

  return events;
}

module.exports = { parseStructuredNewsEvents, unitLosses };
