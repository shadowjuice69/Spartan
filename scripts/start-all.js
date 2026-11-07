// Spartan single-container launcher: Next.js web + Discord bot.
// Memory-lean layout (512 MB container):
//  - 2 child processes only; storage steward runs as an in-process timer.
//  - Boot is staggered: web first, bot after BOT_START_DELAY_MS, steward after it.
//  - Per-process V8 heap caps (env-tunable, 0 = off).
//  - Periodic [MEM] lines report per-process RSS from /proc.
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const num = (name, def) => { const v = Number(process.env[name]); return Number.isFinite(v) && v >= 0 ? v : def; };
const children = [];
let shuttingDown = false;
let botRestartTimer = null;
let botRestartAttempts = 0;
const MAX_BOT_RESTART_DELAY_MS = 60000;

function withHeap(mb) {
  const existing = String(process.env.NODE_OPTIONS || '').replace(/--max-old-space-size=\d+/g, '').trim();
  return mb > 0 ? (existing + ' --max-old-space-size=' + mb).trim() : existing;
}

function scheduleRestart(command, args, label, heapMb, options) {
  if (shuttingDown || botRestartTimer) return;
  botRestartAttempts += 1;
  const delay = Math.min(MAX_BOT_RESTART_DELAY_MS, 1000 * (2 ** Math.min(botRestartAttempts - 1, 6)));
  console.error('[START-ALL] restarting ' + label + ' in ' + delay + 'ms (attempt ' + botRestartAttempts + ')');
  botRestartTimer = setTimeout(() => {
    botRestartTimer = null;
    if (!shuttingDown) launch(command, args, label, heapMb, options);
  }, delay);
  botRestartTimer.unref();
}

function launch(command, args, label, heapMb, options = {}) {
  const env = { ...process.env, EMBEDDED_SPARTAN: 'true', NODE_OPTIONS: withHeap(heapMb) };
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  child.label = label;
  children.push(child);
  const stableTimer = options.restart
    ? setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) botRestartAttempts = 0;
      }, 300000)
    : null;
  if (stableTimer) stableTimer.unref();

  child.on('exit', (code, signal) => {
    if (stableTimer) clearTimeout(stableTimer);
    const index = children.indexOf(child);
    if (index >= 0) children.splice(index, 1);
    if (shuttingDown) return;
    console.error('[START-ALL] ' + label + ' exited code=' + code + ' signal=' + (signal || 'none'));
    if (options.restart) scheduleRestart(command, args, label, heapMb, options);
    else shutdown(code || 1);
  });
  child.on('error', (error) => {
    console.error('[START-ALL] ' + label + ' failed: ' + error.message);
    if (options.restart) scheduleRestart(command, args, label, heapMb, options);
    else shutdown(1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (botRestartTimer) clearTimeout(botRestartTimer);
  botRestartTimer = null;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGTERM'); } catch {} }
  }
  setTimeout(() => process.exit(code), 1500).unref();
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

// ---- memory log -----------------------------------------------------------
function rssMb(pid) {
  try {
    const m = /VmRSS:\s+(\d+) kB/.exec(fs.readFileSync('/proc/' + pid + '/status', 'utf8'));
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch { return null; }
}
function logMem(tag) {
  const parts = [['parent', process.pid], ...children.filter(c => c.pid && c.exitCode === null && c.signalCode === null).map(c => [c.label, c.pid])];
  let total = 0;
  const text = parts.map(([label, pid]) => { const v = rssMb(pid); if (v) total += v; return label + '=' + (v ?? '?') + 'MB'; }).join(' ');
  console.log('[MEM]' + (tag ? ' ' + tag : '') + ' ' + text + ' total=' + total + 'MB');
}

// ---- storage steward (in-process; no third Node runtime) -------------------
function startSteward() {
  const key = process.env.SPARTAN_STEWARD_KEY;
  if (!key) { console.error('[storage-steward] SPARTAN_STEWARD_KEY is not configured; steward disabled'); return; }
  const base = String(process.env.SPARTAN_DASHBOARD_URL || ('http://127.0.0.1:' + (process.env.PORT || 10000))).replace(/\/$/, '');
  const baseMs = Math.max(num('SPARTAN_STORAGE_STEWARD_INTERVAL_MS', 300000), 30000);
  const maxMs = Math.max(num('SPARTAN_STORAGE_STEWARD_MAX_INTERVAL_MS', 900000), baseMs);
  const limit = Math.min(Math.max(num('SPARTAN_STORAGE_STEWARD_BATCH', 3) || 3, 1), 25);
  let delay = baseMs;
  console.log('[storage-steward] in-process worker', JSON.stringify({ base, baseMs, maxMs, limit }));
  async function cycle() {
    let busy = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(base + '/api/internal-storage/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-spartan-steward-key': key },
        body: JSON.stringify({ limit }),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload; try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 200) }; }
      if (!response.ok || payload?.ok !== true) {
        console.error('[storage-steward] cycle failed', response.status, JSON.stringify(payload).slice(0, 400));
      } else {
        busy = (payload.staged || 0) + (payload.processed || 0) + (payload.failed || 0) > 0;
        if (busy) console.log('[storage-steward] cycle complete', JSON.stringify({ requested: payload.requested, staged: payload.staged, processed: payload.processed, failed: payload.failed }));
        if (Array.isArray(payload.failures) && payload.failures.length) console.error('[storage-steward] item failures', JSON.stringify(payload.failures).slice(0, 600));
      }
    } catch (error) {
      console.error('[storage-steward] request error', error instanceof Error ? error.message : String(error));
    } finally { clearTimeout(timeout); }
    delay = busy ? baseMs : Math.min(delay * 2, maxMs);
    if (!shuttingDown) setTimeout(cycle, delay);
  }
  setTimeout(cycle, 15000);
}

// ---- boot -----------------------------------------------------------------
const botDelay = num('BOT_START_DELAY_MS', 20000);
const nextHeap = num('NEXT_MAX_HEAP_MB', 256);
const botHeap = num('BOT_MAX_HEAP_MB', 160);
console.log('[START-ALL] Starting Spartan web, then Discord bot in ' + botDelay + 'ms (heap caps next=' + nextHeap + 'MB bot=' + botHeap + 'MB)');
launch(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '0.0.0.0'], 'next', nextHeap);
setTimeout(() => { if (!shuttingDown) launch(process.execPath, ['bot/bot.js'], 'bot', botHeap, { restart: true }); }, botDelay);
setTimeout(() => { if (!shuttingDown) startSteward(); }, botDelay + 25000);

const memEvery = num('MEM_LOG_INTERVAL_MS', 300000);
if (memEvery > 0) {
  for (const t of [30000, 90000]) setTimeout(() => { if (!shuttingDown) logMem('boot+' + t / 1000 + 's'); }, t + botDelay - 20000);
  setInterval(() => { if (!shuttingDown) logMem(''); }, memEvery).unref();
}
