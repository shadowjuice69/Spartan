/* Spartan Universal Capture 4.0.4 — Chrome adapter generated from the same engine. */
function GM_getValue(key, fallback) {
  try { const raw = localStorage.getItem('spartan_gm_' + key); if (raw === null) return fallback; try { return JSON.parse(raw); } catch (_) { return raw; } } catch (_) { return fallback; }
}
function GM_setValue(key, value) { try { localStorage.setItem('spartan_gm_' + key, JSON.stringify(value)); } catch (_) {} }
function GM_setClipboard(value) { try { navigator.clipboard?.writeText(String(value ?? '')); } catch (_) {} }
function GM_xmlhttpRequest(opts) {
  try {
    chrome.runtime.sendMessage({ __spartanFetch: true, method: opts.method || 'POST', url: opts.url, headers: opts.headers || {}, data: opts.data, timeout: opts.timeout || 28000 }, response => {
      if (chrome.runtime.lastError) return opts.onerror?.(new Error(chrome.runtime.lastError.message));
      if (!response) return opts.onerror?.(new Error('No background response'));
      if (response.timedOut) return opts.ontimeout?.();
      if (response.error) return opts.onerror?.(new Error(response.error));
      opts.onload?.({ status: response.status, responseText: response.responseText });
    });
  } catch (error) { opts.onerror?.(error); }
}


(function () {
  'use strict';

  const VERSION = '4.0.4';
  const ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture';
  const IDENTITY_ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture/identity';
  const VERIFY_ENDPOINT = 'https://spartan-dashboard.onrender.com/api/capture/verify';
  const CAPTURE_KEY = 'NikkoAce';
  const TOKEN_KEY = 'spartan_capture_token_v4';
  const IDENTITY_KEY = 'spartan_capture_identity_v1';
  const QUEUE_KEY = 'spartan_capture_queue_v4';
  const BLOCKED_KEY = 'spartan_capture_blocked_v1';
  const MAX_QUEUE = 25;
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 2500;
  const CAPTURE_DELAY_MS = 1200;

  let busy = false;
  let lastUrl = location.href;
  let lastFingerprint = '';
  let captureTimer = null;

  const text = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const uuid = () => crypto?.randomUUID?.() || `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeGet = (key, fallback) => safe(() => GM_getValue(key, fallback), fallback);
  const storeSet = (key, value) => safe(() => GM_setValue(key, value), undefined);

  function toast(message, ok = true) {
    document.getElementById('spartan-capture-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'spartan-capture-toast';
    el.textContent = message;
    el.style.cssText = `position:fixed;top:18px;right:18px;z-index:2147483647;padding:11px 15px;border-radius:8px;font:700 12px monospace;color:#fff;background:${ok ? '#238636' : '#da3633'};box-shadow:0 4px 18px rgba(0,0,0,.45)`;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function request(url, data, headers = {}) {
    return new Promise(resolve => {
      let finished = false;
      const finish = result => { if (!finished) { finished = true; resolve(result); } };
      const timer = setTimeout(() => finish({ ok: false, status: 0, error: 'timeout' }), 30000);
      try {
        GM_xmlhttpRequest({
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json', ...headers },
          data: JSON.stringify(data),
          timeout: 28000,
          onload: response => {
            clearTimeout(timer);
            let body = {};
            try { body = JSON.parse(response.responseText || '{}'); } catch (_) {}
            finish({ ok: response.status >= 200 && response.status < 300, status: response.status, body, error: body?.error || '' });
          },
          onerror: error => { clearTimeout(timer); finish({ ok: false, status: 0, error: error?.message || 'network error' }); },
          ontimeout: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'timeout' }); }
        });
      } catch (error) {
        clearTimeout(timer);
        finish({ ok: false, status: 0, error: error?.message || 'request error' });
      }
    });
  }

  function pageKind() {
    const path = `${location.pathname} ${location.search}`.toLowerCase();
    if (/\bthrone\b|throne-room/.test(path)) return 'throne';
    if (/military|army|armies/.test(path)) return 'military';
    if (/magic|wizard|mage|mystic/.test(path)) return 'magic';
    if (/thiev|thief|thieves|thievery/.test(path)) return 'thievery';
    if (/science/.test(path)) return 'science';
    if (/build|building|construction/.test(path)) return 'buildings';
    if (/explor/.test(path)) return 'exploration';
    if (/kingdom|kd-details|province-list|state/.test(path)) return 'kingdom';
    if (/intel/.test(location.hostname) || /intel/.test(path)) return 'intel';

    const heading = [...document.querySelectorAll('h1,h2,h3,title')].map(e => text(e.innerText || e.textContent)).join(' ').toLowerCase();
    const body = text(document.body?.innerText || '').slice(0, 12000).toLowerCase();
    const local = `${heading}\n${body}`;
    if (/\bmilitary\b/.test(local)) return 'military';
    if (/\b(magic|mystic|wizards?)\b/.test(local)) return 'magic';
    if (/\b(thievery|thieves?|thieves' den)\b/.test(local)) return 'thievery';
    if (/\bscience\b/.test(local)) return 'science';
    if (/\b(buildings?|construction)\b/.test(local)) return 'buildings';
    if (/\b(exploration|explore)\b/.test(local)) return 'exploration';
    if (/\b(kingdom|state|provinces)\b/.test(local)) return 'kingdom';
    if (/\bthrone room\b/.test(local)) return 'throne';
    return 'generic';
  }

  function identityHints() {
    const source = `${text(document.title)}\n${text(document.body?.innerText || '')}`;
    const out = {};
    const throne = source.match(/\bThe\s+Province\s+of\s+([^\n(]{2,100}?)\s*\(\s*(\d{1,3}:\d{1,3})\s*\)/i);
    if (throne) {
      out.provinceName = text(throne[1]);
      out.kingdomCode = throne[2];
    }
    if (!out.kingdomCode) out.kingdomCode = source.match(/\b(\d{1,3}:\d{1,3})\b/)?.[1] || '';
    if (!out.provinceName) {
      const m = source.match(/(?:Province(?: Name)?|Your Province|Current Province)\s*[:\-]\s*([^\n|]{2,100})/i);
      if (m) out.provinceName = text(m[1]);
    }
    return out;
  }

  async function ensureIdentity() {
    if (storeGet(BLOCKED_KEY, false)) throw new Error('Scraper account is disabled by Spartan.');
    const existing = safe(() => JSON.parse(storeGet(IDENTITY_KEY, 'null')), null);
    const hinted = identityHints();
    const provinceName = hinted.provinceName || existing?.provinceName || '';
    const kingdomCode = hinted.kingdomCode || existing?.kingdomCode || '';
    if (!provinceName && !kingdomCode) throw new Error('Open Throne once so Spartan can identify the province.');

    const result = await request(IDENTITY_ENDPOINT, {
      provinceName,
      kingdomCode,
      captureToken: storeGet(TOKEN_KEY, '') || undefined
    }, { 'x-spartan-capture-key': CAPTURE_KEY });

    if (!result.ok) {
      if (result.status === 403) storeSet(BLOCKED_KEY, true);
      throw new Error(result.error || 'Identity bootstrap failed');
    }
    storeSet(BLOCKED_KEY, false);
    if (result.body?.captureToken) storeSet(TOKEN_KEY, result.body.captureToken);
    const identity = { ...existing, ...result.body, locked: true, provinceName: result.body?.provinceName || provinceName, kingdomCode: result.body?.kingdomCode || kingdomCode };
    storeSet(IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  }

  function tableData() {
    return [...document.querySelectorAll('table')].map((table, tableIndex) => ({
      index: tableIndex,
      caption: text(table.querySelector('caption')?.textContent || ''),
      rows: [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => text(cell.innerText || cell.textContent)).filter(Boolean)).filter(row => row.length)
    })).filter(table => table.rows.length);
  }

  function keyValueData() {
    const fields = {};
    const add = (key, value) => {
      key = text(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
      value = text(value);
      if (!key || !value || /^\d+$/.test(key)) return;
      if (!(key in fields)) fields[key] = value;
    };
    for (const table of tableData()) {
      for (const row of table.rows) {
        for (let i = 0; i + 1 < row.length; i++) {
          if (row[i].length <= 80) add(row[i], row[i + 1]);
        }
      }
    }
    for (const el of document.querySelectorAll('dt')) {
      const value = el.nextElementSibling;
      if (value?.tagName?.toLowerCase() === 'dd') add(el.textContent, value.textContent);
    }
    return fields;
  }

  function collectCapture(identity) {
    const kind = pageKind();
    const rawText = text(document.body?.innerText || '').slice(0, 250000);
    const parsedPayload = {
      pageKind: kind,
      title: text(document.title),
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].map(e => text(e.innerText || e.textContent)).filter(Boolean),
      fields: keyValueData(),
      tables: tableData(),
      links: [...document.querySelectorAll('a[href]')].slice(0, 500).map(a => ({ text: text(a.innerText || a.textContent), href: a.href })).filter(x => x.text || x.href),
      capturedUrl: location.href,
      capturedAt: new Date().toISOString()
    };
    return {
      captureId: uuid(),
      source: 'spartan_universal_capture_4.0.4',
      sourceId: `${location.hostname}:${location.pathname}`,
      pageKind: kind,
      url: location.href,
      capturedAt: new Date().toISOString(),
      provinceName: identity.provinceName,
      kingdomCode: identity.kingdomCode,
      rawText,
      rawPayload: { url: location.href, title: text(document.title), pageKind: kind },
      parsedPayload
    };
  }

  async function verifyStored(capture) {
    const result = await request(VERIFY_ENDPOINT, {
      captureId: capture.captureId,
      pageKind: capture.pageKind,
      url: capture.url
    }, { 'x-spartan-capture-token': storeGet(TOKEN_KEY, '') });
    return Boolean(result.ok && result.body?.stored === true);
  }

  async function sendCapture(capture) {
    const result = await request(ENDPOINT, { capture }, { 'x-spartan-capture-token': storeGet(TOKEN_KEY, '') });
    if (!result.ok) return { ok: false, error: result.error || `HTTP ${result.status}` };
    if (result.body?.storedInVault !== true && result.body?.captured !== true) return { ok: false, error: 'Server did not confirm capture.' };
    const verified = await verifyStored(capture);
    return verified ? { ok: true, body: result.body } : { ok: false, error: 'Capture was accepted but was not found in the vault yet.' };
  }

  function queueRead() { return safe(() => JSON.parse(storeGet(QUEUE_KEY, '[]')), []) || []; }
  function queueWrite(items) { storeSet(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE))); }
  function queueAdd(capture) { const q = queueRead().filter(x => x.captureId !== capture.captureId); q.push(capture); queueWrite(q); }
  function queueRemove(captureId) { queueWrite(queueRead().filter(x => x.captureId !== captureId)); }

  async function captureCurrent(showStatus = true) {
    if (busy || location.href === 'about:blank') return;
    busy = true;
    if (showStatus) toast('CAPTURING — PLEASE WAIT…', true);
    try {
      const identity = await ensureIdentity();
      const capture = collectCapture(identity);
      queueAdd(capture);
      let lastError = 'Capture failed';
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const result = await sendCapture(capture);
        if (result.ok) {
          queueRemove(capture.captureId);
          lastFingerprint = `${capture.url}|${capture.pageKind}|${capture.rawText.length}`;
          if (showStatus) toast('CAPTURED ✓', true);
          return true;
        }
        lastError = result.error;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.min(attempt + 1, 3)));
      }
      if (showStatus) toast(`FAILED — CAPTURE NOT SAVED`, false);
      console.warn('[Spartan 4.0.4] capture failed:', lastError);
      return false;
    } catch (error) {
      if (showStatus) toast('FAILED — CAPTURE NOT SAVED', false);
      console.warn('[Spartan 4.0.4] capture error:', error);
      return false;
    } finally {
      busy = false;
    }
  }

  async function flushQueue() {
    if (busy) return;
    const queue = queueRead();
    for (const capture of queue) {
      const result = await sendCapture(capture);
      if (result.ok) queueRemove(capture.captureId);
      else break;
    }
  }

  function scheduleCapture(delay = CAPTURE_DELAY_MS) {
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => captureCurrent(true), delay);
  }

  function watchNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastFingerprint = '';
      scheduleCapture(900);
    }
  }

  function watchCpsAndDom() {
    const observer = new MutationObserver(() => {
      watchNavigation();
      const body = text(document.body?.innerText || '');
      const cps = /\bCPS\b/i.test(body) && /(alert|active|warning|challenge)/i.test(body);
      if (cps) scheduleCapture(500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(watchNavigation, 1000);
  }

  function panel() {
    if (document.getElementById('spartan-capture-panel')) return;
    const box = document.createElement('div');
    box.id = 'spartan-capture-panel';
    box.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483646;background:#111;color:#fff;padding:8px 10px;border:1px solid #444;border-radius:7px;font:11px monospace;opacity:.82';
    box.innerHTML = `<span>SPARTAN 4.0.4</span> <button id="spartan-capture-now" style="margin-left:7px">CAPTURE</button>`;
    document.documentElement.appendChild(box);
    box.querySelector('#spartan-capture-now').addEventListener('click', () => captureCurrent(true));
  }

  panel();
  watchCpsAndDom();
  flushQueue();
  scheduleCapture(1800);
})();
