'use strict';

const { PDFParse } = require('pdf-parse');

function normalizePdfText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\u000C/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countTables(text) {
  const source = String(text || '');
  let count = 0;
  if (/\bRace\s+Archetype\b[\s\S]{0,300}\bBonuses\b/i.test(source)) count++;
  if (/\bPersonality\s+Archetype\b[\s\S]{0,300}\bBonuses\b/i.test(source)) count++;
  if (/^\s*={20,}\s*$/m.test(source) && /^\s*\d+\.\s+(?:dragons|rituals|races|personalities)\b/im.test(source)) count++;
  if (/^\s*(?:Ritual\s+Effect|Dragons?\s+Effect)\s*$/im.test(source)) count++;
  return count;
}

/**
 * Extract PDF text while preserving the parser's line boundaries. pdf-parse v2
 * exposes page text as well as combined text; use the combined form when available
 * and join page text as a compatibility fallback.
 */
async function extractPdfTableText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('Invalid PDF buffer: missing %PDF header');
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ cellSeparator: '\t', cellThreshold: 1, lineEnforce: true });
    const pageText = Array.isArray(result?.pages)
      ? result.pages.map((page) => page?.text || '').filter(Boolean).join('\n')
      : '';
    const text = normalizePdfText(result?.text || pageText);
    let detectedTables = 0;
    if (typeof parser.getTable === 'function') {
      try {
        const tableResult = await parser.getTable();
        detectedTables = (tableResult?.pages || []).reduce((total, page) => total + (Array.isArray(page?.tables) ? page.tables.length : 0), 0);
      } catch { /* Text extraction remains the fallback when vector table detection finds none. */ }
    }
    return { text, tableCount: Math.max(countTables(text), detectedTables), detectedTables, pages: Array.isArray(result?.pages) ? result.pages.length : null };
  } finally {
    try { await parser.destroy(); } catch {}
  }
}

module.exports = { extractPdfTableText, normalizePdfText, countTables };
