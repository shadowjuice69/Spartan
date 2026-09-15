// ==UserScript==
// @name         Spartan Capture Engine
// @namespace    spartan-capture-engine
// @version      3.3.0
// @description  Authenticate a Utopia province with Spartan from Throne, persist identity across pages, and capture on explicit request.
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

  const VERSION = '3.3.0';
  const ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture';
  const IDENTITY_ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture/identity';
  const CAPTURE_KEY = 'NikkoAce';
  const TOKEN_KEY = 'spartan_capture_token_v4';
  const OWNER_KEY = 'spartan_capture_owner_v4';
  const IDENTITY_KEY = 'spartan_capture_identity_v1';
  const QUEUE_KEY = 'spartan_capture_queue_v4';
  const PANEL_ID = 'spartan-capture-engine-panel';
  const MAX_QUEUE = 25;
  const RETRIES = 5;
  const RETRY_MS = 4000;

  let busy = false;
  let identityState = null;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const text = v => String(v == null ? '' : v).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.+-]/g, '')); return Number.isFinite(n) ? n : null; };
  function uuid() { if (crypto?.randomUUID) return crypto.randomUUID(); return `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

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
    const title = text(document.title);
    const out = {};
    const coord = body.match(/\b(\d{1,3}:\d{1,3})\b/) || title.match(/\b(\d{1,3}:\d{1,3})\b/);
    if (coord) out.kingdomCode = coord[1];
    const patterns = [
      /(?:Province|Province Name|Province Name\s*)\s*[:\-]\s*([^\n|]{2,100})/i,
      /The Province of\s+([^\n(]{2,100})/i,
      /(?:Your Province|Current Province)\s*[:\-]?\s*([^\n|]{2,100})/i,
      /(?:Welcome|Welcome back)[, ]+([^\n|]{2,100}?)(?:\s+\(?\d{1,3}:\d{1,3}\)?|$)/i,
    ];
    for (const re of patterns) { const m = body.match(re); if (m?.[1]) { out.provinceName = text(m[1]); break; } }
    if (!out.provinceName && title && !/utopia/i.test(title)) {
      const cleaned = title.replace(/\s*[|\-].*$/, '').trim();
      if (cleaned.length >= 2) out.titleHint = cleaned;
    }
    return out;
  }

  function getStoredIdentity() {
    return safe(() => JSON.parse(GM_getValue(IDENTITY_KEY, 'null')), null);
  }

  function setIdentity(data) {
    if (data?.captureToken) GM_setValue(TOKEN_KEY, data.captureToken);
    if (data?.ownerId) GM_setValue(OWNER_KEY, data.ownerId);
    const current = { ...getStoredIdentity(), ...data, locked: true, lockedAt: data?.lockedAt || new Date().toISOString() };
    GM_setValue(IDENTITY_KEY, JSON.stringify(current));
    identityState = current;
  }

  function storedIdentityValid() {
    const id = getStoredIdentity();
    if (!id?.locked || !id?.ownerId || !id?.provinceName) return false;
    return Boolean(id.kingdomCode);
  }

  function scalar(v) { const s = text(v); return /^[-+]?\d[\d,.]*%?$/.test(s) ? num(s) : s; }
  function normalizeKey(v) { return text(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'field'; }

  function structured() {
    const fields = {}, sources = {}, tables = [];
    const add = (k, v, source) => { if (v !== null && v !== '') { const key = normalizeKey(k); if (!(key in fields)) { fields[key] = v; sources[key] = source; } } };
    document.querySelectorAll('table').forEach((table, ti) => {
      const rows = [];
      table.querySelectorAll('tr').forEach((tr, ri) => {
        const cells = [...tr.querySelectorAll('th,td')].map(c => text(c.innerText || c.textContent));
        if (cells.length) rows.push(cells);
        cells.forEach((cell, ci) => { const pair = cell.match(/^(.{2,80}?)\s*[:=]\s*([+-]?[\d,.]+%?)$/); if (pair) add(pair[1], num(pair[2]), `table:${ti}:${ri}:${ci}`); });
      });
      if (rows.length) tables.push({ index: ti, rows });
    });
    document.querySelectorAll('dt').forEach((dt, i) => { const dd = dt.nextElementSibling; if (dd?.matches('dd')) add(dt.innerText, scalar(dd.innerText), `dl:${i}`); });
    document.querySelectorAll('label').forEach((label, i) => { const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea'); if (input) add(label.innerText, scalar(input.value), `label:${i}`); });
    const visible = text(document.body?.innerText || '');
    const patterns = {
      acres: [/\bAcres?\b[^\d]{0,20}([\d,]+)/i, /\bLand\b[^\d]{0,20}([\d,]+)/i], networth: [/\bNet\s*worth\b[^\d]{0,20}([\d,]+)/i, /\bNW\b[^\d]{0,20}([\d,]+)/i], population: [/\bPopulation\b[^\d]{0,20}([\d,]+)/i], peons: [/\bPeasants?\b[^\d]{0,20}([\d,]+)/i, /\bPeons?\b[^\d]{0,20}([\d,]+)/i], soldiers: [/\bSoldiers\b[^\d]{0,20}([\d,]+)/i], off_specs: [/\bOff(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i], def_specs: [/\bDef(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i], elites: [/\bElites?\b[^\d]{0,20}([\d,]+)/i], thieves: [/\bThieves\b[^\d]{0,20}([\d,]+)/i], wizards: [/\bWizards\b[^\d]{0,20}([\d,]+)/i], generals: [/\bGenerals\b[^\d]{0,20}([\d,]+)/i], prisoners: [/\bPrisoners\b[^\d]{0,20}([\d,]+)/i], war_horses: [/\bWar\s*Horses\b[^\d]{0,20}([\d,]+)/i], offense: [/\bOffen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i], defense: [/\bDefen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i], mana: [/\bMana\b[^\d]{0,20}([\d,]+)/i], stealth: [/\bStealth\b[^\d]{0,20}([\d,.]+)%?/i], build_efficiency: [/\bBuild(?:ing)?\s*Efficiency\b[^\d]{0,20}([\d,.]+)%?/i], wages: [/\bWages\b[^\d]{0,20}([\d,.]+)/i], r_tpa: [/\bRate\s*TPA\b[^\d]{0,20}([\d,.]+)/i], o_tpa: [/\bOff(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i], d_tpa: [/\bDef(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i], r_wpa: [/\bRate\s*WPA\b[^\d]{0,20}([\d,.]+)/i], o_wpa: [/\bOff(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i], d_wpa: [/\bDef(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i]
    };
    for (const [key, list] of Object.entries(patterns)) for (const re of list) { const m = visible.match(re); if (m) { add(key, num(m[1]), `text:${re}`); break; } }
    return { fields, tables, links: [...document.querySelectorAll('a[href]')].map(a => ({ text: text(a.innerText || a.textContent), href: a.href })), forms: [...document.querySelectorAll('form')].map((f, i) => ({ index: i, action: f.action, method: f.method || 'get', fields: [...f.elements].map(e => ({ name: e.name || '', type: e.type || e.tagName.toLowerCase(), value: e.value || '' })) })), field_sources: sources };
  }

  function capture() {
    const rawDom = document.documentElement?.outerHTML || '';
    const s = safe(structured, { fields: {}, tables: [], links: [], forms: [], field_sources: {} });
    const id = uuid();
    const locked = getStoredIdentity();
    return { captureId: id, capturedAt: new Date().toISOString(), source: 'spartan_capture_engine', sourceId: id, scraperVersion: VERSION, pageKind: pageKind(), url: location.href, rawText: text(document.body?.innerText || ''), rawPayload: { capture_engine: VERSION, page: { url: location.href, origin: location.origin, hostname: location.hostname, pathname: location.pathname, search: location.search, hash: location.hash, title: document.title || '', readyState: document.readyState, language: document.documentElement?.lang || null }, identity: locked || identity(), rawDom, structured: s }, parsedPayload: s.fields };
  }

  function token() { return safe(() => GM_getValue(TOKEN_KEY, ''), ''); }

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

  async function bootstrapIdentity(force = false) {
    const stored = getStoredIdentity();
    if (!force && storedIdentityValid() && token()) {
      identityState = stored;
      setStatus(`Identity locked ✓ · ${stored.provinceName} · ${stored.kingdomCode}`, true);
      return true;
    }
    const id = identity();
    setStatus(`Identity checking · ${id.provinceName || id.titleHint || 'province'} · ${id.kingdomCode || 'KD unknown'}`, false);
    const result = await http(IDENTITY_ENDPOINT, { provinceName: id.provinceName || id.titleHint || '', kingdomCode: id.kingdomCode || '', captureToken: token() || '' });
    if (result.ok && result.body?.captureToken && result.body?.ownerId) {
      setIdentity(result.body);
      setStatus(`Identity locked ✓ · ${result.body.provinceName || 'province'} · ${result.body.kingdomCode || ''}`, true);
      return true;
    }
    setStatus(`Identity failed · ${result.body?.error || result.error || `HTTP ${result.status}`}`, false);
    return false;
  }

  function loadQueue() { return safe(() => JSON.parse(GM_getValue(QUEUE_KEY, '[]')), []); }
  function saveQueue(q) { GM_setValue(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); }
  function enqueue(c) { const q = loadQueue(); q.push({ capture: c, attempts: 0, nextAt: Date.now() }); saveQueue(q); }

  async function send(c) {
    const t = token();
    if (!t) return { ok: false, status: 401, error: 'No valid scraper token' };
    return await http(ENDPOINT, { capture: c }, { headers: { 'x-spartan-capture-token': t } });
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
        if (result.ok) { const kind = q[i].capture.pageKind; q.splice(i, 1); saveQueue(q); setStatus(`Saved ✓ · ${kind}`, true); }
        else { q[i].attempts++; q[i].nextAt = Date.now() + (q[i].attempts >= RETRIES ? 60000 : RETRY_MS * q[i].attempts); saveQueue(q); setStatus(`Queued · ${result.error || result.status || 'Render unavailable'}`, false); i++; }
      }
    } finally { busy = false; }
  }

  async function captureNow() {
    if (busy) return;
    const kind = pageKind();
    // Only a Throne page is allowed to establish/re-establish identity.
    // Every other page must use the identity already anchored by Throne.
    if (kind === 'throne') {
      if (!(await bootstrapIdentity(false))) return;
    } else if (!storedIdentityValid() || !token()) {
      setStatus('Identity not linked · capture Throne first', false);
      return;
    } else {
      identityState = getStoredIdentity();
      setStatus(`Identity locked ✓ · ${identityState.provinceName} · ${identityState.kingdomCode}`, true);
    }
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
    p.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:310px;background:#101318;color:#e6edf3;border:1px solid #30363d;border-radius:10px;padding:12px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)';
    p.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:8px">Spartan Capture 3.3</div><div data-status style="min-height:34px;margin-bottom:8px">Ready</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button data-capture>Capture</button><button data-copy>Copy identity</button></div>`;
    p.querySelectorAll('button').forEach(b => { b.style.cssText = 'border:1px solid #484f58;background:#21262d;color:#e6edf3;border-radius:6px;padding:5px 8px;font:inherit'; });
    p.querySelector('[data-capture]').addEventListener('click', captureNow);
    p.querySelector('[data-copy]').addEventListener('click', () => copy(JSON.stringify(getStoredIdentity(), null, 2), 'Identity copied'));
    document.body.appendChild(p);
    const stored = getStoredIdentity();
    if (storedIdentityValid() && token()) setStatus(`Identity locked ✓ · ${stored.provinceName} · ${stored.kingdomCode}`, true);
  }

  panel();
})();
