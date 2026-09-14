// ==UserScript==
// @name         Spartan Capture Engine
// @namespace    spartan-capture-engine
// @version      2.0.0
// @description  Capture every Utopia page completely, extract structured page data without restricting capture, and deliver it reliably to Spartan on Render.
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

  const VERSION = '2.0.0';
  const ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture';
  const CAPTURE_KEY = 'NikkoAce';
  const QUEUE_KEY = 'spartan_capture_queue_v2';
  const LAST_KEY = 'spartan_capture_last_fingerprint_v2';
  const PANEL_ID = 'spartan-capture-engine-panel';
  const MAX_QUEUE = 25;
  const RETRIES = 5;
  const RETRY_MS = 4000;
  const AUTO_DELAY = 1800;

  let busy = false;
  let current = null;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const text = v => String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const num = v => {
    const n = Number(String(v == null ? '' : v).replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return `sp-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function fingerprint() {
    const body = text(document.body?.innerText || '');
    const sample = `${location.href}|${document.title}|${body.length}|${body.slice(0, 700)}|${body.slice(-700)}`;
    let h = 2166136261;
    for (let i = 0; i < sample.length; i++) h = Math.imul(h ^ sample.charCodeAt(i), 16777619);
    return `${(h >>> 0).toString(16)}-${sample.length}`;
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
    if (coord) out.kd_code = coord[1];
    const province = body.match(/(?:Province\s*:\s*|The Province of\s+)([^\n(]{2,100})/i);
    if (province) out.province = text(province[1]);
    const title = text(document.title);
    if (!out.province && title) out.title_hint = title;
    return out;
  }

  function addField(target, key, value, source) {
    if (value == null || value === '') return;
    if (!(key in target)) target[key] = { value, source };
  }

  function extractStructured() {
    const fields = {};
    const tables = [];
    const links = [];
    const forms = [];

    document.querySelectorAll('table').forEach((table, ti) => {
      const rows = [];
      table.querySelectorAll('tr').forEach((tr, ri) => {
        const cells = Array.from(tr.querySelectorAll('th,td')).map(c => text(c.innerText || c.textContent));
        if (cells.length) rows.push(cells);
        cells.forEach((cell, ci) => {
          const pair = cell.match(/^(.{2,80}?)[\s:=]+([+-]?[\d,.]+%?)$/);
          if (pair) addField(fields, normalizeKey(pair[1]), num(pair[2]), `table:${ti}:${ri}:${ci}`);
        });
      });
      if (rows.length) tables.push({ index: ti, rows });
    });

    document.querySelectorAll('dt').forEach((dt, i) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.matches('dd')) addField(fields, normalizeKey(dt.innerText), scalar(dd.innerText), `dl:${i}`);
    });

    document.querySelectorAll('label').forEach((label, i) => {
      const forId = label.htmlFor;
      const input = forId ? document.getElementById(forId) : label.querySelector('input,select,textarea');
      if (input) addField(fields, normalizeKey(label.innerText), scalar(input.value), `label:${i}`);
    });

    document.querySelectorAll('a[href]').forEach(a => links.push({ text: text(a.innerText || a.textContent), href: a.href }));
    document.querySelectorAll('form').forEach((form, i) => forms.push({ index: i, action: form.action, method: form.method || 'get', fields: Array.from(form.elements).map(e => ({ name: e.name || '', type: e.type || e.tagName.toLowerCase(), value: e.value || '' })) }));

    const visible = text(document.body?.innerText || '');
    const patterns = {
      acres: [/\bAcres?\b[^\d]{0,20}([\d,]+)/i, /\bLand\b[^\d]{0,20}([\d,]+)/i],
      networth: [/\bNet\s*worth\b[^\d]{0,20}([\d,]+)/i, /\bNW\b[^\d]{0,20}([\d,]+)/i],
      gold: [/\bGold\b[^\d]{0,20}([\d,]+)/i], food: [/\bFood\b[^\d]{0,20}([\d,]+)/i],
      runes: [/\bRunes?\b[^\d]{0,20}([\d,]+)/i], population: [/\bPopulation\b[^\d]{0,20}([\d,]+)/i], peons: [/\bPeasants?\b[^\d]{0,20}([\d,]+)/i, /\bPeons?\b[^\d]{0,20}([\d,]+)/i],
      soldiers: [/\bSoldiers\b[^\d]{0,20}([\d,]+)/i], off_specs: [/\bOff(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i], def_specs: [/\bDef(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i],
      elites: [/\bElites?\b[^\d]{0,20}([\d,]+)/i], thieves: [/\bThieves\b[^\d]{0,20}([\d,]+)/i], wizards: [/\bWizards\b[^\d]{0,20}([\d,]+)/i], generals: [/\bGenerals\b[^\d]{0,20}([\d,]+)/i], prisoners: [/\bPrisoners\b[^\d]{0,20}([\d,]+)/i], war_horses: [/\bWar\s*Horses\b[^\d]{0,20}([\d,]+)/i],
      offense: [/\bOffen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i], defense: [/\bDefen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i], mana: [/\bMana\b[^\d]{0,20}([\d,]+)/i], stealth: [/\bStealth\b[^\d]{0,20}([\d,.]+)%?/i],
      build_efficiency: [/\bBuild(?:ing)?\s*Efficiency\b[^\d]{0,20}([\d,.]+)%?/i], wages: [/\bWages\b[^\d]{0,20}([\d,.]+)/i], r_tpa: [/\bRate\s*TPA\b[^\d]{0,20}([\d,.]+)/i], o_tpa: [/\bOff(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i], d_tpa: [/\bDef(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i], r_wpa: [/\bRate\s*WPA\b[^\d]{0,20}([\d,.]+)/i], o_wpa: [/\bOff(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i], d_wpa: [/\bDef(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i]
    };
    for (const [key, list] of Object.entries(patterns)) for (const re of list) { const m = visible.match(re); if (m) { addField(fields, key, num(m[1]), `text:${re}`); break; } }

    return { fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, v.value])), tables, links, forms, field_sources: fields };
  }

  function normalizeKey(v) {
    return text(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'field';
  }
  function scalar(v) { const s = text(v); const n = num(s); return /^[-+]?\d[\d,.]*%?$/.test(s) ? n : s; }

  function buildCapture() {
    const rawDom = document.documentElement?.outerHTML || '';
    const visibleText = text(document.body?.innerText || '');
    const structured = safe(extractStructured, { fields: {}, tables: [], links: [], forms: [], field_sources: {} });
    const id = uuid();
    return {
      captureId: id,
      capturedAt: new Date().toISOString(),
      source: 'spartan_capture_engine',
      sourceId: id,
      scraperVersion: VERSION,
      pageKind: pageKind(),
      url: location.href,
      rawText: visibleText,
      rawPayload: {
        capture_engine: VERSION,
        page: { url: location.href, origin: location.origin, hostname: location.hostname, pathname: location.pathname, search: location.search, hash: location.hash, title: document.title || '', readyState: document.readyState, language: document.documentElement?.lang || null },
        identity: identity(),
        rawDom,
        structured,
      },
      parsedPayload: structured.fields,
    };
  }

  function loadQueue() { return safe(() => JSON.parse(GM_getValue(QUEUE_KEY, '[]')), []); }
  function saveQueue(q) { GM_setValue(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); }

  function enqueue(capture) {
    const q = loadQueue();
    q.push({ capture, attempts: 0, nextAt: Date.now() });
    saveQueue(q);
  }

  function request(capture) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => { if (!settled) { settled = true; resolve(result); } };
      const timer = setTimeout(() => finish({ ok: false, status: 0, error: 'timeout' }), 30000);
      GM_xmlhttpRequest({
        method: 'POST', url: ENDPOINT,
        headers: { 'Content-Type': 'application/json', 'x-spartan-capture-key': CAPTURE_KEY, 'x-spartan-capture-version': VERSION },
        data: JSON.stringify({ capture }),
        timeout: 28000,
        onload: r => { clearTimeout(timer); let body = null; try { body = JSON.parse(r.responseText || '{}'); } catch (_) {} finish({ ok: r.status >= 200 && r.status < 300, status: r.status, body, error: body?.error || '' }); },
        onerror: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'network error' }); },
        ontimeout: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'timeout' }); }
      });
    });
  }

  async function flushQueue() {
    if (busy) return;
    busy = true;
    try {
      let q = loadQueue();
      for (let i = 0; i < q.length; ) {
        if (q[i].nextAt > Date.now()) { i++; continue; }
        const item = q[i];
        setStatus(`Sending ${item.capture.pageKind}…`, false);
        const result = await request(item.capture);
        if (result.ok) {
          q.splice(i, 1); saveQueue(q);
          current = item.capture;
          setStatus(`Saved ✓ · ${item.capture.pageKind} · ${Object.keys(item.capture.parsedPayload || {}).length} fields`, true);
        } else {
          item.attempts += 1;
          if (item.attempts >= RETRIES) {
            item.nextAt = Date.now() + 60000;
            setStatus(`Queued · Render ${result.status || 'offline'} · retry ${item.attempts}/${RETRIES}`, false);
          } else {
            item.nextAt = Date.now() + RETRY_MS * item.attempts;
            setStatus(`Retry queued · ${result.error || result.status || 'connection failure'}`, false);
          }
          q[i] = item; saveQueue(q); i++;
        }
      }
    } finally { busy = false; }
  }

  async function captureNow() {
    if (busy) return;
    const capture = buildCapture();
    current = capture;
    enqueue(capture);
    GM_setValue(LAST_KEY, fingerprint());
    setStatus(`Queued · ${capture.pageKind} · ${Math.round(capture.rawPayload.rawDom.length / 1024)} KB DOM`, true);
    await flushQueue();
  }

  function copy(value, label) { GM_setClipboard(String(value || ''), 'text'); setStatus(label, true); }

  function setStatus(message, good) {
    const p = document.getElementById(PANEL_ID); if (!p) return;
    const s = p.querySelector('[data-status]'); if (!s) return;
    s.textContent = message; s.style.color = good ? '#7ee787' : '#ffb86b';
  }

  function makePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const p = document.createElement('div'); p.id = PANEL_ID;
    p.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:310px;padding:10px;border:1px solid #30363d;border-radius:10px;background:#0d1117;color:#c9d1d9;box-shadow:0 8px 30px rgba(0,0,0,.45);font:12px monospace';
    p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#7ee787">⚡ Spartan Capture 2.0</b><span data-status style="color:#8b949e">Ready</span></div><div style="font-size:9px;color:#8b949e;margin:5px 0 8px">Every page → complete DOM + structured data → Render</div><div style="display:flex;gap:5px;flex-wrap:wrap"><button data-capture>Capture</button><button data-dom>Copy DOM</button><button data-json>Copy JSON</button><button data-clear>Clear Queue</button></div>`;
    p.querySelectorAll('button').forEach(b => b.style.cssText = 'border:0;border-radius:6px;padding:6px 8px;background:#21262d;color:#fff;font:bold 10px monospace;cursor:pointer');
    p.querySelector('[data-capture]').onclick = captureNow;
    p.querySelector('[data-dom]').onclick = () => copy(document.documentElement?.outerHTML, 'DOM copied');
    p.querySelector('[data-json]').onclick = () => copy(JSON.stringify(current || buildCapture(), null, 2), 'Capture JSON copied');
    p.querySelector('[data-clear]').onclick = () => { GM_setValue(QUEUE_KEY, '[]'); setStatus('Queue cleared', true); };
    document.documentElement.appendChild(p);
  }

  function boot() {
    makePanel();
    setTimeout(async () => {
      const fp = fingerprint();
      if (GM_getValue(LAST_KEY, '') !== fp) await captureNow();
      else await flushQueue();
    }, AUTO_DELAY);
    setInterval(flushQueue, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
