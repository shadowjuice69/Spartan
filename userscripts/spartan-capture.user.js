// ==UserScript==
// @name         Spartan Capture Engine
// @namespace    spartan-capture-engine
// @version      3.0.0
// @description  Capture every Utopia page to Spartan on Render with automatic per-user scraper identity.
// @match        https://www.utopia-game.com/*
// @match        https://utopia-game.com/*
// @match        https://intel.utopia-game.com/*
// @match        https://intel.utopia.site/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @connect      spartan-dashboard.onrender.com
// @run-at       document-end
// @all-frames   false
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '3.0.0';
  const ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture';
  const IDENTITY_ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture/identity';
  const CAPTURE_KEY = 'NikkoAce';
  const TOKEN_KEY = 'spartan_capture_token_v3';
  const OWNER_KEY = 'spartan_capture_owner_v3';
  const QUEUE_KEY = 'spartan_capture_queue_v3';
  const PANEL_ID = 'spartan-capture-engine-panel';
  const MAX_QUEUE = 25;
  const RETRIES = 5;
  const RETRY_MS = 4000;

  let busy = false;
  let identityState = null;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const text = v => String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.+-]/g, '')); return Number.isFinite(n) ? n : null; };

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function pageKind() {
    const p = `${location.pathname} ${location.search}`.toLowerCase();
    const t = text(document.body?.innerText || '').toLowerCase();
    if (/throne/.test(p) || /throne room/.test(t)) return 'throne';
    if (/military|army|armies/.test(p)) return 'military';
    if (/magic|wizard|mage/.test(p)) return 'magic';
    if (/thiev|thief|thieves|thievery/.test(p)) return 'thievery';
    if (/science/.test(p)) return 'science';
    if (/build|building/.test(p)) return 'buildings';
    if (/explor/.test(p)) return 'exploration';
    if (/kingdom|kd-details|province-list/.test(p)) return 'kingdom';
    if (/intel/.test(location.hostname) || /intel/.test(p)) return 'intel';
    return 'generic';
  }

  function identity() {
    const body = text(document.body?.innerText || '');
    const out = {};
    const coord = body.match(/\b(\d{1,3}:\d{1,3})\b/);
    if (coord) out.kingdomCode = coord[1];
    const patterns = [
      /(?:Province|Province Name)\s*[:\-]\s*([^\n|]{2,100})/i,
      /The Province of\s+([^\n(]{2,100})/i,
      /(?:Your Province|Current Province)\s*[:\-]?\s*([^\n|]{2,100})/i,
      /<title[^>]*>.*?([^|\-]{2,80})/i,
    ];
    for (const re of patterns) { const m = body.match(re); if (m?.[1]) { out.provinceName = text(m[1]); break; } }
    if (!out.provinceName) {
      const title = text(document.title);
      if (title && !/utopia/i.test(title)) out.titleHint = title;
    }
    return out;
  }

  function scalar(v) {
    const s = text(v);
    return /^[-+]?\d[\d,.]*%?$/.test(s) ? num(s) : s;
  }

  function normalizeKey(v) {
    return text(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'field';
  }

  function structured() {
    const fields = {};
    const sources = {};
    const tables = [];
    const add = (k, v, source) => { if (v !== null && v !== '') { const key = normalizeKey(k); if (!(key in fields)) { fields[key] = v; sources[key] = source; } } };

    document.querySelectorAll('table').forEach((table, ti) => {
      const rows = [];
      table.querySelectorAll('tr').forEach((tr, ri) => {
        const cells = [...tr.querySelectorAll('th,td')].map(c => text(c.innerText || c.textContent));
        if (cells.length) rows.push(cells);
        cells.forEach((cell, ci) => {
          const pair = cell.match(/^(.{2,80}?)[\s:=]+([+-]?[\d,.]+%?)$/);
          if (pair) add(pair[1], num(pair[2]), `table:${ti}:${ri}:${ci}`);
        });
      });
      if (rows.length) tables.push({ index: ti, rows });
    });

    document.querySelectorAll('dt').forEach((dt, i) => {
      const dd = dt.nextElementSibling;
      if (dd?.matches('dd')) add(dt.innerText, scalar(dd.innerText), `dl:${i}`);
    });

    document.querySelectorAll('label').forEach((label, i) => {
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea');
      if (input) add(label.innerText, scalar(input.value), `label:${i}`);
    });

    const visible = text(document.body?.innerText || '');
    const patterns = {
      acres: [/\bAcres?\b[^\d]{0,20}([\d,]+)/i, /\bLand\b[^\d]{0,20}([\d,]+)/i],
      networth: [/\bNet\s*worth\b[^\d]{0,20}([\d,]+)/i, /\bNW\b[^\d]{0,20}([\d,]+)/i],
      population: [/\bPopulation\b[^\d]{0,20}([\d,]+)/i], peons: [/\bPeasants?\b[^\d]{0,20}([\d,]+)/i, /\bPeons?\b[^\d]{0,20}([\d,]+)/i],
      soldiers: [/\bSoldiers\b[^\d]{0,20}([\d,]+)/i], off_specs: [/\bOff(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i], def_specs: [/\bDef(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i],
      elites: [/\bElites?\b[^\d]{0,20}([\d,]+)/i], thieves: [/\bThieves\b[^\d]{0,20}([\d,]+)/i], wizards: [/\bWizards\b[^\d]{0,20}([\d,]+)/i], generals: [/\bGenerals\b[^\d]{0,20}([\d,]+)/i], prisoners: [/\bPrisoners\b[^\d]{0,20}([\d,]+)/i], war_horses: [/\bWar\s*Horses\b[^\d]{0,20}([\d,]+)/i],
      offense: [/\bOffen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i], defense: [/\bDefen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i], mana: [/\bMana\b[^\d]{0,20}([\d,]+)/i], stealth: [/\bStealth\b[^\d]{0,20}([\d,.]+)%?/i],
      build_efficiency: [/\bBuild(?:ing)?\s*Efficiency\b[^\d]{0,20}([\d,.]+)%?/i], wages: [/\bWages\b[^\d]{0,20}([\d,.]+)/i],
      r_tpa: [/\bRate\s*TPA\b[^\d]{0,20}([\d,.]+)/i], o_tpa: [/\bOff(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i], d_tpa: [/\bDef(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i],
      r_wpa: [/\bRate\s*WPA\b[^\d]{0,20}([\d,.]+)/i], o_wpa: [/\bOff(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i], d_wpa: [/\bDef(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i]
    };
    for (const [key, list] of Object.entries(patterns)) for (const re of list) { const m = visible.match(re); if (m) { add(key, num(m[1]), `text:${re}`); break; } }

    return { fields, tables, links: [...document.querySelectorAll('a[href]')].map(a => ({ text: text(a.innerText || a.textContent), href: a.href })), forms: [...document.querySelectorAll('form')].map((f, i) => ({ index: i, action: f.action, method: f.method || 'get', fields: [...f.elements].map(e => ({ name: e.name || '', type: e.type || e.tagName.toLowerCase(), value: e.value || '' })) })), field_sources: sources };
  }

  function capture() {
    const rawDom = document.documentElement?.outerHTML || '';
    const s = safe(structured, { fields: {}, tables: [], links: [], forms: [], field_sources: {} });
    const id = uuid();
    return {
      captureId: id, capturedAt: new Date().toISOString(), source: 'spartan_capture_engine', sourceId: id,
      scraperVersion: VERSION, pageKind: pageKind(), url: location.href, rawText: text(document.body?.innerText || ''),
      rawPayload: { capture_engine: VERSION, page: { url: location.href, origin: location.origin, hostname: location.hostname, pathname: location.pathname, search: location.search, hash: location.hash, title: document.title || '', readyState: document.readyState, language: document.documentElement?.lang || null }, identity: identity(), rawDom, structured: s },
      parsedPayload: s.fields,
    };
  }

  function token() { return safe(() => GM_getValue(TOKEN_KEY, ''), ''); }
  function owner() { return safe(() => GM_getValue(OWNER_KEY, ''), ''); }
  function setIdentity(data) { if (data?.captureToken) GM_setValue(TOKEN_KEY, data.captureToken); if (data?.ownerId) GM_setValue(OWNER_KEY, data.ownerId); identityState = data; }

  function http(url, data, extra = {}) {
    return new Promise(resolve => {
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(value); } };
      const timer = setTimeout(() => finish({ ok: false, status: 0, error: 'timeout' }), 30000);
      GM_xmlhttpRequest({ method: 'POST', url, headers: { 'Content-Type': 'application/json', 'x-spartan-capture-key': CAPTURE_KEY, 'x-spartan-capture-version': VERSION, ...(extra.headers || {}) }, data: JSON.stringify(data), timeout: 28000,
        onload: r => { clearTimeout(timer); let body = {}; try { body = JSON.parse(r.responseText || '{}'); } catch (_) {} finish({ ok: r.status >= 200 && r.status < 300, status: r.status, body, error: body.error || '' }); },
        onerror: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'network error' }); },
        ontimeout: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'timeout' }); }
      });
    });
  }

  async function bootstrapIdentity() {
    const existing = token();
    if (existing && owner()) return true;
    const id = identity();
    const result = await http(IDENTITY_ENDPOINT, { provinceName: id.provinceName || '', kingdomCode: id.kingdomCode || '', captureToken: existing || '' });
    if (result.ok && result.body?.captureToken && result.body?.ownerId) {
      setIdentity(result.body);
      setStatus(`Identity linked ✓ · ${result.body.provinceName || 'province'}`, true);
      return true;
    }
    setStatus(result.body?.error || 'Open your Throne page once to link this scraper.', false);
    return false;
  }

  function loadQueue() { return safe(() => JSON.parse(GM_getValue(QUEUE_KEY, '[]')), []); }
  function saveQueue(q) { GM_setValue(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); }
  function enqueue(c) { const q = loadQueue(); q.push({ capture: c, attempts: 0, nextAt: Date.now() }); saveQueue(q); }

  async function send(c) {
    const result = await http(ENDPOINT, { capture: c, userId: owner() }, { headers: token() ? { 'x-spartan-capture-token': token() } : {} });
    if (result.ok && result.body?.captureToken) setIdentity(result.body);
    return result;
  }

  async function flushQueue() {
    if (busy) return;
    busy = true;
    try {
      const q = loadQueue();
      for (let i = 0; i < q.length; ) {
        if (q[i].nextAt > Date.now()) { i++; continue; }
        setStatus(`Sending ${q[i].capture.pageKind}…`, false);
        const result = await send(q[i].capture);
        if (result.ok) { q.splice(i, 1); saveQueue(q); setStatus(`Saved ✓ · ${q[i]?.capture?.pageKind || 'capture'}`, true); }
        else { q[i].attempts++; q[i].nextAt = Date.now() + (q[i].attempts >= RETRIES ? 60000 : RETRY_MS * q[i].attempts); saveQueue(q); setStatus(`Queued · ${result.error || result.status || 'Render unavailable'}`, false); i++; }
      }
    } finally { busy = false; }
  }

  async function captureNow() {
    if (busy) return;
    if (!(await bootstrapIdentity())) return;
    const c = capture();
    enqueue(c);
    setStatus(`Queued · ${c.pageKind} · ${Math.round(c.rawPayload.rawDom.length / 1024)} KB DOM`, true);
    await flushQueue();
  }

  function setStatus(message, good) { const p = document.getElementById(PANEL_ID); const s = p?.querySelector('[data-status]'); if (s) { s.textContent = message; s.style.color = good ? '#7ee787' : '#ffb86b'; } }
  function copy(v, label) { GM_setClipboard(String(v || ''), 'text'); setStatus(label, true); }

  function panel() {
    if (document.getElementById(PANEL_ID)) return;
    const p = document.createElement('div'); p.id = PANEL_ID;
    p.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:320px;padding:10px;border:1px solid #30363d;border-radius:10px;background:#0d1117;color:#c9d1d9;box-shadow:0 8px 30px rgba(0,0,0,.45);font:12px monospace';
    p.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px"><b style="color:#7ee787">⚡ Spartan Capture 3.0</b><span data-status style="color:#8b949e">Starting…</span></div><div style="margin-top:7px;font-size:10px;color:#8b949e">Identity: <span data-identity>checking…</span></div><div style="display:flex;gap:6px;margin-top:8px"><button data-capture>Capture now</button><button data-copy>Copy status</button></div>`;
    document.body.appendChild(p);
    p.querySelectorAll('button').forEach(b => b.style.cssText = 'background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:4px 7px;font:11px monospace');
    p.querySelector('[data-capture]').onclick = captureNow;
    p.querySelector('[data-copy]').onclick = () => copy(JSON.stringify({ version: VERSION, owner: owner() || null, token: Boolean(token()), identity: identityState || identity(), url: location.href }, null, 2), 'Status copied');
  }

  async function start() {
    panel();
    const linked = await bootstrapIdentity();
    const label = document.querySelector('[data-identity]');
    if (label) label.textContent = linked ? `${identityState?.provinceName || 'linked'} · ${identityState?.kingdomCode || ''}` : 'not linked';
    if (linked) { setStatus('Ready', true); setTimeout(captureNow, 500); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
