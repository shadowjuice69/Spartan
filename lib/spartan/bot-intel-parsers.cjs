function linesFor(record) {
  return String(record?.raw_text || '').replace(/\r/g, '').split(/\n|\\n/).map(line => line.trim()).filter(Boolean);
}

function timestampFor(record) {
  return record?.captured_at || record?.created_at || null;
}

function parseBotMagicReports(records = []) {
  const reports = [];
  const seen = new Set();
  for (const record of records) {
    if (record?.source !== 'discord-bot') continue;
    const at = timestampFor(record);
    const sourceId = String(record.source_id || record.id || '');
    linesFor(record).forEach((line, lineIndex) => {
      const key = sourceId + ':' + lineIndex;
      if (seen.has(key)) return;
      const match = line.match(/^\s*:(star2|comet):(?::(green_heart|broken_heart):)?\s*(.+?)#\s*<<__(.+?)__(?:\s*\*\*\|\s*(.+?)\s*\((\d+:\d+)\)\*\*)?>>\s*(.*)$/i);
      if (!match) return;
      seen.add(key);
      const remainder = String(match[7] || '');
      const duration = remainder.match(/^\s*\*{0,2}([\d,]+)\*{0,2}(?:\s|\||$)/);
      const fail = match[2] === 'broken_heart' || /__FAIL__|\bspell fails\b/i.test(remainder);
      const success = match[2] === 'green_heart' || /\bspell succeeds\b/i.test(remainder);
      const lost = remainder.match(/(?:-|−)\s*([\d,]+)\s+wizards?/i);
      reports.push({
        at, caster: String(match[3] || '').trim(), spell: String(match[4] || '').replace(/_/g, ' ').trim(),
        targetProvince: match[5] ? match[5].trim() : null, targetKingdom: match[6] || null,
        outcome: fail ? 'failed' : success ? 'success' : 'unknown',
        durationDays: duration ? Number(duration[1].replace(/,/g, '')) : null,
        wizardsLost: lost ? Number(lost[1].replace(/,/g, '')) : 0,
        sourceId, recordId: record.id || null, lineIndex, rawText: line,
      });
    });
  }
  return reports.sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''));
}

function parseBotThieveryReports(records = []) {
  const reports = [];
  const seen = new Set();
  for (const record of records) {
    if (record?.source !== 'discord-bot') continue;
    const at = timestampFor(record);
    const sourceId = String(record.source_id || record.id || '');
    linesFor(record).forEach((line, lineIndex) => {
      const key = sourceId + ':' + lineIndex;
      if (seen.has(key)) return;
      const match = line.match(/^\s*:detective:(?::(green_heart|broken_heart):)?\s*(.+?)#\s*<<__(.+?)__\s*\*\*\|\s*(.+?)\s*\((\d+:\d+)\)\*\*>>\s*(.*)$/i);
      if (!match) return;
      seen.add(key);
      const remainder = String(match[6] || '');
      const sent = remainder.match(/(?:^|\|)\s*([\d,]+)\s+sent\s*\(([\d.]+)\)/i);
      const targetTpa = remainder.match(/\|\s*([\d.]+)\s*\(m\.([\d.]+)\)/i);
      const lost = remainder.match(/We lost\s+([\d,]+)\s+thie(?:f|ves)/i);
      const fail = match[1] === 'broken_heart' || /__FAIL__|\boperation failed\b/i.test(remainder);
      const success = match[1] === 'green_heart' || /\boperation was a success\b/i.test(remainder);
      reports.push({
        at, actor: String(match[2] || '').trim(), op: String(match[3] || '').replace(/_/g, ' ').trim(),
        province: String(match[4] || '').trim(), kingdom: match[5] || null,
        outcome: fail ? 'failed' : success ? 'success' : 'unknown',
        thievesSent: sent ? Number(sent[1].replace(/,/g, '')) : null,
        ownTpa: sent ? Number(sent[2]) : null,
        targetTpa: targetTpa ? Number(targetTpa[1]) : null,
        targetModifiedTpa: targetTpa ? Number(targetTpa[2]) : null,
        thievesLost: lost ? Number(lost[1].replace(/,/g, '')) : 0,
        sourceId, recordId: record.id || null, lineIndex, rawText: line,
      });
    });
  }
  return reports.sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''));
}


function parseBotAidTransfers(records = []) {
  const reports = [];
  const seen = new Set();
  for (const record of records) {
    if (record?.source !== 'discord-bot') continue;
    const at = timestampFor(record);
    const sourceId = String(record.source_id || record.id || '');
    linesFor(record).forEach((line, lineIndex) => {
      const key = sourceId + ':' + lineIndex;
      if (seen.has(key)) return;
      const match = line.match(/^\s*:moneybag:\s*(.+?)\s+\[([^\]]+)\]\s+sent\s+__(.+?)__\s+to\s+(.+?)\s+\[([^\]]+)\]\s*$/i);
      if (!match) return;
      seen.add(key);
      const resources = [...String(match[3] || '').matchAll(/([\d,]+)\s+([a-z][a-z ]*?)(?=\s+and\s+[\d,]+\s+|$)/gi)];
      resources.forEach((resource, resourceIndex) => {
        reports.push({
          at, sender: String(match[1] || '').trim(), senderHandle: String(match[2] || '').trim(),
          recipient: String(match[4] || '').trim(), recipientHandle: String(match[5] || '').trim(),
          amount: Number(resource[1].replace(/,/g, '')), resource: String(resource[2] || '').trim(),
          sourceId, recordId: record.id || null, lineIndex, resourceIndex, rawText: line,
        });
      });
    });
  }
  return reports.sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''));
}

module.exports = { parseBotMagicReports, parseBotThieveryReports, parseBotAidTransfers };
