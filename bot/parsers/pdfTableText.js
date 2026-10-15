'use strict';

const { PDFParse } = require('pdf-parse');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '..', '..');
const PYTHON_EXTRACTOR = path.join(ROOT, 'bot', 'parsers', 'pdf_table_extract.py');
const VENV_PYTHON = path.join(ROOT, '.venv', 'bin', 'python');

function normalizePdfText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\u000C/g, '\n')
    .replace(/\r\n?/g, '\n')
    // Keep original line indentation for fixed-width fallback parsers.
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

async function extractCanonicalTables(buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spartan-age-pdf-'));
  const pdfPath = path.join(tempDir, 'age-update.pdf');
  try {
    await fs.writeFile(pdfPath, buffer);
    const python = process.env.SPARTAN_PDF_PYTHON ||
      (await fs.access(VENV_PYTHON).then(() => VENV_PYTHON).catch(() => process.env.PYTHON || 'python3'));
    const { stdout } = await execFileAsync(python, [PYTHON_EXTRACTOR, pdfPath], {
      cwd: ROOT, timeout: 45000, maxBuffer: 10 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout);
    if (parsed.error) throw new Error(parsed.error);
    if (!Array.isArray(parsed.races) || !Array.isArray(parsed.personalities) ||
        !Array.isArray(parsed.rituals) || !Array.isArray(parsed.dragons) ||
        parsed.races.length < 10 || parsed.personalities.length < 5 ||
        parsed.rituals.length < 1 || parsed.dragons.length < 1) {
      throw new Error('PDF table extraction returned an incomplete ruleset');
    }
    return parsed;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function canonicalTableText(tables) {
  const sections = [
    ['RACES', tables.races],
    ['PERSONALITIES', tables.personalities],
    ['RITUALS', tables.rituals],
    ['DRAGONS', tables.dragons]
  ];
  return sections.map(([name, rows]) => [
    '#TABLE ' + name,
    ...rows.map((row) => '#ROW ' + JSON.stringify(row)),
    '#ENDTABLE'
  ].join('\n')).join('\n');
}

/**
 * Extract source text plus canonical rows from the PDF's actual bordered cells.
 * pdf-parse's structural table detector misses some border-backed layouts and its
 * sparse tab separators are not safe column indexes; pdfplumber reads the cell grid.
 */
async function extractPdfTableText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('Invalid PDF buffer: missing %PDF header');
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const parsedText = await parser.getText();
    const text = normalizePdfText(parsedText?.text || '');
    const tables = await extractCanonicalTables(buffer);
    const canonical = canonicalTableText(tables);
    const fullText = [text, canonical].filter(Boolean).join('\n\n');
    return {
      text: fullText,
      tableCount: Number(tables.tables_found) || 0,
      detectedTables: Number(tables.tables_found) || 0,
      pages: Array.isArray(parsedText?.pages) ? parsedText.pages.length : null,
      tableRows: {
        races: tables.races.length,
        personalities: tables.personalities.length,
        rituals: tables.rituals.length,
        dragons: tables.dragons.length
      }
    };
  } finally {
    try { await parser.destroy(); } catch {}
  }
}

module.exports = { extractPdfTableText, normalizePdfText, countTables, extractCanonicalTables, canonicalTableText };
