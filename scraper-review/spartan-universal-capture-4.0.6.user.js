// ==UserScript==
// @name         Spartan Universal Capture
// @namespace    spartan-universal-capture
// @version      4.0.6
// @description  Full Utopia page scraper restored from the known-good engine, with Spartan identity, authorization, CPS capture, queue/retry, and the full control panel.
// @match        https://www.utopia-game.com/*
// @match        https://utopia-game.com/*
// @match        https://intel.utopia-game.com/*
// @match        https://intel.utopia.site/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      sparta-west.onrender.com
// @run-at       document-end
// @all-frames   false
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '4.0.6';
  const SOURCE = 'spartan_capture_engine';
  const ENDPOINT = 'https://sparta-west.onrender.com/api/capture';
  const IDENTITY_ENDPOINT = 'https://sparta-west.onrender.com/api/capture/identity';
  const CAPTURE_KEY = 'NikkoAce';
  const PANEL_ID = 'spartan-universal-capture-panel';
  const TOKEN_KEY = 'spartan_capture_token_v4';
  const OWNER_KEY = 'spartan_capture_owner_v4';
  const IDENTITY_KEY = 'spartan_capture_identity_v1';
  const QUEUE_KEY = 'spartan_capture_queue_v4';
  const LAST_KEY = 'spartan_capture_last_fingerprint_v4';
  const BLOCKED_KEY = 'spartan_capture_blocked_v1';
  const MAX_QUEUE = 25;
  const RETRIES = 5;
  const RETRY_MS = 4000;
  const AUTO_DELAY_MS = 2500;
  const CHANGE_DELAY_MS = 1200;
  const CPS_RETRY_DELAY_MS = 1500;

  let autoTimer = null;
  let cpsRetryTimer = null;
  let flushTimer = null;
  let captureBusy = false;
  let selectedRow = null;
  let lastClickTarget = null;
  let lastCapture = null;
  let lastParsed = null;
  let lastCapturedFingerprint = '';
  let cpsAlertWasActive = false;
  let minimized = GM_getValue('spartan_universal_minimized', false);

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const text = value => String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
  const num = value => { const n = Number(String(value ?? '').replace(/[^0-9.+-]/g, '')); return Number.isFinite(n) ? n : null; };
  const uuid = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function getQueue() { return safe(() => JSON.parse(GM_getValue(QUEUE_KEY, '[]')), []) || []; }
  function saveQueue(queue) { GM_setValue(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); }
  function getStoredIdentity() { return safe(() => JSON.parse(GM_getValue(IDENTITY_KEY, 'null')), null); }
  function token() { return safe(() => GM_getValue(TOKEN_KEY, ''), ''); }
  function isBlocked() { return GM_getValue(BLOCKED_KEY, false) === true; }
  function setBlocked(value) { GM_setValue(BLOCKED_KEY, Boolean(value)); }

  function showToast(message, success = true) {
    document.getElementById('spartan-universal-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'spartan-universal-toast';
    toast.textContent = message;
    toast.style.cssText = [
      'position:fixed','top:18px','right:18px','z-index:2147483647',
      'max-width:380px','padding:10px 14px','border-radius:8px',
      'font:600 12px monospace','color:#fff',
      `background:${success ? '#238636' : '#da3633'}`,
      'box-shadow:0 4px 18px rgba(0,0,0,.4)'
    ].join(';');
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function formatBytes(value) {
    const size = new Blob([String(value || '')]).size;
    if (size < 1024) return `${size} B`;
    if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1048576).toFixed(2)} MB`;
  }

  function pageKind() {
    const path = `${location.pathname} ${location.search}`.toLowerCase();

    const local = [...document.querySelectorAll(
      'main,[role="main"],h1,h2,h3,[class*="content"],[class*="page"]'
    )]
      .map(el => text(el.innerText || el.textContent || ''))
      .join('\n')
      .toLowerCase();

    if (/\bthrone\b/.test(path)) return 'throne';
    if (/(military|army|armies)/.test(path)) return 'military';
    if (/(magic|wizard|mage|mystic)/.test(path)) return 'magic';
    if (/(thiev|thief|thieves|thievery)/.test(path)) return 'thievery';
    if (/science/.test(path)) return 'science';
    if (/(build|building)/.test(path)) return 'buildings';
    if (/explor/.test(path)) return 'exploration';
    if (/(kingdom|kd-details|province-list|state)/.test(path)) return 'kingdom';
    if (/intel/.test(location.hostname) || /intel/.test(path)) return 'intel';

    // The real Throne page always opens with "The Province of X (kd:kd)" —
    // check for that first, since it's the only reliable text-based
    // signature. The old "throne room" phrase never actually appears on
    // the page, so throne captures always fell through to "military"
    // below (every page has a persistent "Military" nav link in its text).
    const throneSignature = /\bThe\s+Province\s+of\s+[^\n(]+\(\s*\d{1,3}:\d{1,3}\s*\)/i;
    if (throneSignature.test(local) || throneSignature.test(document.body?.innerText || '')) return 'throne';
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

  function findIdentityHints(source) {
    const all = String(source || '');
    const out = {};

    // Throne is authoritative: extract the province and kingdom
    // from the actual province heading before looking anywhere else.
    const throneIdentity = all.match(
      /\bThe\s+Province\s+of\s+([^\n(]{2,100}?)\s*\(\s*(\d{1,3}:\d{1,3})\s*\)/i
    );

    if (throneIdentity) {
      out.provinceName = text(throneIdentity[1]);
      out.kingdomCode = throneIdentity[2];
    } else {
      // Generic coordinate fallback only when the authoritative
      // Throne identity is not present.
      const coord = all.match(/\b(\d{1,3}:\d{1,3})\b/);
      if (coord) out.kingdomCode = coord[1];
    }

    const patterns = [
      /(?:Province(?: Name)?|Your Province|Current Province)\s*[:\-]\s*([^\n|]{2,100})/i,
      /The Province of\s+([^\n(]{2,100})/i,
      /(?:Welcome|Welcome back)[, ]+([^\n|]{2,100}?)(?:\s+\(?\d{1,3}:\d{1,3}\)?|$)/i,
      /(?:Province|Name)\s*<[^>]*>\s*([^<]{2,100})/i
    ];
    for (const re of patterns) {
      const m = all.match(re);
      if (m?.[1]) { out.provinceName = text(m[1]); break; }
    }
    for (const selector of ['[data-province-name]','[data-province]','[data-current-province]','[data-kingdom-code]','[data-kd-code]','[data-location]']) {
      document.querySelectorAll(selector).forEach(el => {
        const name = text(el.getAttribute('data-province-name') || el.getAttribute('data-province') || el.getAttribute('data-current-province') || '');
        const kd = text(el.getAttribute('data-kingdom-code') || el.getAttribute('data-kd-code') || el.getAttribute('data-location') || '');
        if (!out.provinceName && name) out.provinceName = name;
        if (!out.kingdomCode && /\d{1,3}:\d{1,3}/.test(kd)) out.kingdomCode = kd.match(/\d{1,3}:\d{1,3}/)[0];
      });
    }
    if (!out.provinceName) {
      const title = text(document.title);
      if (title && !/utopia/i.test(title)) {
        const cleaned = title.replace(/\s*[|\-].*$/, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 100) out.titleHint = cleaned;
      }
    }
    return out;
  }

  function currentIdentity() {
    return findIdentityHints(`${text(document.title)}\n${text(document.body?.innerText || '')}`);
  }

  function storedIdentityValid() {
    const id = getStoredIdentity();
    return Boolean(id?.locked && id?.ownerId && id?.provinceName && id?.kingdomCode && token() && !isBlocked());
  }

  function http(url, data, extra = {}) {
    return new Promise(resolve => {
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(value); } };
      const timer = setTimeout(() => finish({ ok: false, status: 0, error: 'timeout' }), 30000);
      try {
        GM_xmlhttpRequest({
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json', ...(extra.headers || {}) },
          data: JSON.stringify(data),
          timeout: 28000,
          onload: response => {
            clearTimeout(timer);
            let body = null;
            try { body = JSON.parse(response.responseText || '{}'); } catch (_) {}
            finish({ ok: response.status >= 200 && response.status < 300, status: response.status, body, error: body?.error || '' });
          },
          onerror: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'network error' }); },
          ontimeout: () => { clearTimeout(timer); finish({ ok: false, status: 0, error: 'timeout' }); }
        });
      } catch (error) {
        clearTimeout(timer);
        finish({ ok: false, status: 0, error: error?.message || 'request error' });
      }
    });
  }

  async function bootstrapIdentity(force = false) {
    if (isBlocked()) return { ok: false, status: 403, error: 'Scraper disabled by Spartan.' };
    const hinted = currentIdentity();
    const existing = getStoredIdentity();
    const existingToken = token();
    const provinceName = hinted.provinceName || (pageKind() === 'throne' ? hinted.titleHint : null) || (force ? existing?.provinceName : null);
    const kingdomCode = hinted.kingdomCode || existing?.kingdomCode;
    if (!provinceName && !kingdomCode) return { ok: false, status: 400, error: 'Open Throne so Spartan can identify this province.' };

    const result = await http(IDENTITY_ENDPOINT, { provinceName, kingdomCode, captureToken: existingToken || undefined }, { headers: { 'x-spartan-capture-key': CAPTURE_KEY } });
    if (!result.ok) {
      if (result.status === 403 || result.body?.code === 'ACCOUNT_NOT_ACTIVE') {
        setBlocked(true);
        showToast('Spartan has disabled this scraper account.', false);
      }
      return result;
    }
    setBlocked(false);
    if (result.body?.captureToken) GM_setValue(TOKEN_KEY, result.body.captureToken);
    if (result.body?.ownerId) GM_setValue(OWNER_KEY, result.body.ownerId);
    const data = {
      ...existing,
      ...result.body,
      provinceName: result.body.provinceName || provinceName,
      kingdomCode: result.body.kingdomCode || kingdomCode,
      locked: true,
      lockedAt: existing?.lockedAt || new Date().toISOString()
    };
    GM_setValue(IDENTITY_KEY, JSON.stringify(data));
    return { ok: true, body: data };
  }

  function structured() {
    const fields = {}, sources = {}, tables = [];
    const visible = text(document.body?.innerText || '');
    const add = (key, value, source) => {
      if (value === null || value === '') return;
      const normalized = text(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'field';

      // Never turn clock/watch-list fragments such as "10:29"
      // into numeric field names like "10": 29.
      if (/^\d+$/.test(normalized)) return;

      if (!(normalized in fields)) { fields[normalized] = value; sources[normalized] = source; }
    };
    /*
     * Utopia Throne tables are real label/value tables.
     * Labels and values are frequently separate adjacent cells,
     * so "Label: Value" parsing alone is insufficient.
     *
     * This parser deliberately requires:
     *   - a known/stat-like label
     *   - a numeric value in the next cell
     *
     * That prevents chat/watch-list content such as:
     *   "10:29" / "11:12"
     * from becoming fields.
     */
    const thronePage = /\bThe\s+Province\s+of\s+[^\n(]+\(\s*\d{1,3}:\d{1,3}\s*\)/i.test(visible || document.body?.innerText || '');

    const throneLabels = {
      'money': 'gold',
      'land': 'acres',
      'net worth': 'networth',
      'networth': 'networth',
      'peasants': 'peons',
      'peons': 'peons',
      'food': 'food',
      'runes': 'runes',
      'soldiers': 'soldiers',
      'thieves': 'thieves',
      'wizards': 'wizards',
      'war horses': 'war_horses',
      'prisoners': 'prisoners',
      'off. points': 'offense',
      'off points': 'offense',
      'def. points': 'defense',
      'def points': 'defense',
      'building eff.': 'build_efficiency',
      'building efficiency': 'build_efficiency'
    };

    function throneCellNumber(value) {
      const raw = text(value);
      if (!/^[-+]?\d[\d,]*(?:\.\d+)?%?$/.test(raw)) return null;
      return num(raw);
    }

    function scanThroneTables() {
      document.querySelectorAll('table').forEach((table, ti) => {
        const rows = [...table.querySelectorAll('tr')];

        rows.forEach((tr, ri) => {
          const cells = [...tr.querySelectorAll('th,td')]
            .map(cell => text(cell.innerText || cell.textContent))
            .filter(Boolean);

          // Normal label -> value pairs.
          for (let ci = 0; ci < cells.length - 1; ci++) {
            const label = cells[ci].toLowerCase().replace(/\s+/g, ' ').trim();
            const key = throneLabels[label];
            if (!key) continue;

            const value = throneCellNumber(cells[ci + 1]);
            if (value !== null) {
              add(key, value, `throne-table:${ti}:${ri}:${ci}`);
            }
          }

          // Some Utopia tables put all labels on one row and
          // all corresponding values on the following row.
          if (ri < rows.length - 1) {
            const nextCells = [...rows[ri + 1].querySelectorAll('th,td')]
              .map(cell => text(cell.innerText || cell.textContent))
              .filter(Boolean);

            const count = Math.min(cells.length, nextCells.length);

            for (let ci = 0; ci < count; ci++) {
              const label = cells[ci].toLowerCase().replace(/\s+/g, ' ').trim();
              const key = throneLabels[label];
              if (!key) continue;

              const value = throneCellNumber(nextCells[ci]);
              if (value !== null) {
                add(key, value, `throne-table:${ti}:${ri}:stacked:${ci}`);
              }
            }
          }
        });
      });
    }

    if (thronePage) scanThroneTables();

    document.querySelectorAll('table').forEach((table, ti) => {
      const rows = [];
      table.querySelectorAll('tr').forEach((tr, ri) => {
        const cells = [...tr.querySelectorAll('th,td')].map(c => text(c.innerText || c.textContent));
        if (cells.length) rows.push(cells);
        cells.forEach((cell, ci) => {
          const pair = cell.match(/^(.{2,80}?)\s*[:=]\s*([+-]?[\d,.]+%?)$/);
          if (pair) add(pair[1], num(pair[2]), `table:${ti}:${ri}:${ci}`);
        });
      });
      if (rows.length) tables.push({ index: ti, rows });
    });
    document.querySelectorAll('dt').forEach((dt, i) => { const dd = dt.nextElementSibling; if (dd?.matches('dd')) add(dt.innerText, /^[-+]?\d[\d,.]*%?$/.test(text(dd.innerText)) ? num(dd.innerText) : text(dd.innerText), `dl:${i}`); });
    document.querySelectorAll('label').forEach((label, i) => { const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,select,textarea'); if (input) add(label.innerText, /^[-+]?\d[\d,.]*%?$/.test(text(input.value)) ? num(input.value) : text(input.value), `label:${i}`); });
    const patterns = {
      acres: [/\bAcres?\b[^\d]{0,20}([\d,]+)/i,/\bLand\b[^\d]{0,20}([\d,]+)/i],
      networth: [/\bNet\s*worth\b[^\d]{0,20}([\d,]+)/i,/\bNW\b[^\d]{0,20}([\d,]+)/i],
      gold: [/\bGold\b[^\d]{0,20}([\d,]+)/i,/\bTreasury\b[^\d]{0,20}([\d,]+)/i],
      food: [/\bFood\b[^\d]{0,20}([\d,]+)/i], runes:[/\bRunes?\b[^\d]{0,20}([\d,]+)/i],
      population:[/\bPopulation\b[^\d]{0,20}([\d,]+)/i], peons:[/\bPeasants?\b[^\d]{0,20}([\d,]+)/i,/\bPeons?\b[^\d]{0,20}([\d,]+)/i],
      soldiers:[/\bSoldiers\b[^\d]{0,20}([\d,]+)/i],
      off_specs:[/(?:^|\n)[A-Za-z][A-Za-z .'-]*\s+([\d,]+)\s+[\d.]+ospa\b/im,/\bOff(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i],
      def_specs:[/(?:^|\n)[A-Za-z][A-Za-z .'-]*\s+([\d,]+)\s+[\d.]+dspa\b/im,/\bDef(?:ensive)?\s*Specs?\b[^\d]{0,20}([\d,]+)/i],
      elites:[/(?:^|\n)[A-Za-z][A-Za-z .'-]*\s+([\d,]+)\s+[\d.]+epa\b/im,/\bElites?\b[^\d]{0,20}([\d,]+)/i],
      thieves:[/\bThieves\s+([\d,]+)/i], wizards:[/\bWizards\s+([\d,]+)/i],
      tpa:[/\bThieves\s+[\d,]+(?:\s+\(\d+%\))?\s+([\d.]+)tpa\b/i],
      wpa:[/\bWizards\s+[\d,]+(?:\s+\(\d+%\))?\s+([\d.]+)wpa\b/i],
      generals:[/\bGenerals\b[^\d]{0,20}([\d,]+)/i], prisoners:[/\bPrisoners\b[^\d]{0,20}([\d,]+)/i], war_horses:[/\bWar\s*Horses\b[^\d]{0,20}([\d,]+)/i],
      offense:[/\bOff\.\s*Points\b[^\d]{0,20}([\d,]+)/i,/\bOffen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i],
      off_available:[/\bOff\.\s*Points\b[^(]{0,40}\(([\d,]+)\)/i],
      armies_days_left:[/\bArmies\s*:\s*\(([\d.]+)\s*days?\s*left\)/i],
      armies_last_acres:[/\bArmies\s*:\s*\([\d.]+\s*days?\s*left\)\s*\(([\d,]+)\)/i],
      defense:[/\bDef\.\s*Points\b[^\d]{0,20}([\d,]+)/i,/\bDefen[cs]e(?:\s*Points?)?\b[^\d]{0,20}([\d,]+)/i],
      mana:[/\bMana\b[^\d]{0,20}([\d,]+)/i], stealth:[/\bStealth\b[^\d]{0,20}([\d,.]+)%?/i],
      build_efficiency:[/\bBuild(?:ing)?\s*Efficiency\b[^\d]{0,20}([\d,.]+)%?/i], wages:[/\bWages\b[^\d]{0,20}([\d,.]+)/i],
      r_tpa:[/\bRate\s*TPA\b[^\d]{0,20}([\d,.]+)/i], o_tpa:[/\bOff(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i], d_tpa:[/\bDef(?:ense)?\s*TPA\b[^\d]{0,20}([\d,.]+)/i],
      r_wpa:[/\bRate\s*WPA\b[^\d]{0,20}([\d,.]+)/i], o_wpa:[/\bOff(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i], d_wpa:[/\bDef(?:ense)?\s*WPA\b[^\d]{0,20}([\d,.]+)/i]
    };
    for (const [key, list] of Object.entries(patterns)) for (const re of list) { const m = visible.match(re); if (m) { add(key, num(m[1]), `text:${key}`); break; } }

    // The shared resource bar (Money/Peasants/Food/Runes/Net Worth/Land/Net Worth per Acre) is a
    // header row followed by an aligned value row. The generic proximity patterns above can grab
    // the wrong column -- e.g. the "Net Worth" label also appears inside "Net Worth/Acre" right
    // before the value row starts, so the regex latches onto that occurrence and grabs the FIRST
    // value in the row (Money) instead of the real Net Worth column; "Land" suffers the same way.
    // Separately, "Gold" as a label doesn't even appear on this bar (it's called "Money" here), so
    // the generic gold pattern was matching unrelated nearby text (e.g. a "Gold Status" nav link)
    // instead. This exact structural match reads all 6 real values by position and overrides any
    // wrong guesses above, for every page that shows this bar (not just Throne).
    const resourceBar = visible.match(/Money\s+Peasants\s+Food\s+Runes\s+Net\s*Worth\s+Land\s+Net\s*Worth\/Acre\s*\n?\s*([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)/i);
    if (resourceBar) {
      fields.gold = num(resourceBar[1]); sources.gold = 'resource-bar';
      fields.peons = num(resourceBar[2]); sources.peons = 'resource-bar';
      fields.food = num(resourceBar[3]); sources.food = 'resource-bar';
      fields.runes = num(resourceBar[4]); sources.runes = 'resource-bar';
      fields.networth = num(resourceBar[5]); sources.networth = 'resource-bar';
      fields.acres = num(resourceBar[6]); sources.acres = 'resource-bar';
    }
    if (thronePage) {
      const throneUnitPatterns = [
        ['off_specs', /\b[A-Za-z][A-Za-z .'-]*\s+([\d,]+)\s+[\d.]+ospa\b/i],
        ['def_specs', /\b[A-Za-z][A-Za-z .'-]*\s+([\d,]+)\s+[\d.]+dspa\b/i],
        ['elites', /\b[A-Za-z][A-Za-z .'-]*\s+([\d,]+)\s+[\d.]+epa\b/i]
      ];

      for (const [key, re] of throneUnitPatterns) {
        const match = visible.match(re);
        if (match) add(key, num(match[1]), `throne-unit:${key}`);
      }

      // Combined Throne values.
      const tpaMatch = visible.match(/\bThieves\s+[\d,]+(?:\s+\(\d+%\))?\s+([\d.]+)tpa\b/i);
      const wpaMatch = visible.match(/\bWizards\s+[\d,]+(?:\s+\(\d+%\))?\s+([\d.]+)wpa\b/i);

      if (tpaMatch) add('tpa', num(tpaMatch[1]), 'throne-unit:tpa');
      if (wpaMatch) add('wpa', num(wpaMatch[1]), 'throne-unit:wpa');

      const buildEff = visible.match(/\bBuilding\s+Eff\.\s*([\d.]+)%/i);
      if (buildEff) add('build_efficiency', num(buildEff[1]), 'throne-label:Building Eff.');

      // These labels are authoritative on Throne and must override
      // misleading summary-table proximity matches.
      const exactThroneFields = [
        ['gold', /\bMoney\s+([\d,]+)/i],
        ['acres', /\bLand\s+([\d,]+)/i],
        ['networth', /\bNetworth\s+([\d,]+)/i],
        ['peons', /\bPeasants\s+([\d,]+)/i],
        ['food', /\bFood\s+([\d,]+)/i],
        ['runes', /\bRunes\s+([\d,]+)/i],
        ['soldiers', /\bSoldiers\s+([\d,]+)/i],
        ['thieves', /\bThieves\s+([\d,]+)/i],
        ['wizards', /\bWizards\s+([\d,]+)/i],
        ['war_horses', /\bWar\s+Horses\s+([\d,]+)/i],
        ['prisoners', /\bPrisoners\s+([\d,]+)/i],
        ['offense', /\bOff\.\s*Points\s+([\d,]+)/i],
        ['defense', /\bDef\.\s*Points\s+([\d,]+)/i]
      ];

      // Explicit Throne labels are authoritative. Replace any
      // earlier proximity-derived value from a summary table.
      for (const [key, re] of exactThroneFields) {
        const match = visible.match(re);
        if (match) {
          fields[key] = num(match[1]);
          sources[key] = `throne-exact:${key}`;
        }
      }
    }

    const id = currentIdentity();
    if (id.provinceName) add('province_name', id.provinceName, 'identity');

    // Throne heading is authoritative for the parsed kingdom code.
    // This prevents sitter/chat coordinates from leaking into the payload.
    if (thronePage) {
      const throneIdentity = visible.match(
        /\bThe\s+Province\s+of\s+([^\n(]{2,100}?)\s*\(\s*(\d{1,3}:\d{1,3})\s*\)/i
      );

      if (throneIdentity) {
        fields.province_name = text(throneIdentity[1]);
        fields.kingdom_code = throneIdentity[2];
        sources.province_name = 'throne-heading';
        sources.kingdom_code = 'throne-heading';
      }
    } else {
      // On non-Throne pages, prefer the locked/stored identity (set once from a real
      // Throne visit) over a fresh live-page guess. The live fallback regex just matches
      // ANY \d{1,3}:\d{1,3} pattern anywhere on the page, which can just as easily hit a
      // clock/countdown display in shared page chrome as a real kingdom coordinate -- and
      // since that chrome is identical for every player, a bad match there silently tags
      // captures with the same wrong "kingdom" for everyone. Only fall back to the live
      // guess if we have no locked identity yet to trust.
      const stored = getStoredIdentity();
      const trustedKingdomCode = (stored?.locked && stored?.kingdomCode) ? stored.kingdomCode : id.kingdomCode;
      if (trustedKingdomCode) {
        add('kingdom_code', trustedKingdomCode, (stored?.locked && stored?.kingdomCode) ? 'stored-identity' : 'identity');
      }
    }
    return {
      fields,
      tables,
      links: [...document.querySelectorAll('a[href]')].map(a => ({ text: text(a.innerText || a.textContent), href: a.href })),
      forms: [...document.querySelectorAll('form')].map((f, i) => ({ index:i, action:f.action, method:f.method || 'get', fields:[...f.elements].map(e => ({ name:e.name || '', type:e.type || e.tagName.toLowerCase(), value:e.value || '' })) })),
      field_sources: sources
    };
  }

  async function extractGrid() {
    const gridEl = document.querySelector('[role="grid"],[role="treegrid"]');
    if (!gridEl) return null;

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const keyOf = (el, i) =>
      el.getAttribute('data-field') ||
      el.getAttribute('col-id') ||
      el.getAttribute('aria-colindex') ||
      String(i);

    const cellValue = el => {
      const value = text(el.innerText || el.textContent || '');
      const labels = [...el.querySelectorAll('[title],[aria-label],img[alt]')]
        .map(x => x.getAttribute('title') || x.getAttribute('aria-label') || x.getAttribute('alt') || '')
        .filter(Boolean);
      return labels.length ? { text: value, labels: [...new Set(labels)] } : value;
    };

    const collectVisible = (byId, columns, seenColumns) => {
      document.querySelectorAll('[role="columnheader"]').forEach((h, i) => {
        const key = keyOf(h, i);
        if (seenColumns.has(key)) return;
        seenColumns.add(key);
        columns.push({ key, label: text(h.innerText || h.textContent || '') });
      });

      document.querySelectorAll('[role="row"]').forEach(r => {
        const cells = [...r.querySelectorAll('[role="gridcell"],[role="cell"]')];
        if (!cells.length) return;

        const ariaIndex = r.getAttribute('aria-rowindex');
        let stableId = r.getAttribute('data-id') || r.getAttribute('row-id') || '';

        if (!stableId) {
          const idCell = cells.find((c, i) => keyOf(c, i) === 'id');
          stableId = text(idCell?.innerText || idCell?.textContent || '');
        }

        const rowKey = stableId || ariaIndex || `row-${byId.size}`;
        const rec = byId.get(rowKey) || { id: rowKey, cells: {} };

        cells.forEach((c, ci) => {
          rec.cells[keyOf(c, ci)] = cellValue(c);
        });

        byId.set(rowKey, rec);
      });
    };

    const scroller =
      gridEl.querySelector('.MuiDataGrid-virtualScroller') ||
      gridEl.querySelector('[class*="virtualScroller"]') ||
      [...gridEl.querySelectorAll('*')].find(el =>
        el.scrollHeight > el.clientHeight + 20 &&
        el.clientHeight > 100 &&
        getComputedStyle(el).overflowY !== 'visible'
      );

    const columns = [];
    const seenColumns = new Set();
    const byId = new Map();

    // First collect what is already rendered.
    collectVisible(byId, columns, seenColumns);

    if (!scroller) {
      const rows = [...byId.values()];
      return {
        columns,
        rows,
        row_count: rows.length,
        expected_row_count: Number(gridEl.getAttribute('aria-rowcount')) > 0 ? Math.max(0, Number(gridEl.getAttribute('aria-rowcount')) - 1) : null,
        complete_rows: Number(gridEl.getAttribute('aria-rowcount')) > 0 ? rows.length >= Math.max(0, Number(gridEl.getAttribute('aria-rowcount')) - 1) : null,
        expected_column_count: Number(gridEl.getAttribute('aria-colcount')) || null,
        complete_columns: Number(gridEl.getAttribute('aria-colcount')) > 0 ? columns.length >= Number(gridEl.getAttribute('aria-colcount')) : null,
        aria_rowcount: gridEl.getAttribute('aria-rowcount') || null,
        aria_colcount: gridEl.getAttribute('aria-colcount') || null,
        tabs: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')]
          .map(t => text(t.innerText || ''))
          .filter(Boolean)
      };
    }

    const originalTop = scroller.scrollTop;
    const originalLeft = scroller.scrollLeft;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const yStep = Math.max(160, Math.floor(scroller.clientHeight * 0.75));
    const xStep = Math.max(240, Math.floor(scroller.clientWidth * 0.75));

    const yPositions = [];
    for (let y = 0; y <= maxTop; y += yStep) yPositions.push(y);
    if (!yPositions.includes(maxTop)) yPositions.push(maxTop);

    const xPositions = [];
    for (let x = 0; x <= maxLeft; x += xStep) xPositions.push(x);
    if (!xPositions.includes(maxLeft)) xPositions.push(maxLeft);

    // MUI DataGrid virtualizes both rows and columns. Walk the whole
    // virtual viewport so we collect all province rows AND all 39 columns,
    // then merge pinned/main duplicates by the stable province id.
    for (const x of xPositions) {
      scroller.scrollLeft = x;
      await wait(90);

      for (const y of yPositions) {
        scroller.scrollTop = y;
        await wait(120);
        collectVisible(byId, columns, seenColumns);
      }
    }

    scroller.scrollTop = originalTop;
    scroller.scrollLeft = originalLeft;
    await wait(60);

    const rows = [...byId.values()];
    const ariaRowcount = gridEl.getAttribute('aria-rowcount') || null;
    const expectedRows = Number(ariaRowcount) > 0 ? Math.max(0, Number(ariaRowcount) - 1) : null;

    return {
      columns,
      rows,
      row_count: rows.length,
      expected_row_count: expectedRows,
      complete_rows: expectedRows == null ? null : rows.length >= expectedRows,
      expected_column_count: Number(gridEl.getAttribute('aria-colcount')) || null,
      complete_columns: Number(gridEl.getAttribute('aria-colcount')) > 0 ? columns.length >= Number(gridEl.getAttribute('aria-colcount')) : null,
      aria_rowcount: ariaRowcount,
      aria_colcount: gridEl.getAttribute('aria-colcount') || null,
      tabs: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')]
        .map(t => text(t.innerText || ''))
        .filter(Boolean)
    };
  }

  async function capture() {
    const isIntel = /intel\./.test(location.hostname);
    const grid = isIntel ? await extractGrid() : null;
    const rawDom = grid ? '' : (document.documentElement?.outerHTML || '');
    const visibleText = text(document.body?.innerText || '');
    const s = safe(structured, { fields:{}, tables:[], links:[], forms:[], field_sources:{} });

    // Intel's MUI grid is the authoritative source for Kingdom rows.
    // Do not let generic page-text regexes turn clocks/row numbers into
    // fake acres/networth/field values.
    if (grid) {
      delete s.fields.field;
      delete s.fields.acres;
      delete s.fields.networth;
      delete s.field_sources.field;
      delete s.field_sources.acres;
      delete s.field_sources.networth;

      const firstRow = grid.rows?.[0];
      const kingdomCode = text(
        firstRow?.cells?.location?.text ??
        firstRow?.cells?.location ??
        getStoredIdentity()?.kingdomCode ??
        currentIdentity()?.kingdomCode ??
        ''
      );
      if (kingdomCode) {
        s.fields.kingdom_code = kingdomCode;
        s.field_sources.kingdom_code = 'intel-grid';
      }
      s.fields.kingdom_province_count = grid.rows?.length || 0;
      s.field_sources.kingdom_province_count = 'intel-grid';
    }

    const id = uuid();
    const locked = getStoredIdentity();
    const ident = locked || currentIdentity();

    return {
      captureId:id,
      capturedAt:new Date().toISOString(),
      source:SOURCE,
      sourceId:id,
      scraperVersion:VERSION,
      pageKind:pageKind(),
      url:location.href,
      provinceName:ident?.provinceName || '',
      kingdomCode:ident?.kingdomCode || '',
      rawText:visibleText,
      rawPayload:{
        capture_engine:VERSION,
        page:{ url:location.href, origin:location.origin, hostname:location.hostname, pathname:location.pathname, search:location.search, hash:location.hash, title:document.title || '', readyState:document.readyState, language:document.documentElement?.lang || null },
        identity:ident,
        rawDom,
        rawDomOmitted:Boolean(grid),
        grid,
        structured:s
      },
      parsedPayload:s.fields
    };
  }

  function fingerprint() {
    const panel = document.getElementById(PANEL_ID);
    const oldDisplay = panel?.style.display;
    if (panel) panel.style.display = 'none';
    const body = text(document.body?.innerText || '');
    if (panel) panel.style.display = oldDisplay || '';
    const sample = `${location.href}|${document.title}|${body.length}|${body.slice(0,700)}|${body.slice(-700)}`;
    let h = 2166136261;
    for (let i=0;i<sample.length;i++) h = Math.imul(h ^ sample.charCodeAt(i),16777619);
    return `${(h >>> 0).toString(16)}-${sample.length}`;
  }

  function isCpsAlertActive() {
    const nodes = document.querySelectorAll('[role="alert"],[aria-live],.alert,.notice,.notification,.toast,.message,[class*="alert"],[class*="notice"],[class*="toast"]');
    return [...nodes].some(node => /\bCPS\b/i.test(text(node.innerText || node.textContent || '')));
  }

  function enqueue(record) {
    const queue = getQueue();
    if (queue.some(item => item.fingerprint === record.fingerprint)) return;
    queue.push({ capture:record, fingerprint:record.fingerprint, attempts:0, queuedAt:new Date().toISOString() });
    saveQueue(queue);
  }

  async function send(record) {
    const t = token();
    if (!t || isBlocked()) return { ok:false, status:isBlocked() ? 403 : 401, error:isBlocked() ? 'Scraper disabled by Spartan.' : 'No valid scraper token' };
    return http(ENDPOINT, { capture:record }, { headers:{ 'x-spartan-capture-token':t, 'x-spartan-capture-key':CAPTURE_KEY } });
  }

  async function flushQueue() {
    if (captureBusy || isBlocked()) return;
    const queue = getQueue();
    if (!queue.length) return;
    captureBusy = true;
    try {
      while (queue.length && !isBlocked()) {
        const item = queue[0];
        renderPanel(item.capture, `Sending ${item.capture.pageKind}…`, true);
        const result = await send(item.capture);
        if (result.ok) {
          queue.shift();
          saveQueue(queue);
          GM_setValue(LAST_KEY, item.fingerprint);
          lastCapturedFingerprint = item.fingerprint;
          lastCapture = item.capture;
          lastParsed = item.capture.parsedPayload || {};
          renderPanel(item.capture, `Saved ✓ · ${item.capture.pageKind}`, true);
          continue;
        }
        if (result.status === 401 || result.status === 403) {
          setBlocked(true);
          renderPanel(item.capture, `Spartan disabled capture · HTTP ${result.status}`, false);
          showToast(result.error || result.body?.error || 'Spartan rejected this scraper.', false);
          break;
        }
        item.attempts = (item.attempts || 0) + 1;
        saveQueue(queue);
        renderPanel(item.capture, `Queued · retry ${item.attempts}/${RETRIES}`, false);

        if (item.attempts >= RETRIES) {
          queue.shift();
          saveQueue(queue);
          renderPanel(item.capture, 'Capture dropped after retries', false);
          continue;
        }

        setTimeout(() => {
          flushQueue().catch(err => {
            console.error('[Spartan] queued retry failed:', err);
          });
        }, RETRY_MS);

        break;
      }
    } finally {
      captureBusy = false;
    }
  }

  async function captureNow(manual = false, reason = 'manual') {
    if (isBlocked()) { renderPanel(lastCapture, 'Disabled by Spartan', false); return; }
    if (captureBusy) return;
    const kind = pageKind();
    if (!storedIdentityValid()) {
      if (kind === 'throne') {
        renderPanel(lastCapture, 'Linking Utopia identity…', true);
        const linked = await bootstrapIdentity();
        if (!linked.ok) { renderPanel(lastCapture, linked.body?.error || linked.error || `Identity HTTP ${linked.status || 0}`, false); return; }
        showToast(`Spartan identity linked · ${linked.body?.provinceName || 'Province'}`, true);
      } else {
        renderPanel(lastCapture, 'Open Throne once to link this province', false);
        return;
      }
    }
    const fp = fingerprint();
    if (!manual && fp === GM_getValue(LAST_KEY, '')) return;
    const record = await capture();
    record.captureReason = reason;
    record.fingerprint = fp;

    const grid = record.rawPayload?.grid;
    if (grid && ((grid.complete_rows === false) || (grid.complete_columns === false) || (grid.expected_row_count != null && grid.row_count < grid.expected_row_count) || (grid.expected_column_count != null && (grid.columns?.length || 0) < grid.expected_column_count))) {
      const rowStatus = grid.expected_row_count != null ? `${grid.row_count}/${grid.expected_row_count} rows` : `${grid.row_count} rows`;
      const colStatus = grid.expected_column_count != null ? `${grid.columns?.length || 0}/${grid.expected_column_count} columns` : `${grid.columns?.length || 0} columns`;
      const message = `Intel grid incomplete — ${rowStatus}, ${colStatus}. Nothing sent.`;
      lastCapture = record;
      lastParsed = record.parsedPayload;
      renderPanel(record, message, false);
      showToast(message, false);
      return;
    }

    lastCapture = record;
    lastParsed = record.parsedPayload;
    enqueue(record);
    renderPanel(record, `Queued · ${kind}`, true);
    await flushQueue();
    if (manual) {
      const grid = record.rawPayload?.grid;
      const payloadSize = grid ? formatBytes(JSON.stringify(grid)) : formatBytes(record.rawPayload?.rawDom || '');
      const detail = grid ? `Intel grid · ${grid.row_count}/${grid.expected_row_count ?? '?'} rows · ${grid.columns?.length || 0} columns · ${payloadSize}` : `DOM · ${payloadSize}`;
      showToast(`Captured ${detail}`, Boolean(!grid || grid.complete_rows !== false));
    }

  function scheduleAutoCapture(delay = AUTO_DELAY_MS) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      captureNow(false, 'page');
    }, delay);
  }

  function scheduleCpsRetry() {
    clearTimeout(cpsRetryTimer);
    cpsRetryTimer = setTimeout(() => {
      if (isCpsAlertActive()) captureNow(false, 'cps');
    }, CPS_RETRY_DELAY_MS);
  }

  function watchNavigation() {
    for (const method of ['pushState','replaceState']) {
      const original = history[method];
      if (typeof original !== 'function') continue;
      history[method] = function () {
        const result = original.apply(this, arguments);
        setTimeout(() => scheduleAutoCapture(CHANGE_DELAY_MS), 100);
        return result;
      };
    }
    addEventListener('popstate', () => setTimeout(() => scheduleAutoCapture(CHANGE_DELAY_MS), 100));
  }

  function watchCps() {
    const observer = new MutationObserver(() => {
      const active = isCpsAlertActive();
      if (active && !cpsAlertWasActive) {
        cpsAlertWasActive = true;
        captureNow(false, 'cps');
      } else if (!active && cpsAlertWasActive) {
        cpsAlertWasActive = false;
      } else if (active) {
        scheduleCpsRetry();
      }
    });
    observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true, attributes:true });
  }

  function copyText(value, message) { GM_setClipboard(String(value || ''), 'text'); showToast(message, true); }
  function copyDom() { const html = document.documentElement?.outerHTML || ''; if (!html) return showToast('No DOM available', false); copyText(html, `Copied complete DOM (${formatBytes(html)})`); }
  function copyVisibleText() { const value = text(document.body?.innerText || ''); if (!value) return showToast('No visible text found', false); copyText(value, `Copied visible text (${formatBytes(value)})`); }
  function copyParsedFields() { if (!lastParsed) return showToast('Capture a page first', false); const grid=lastCapture?.rawPayload?.grid; copyText(JSON.stringify(grid ? { parsed:lastParsed, grid } : lastParsed,null,2), grid ? 'Copied parsed fields + grid JSON' : 'Copied parsed fields JSON'); }
  function recordContainerFor(target) {
    if (!target || !target.closest) return null;
    const aria = target.closest('[role="row"]'); if (aria) return { el: aria, why: 'aria row', candidates: [] };
    const tr = target.closest('tr'); if (tr) return { el: tr, why: 'table row', candidates: [] };
    const sig = n => `${n.tagName}|${n.getAttribute('role') || ''}|${typeof n.className === 'string' ? n.className : ''}`;
    const candidates = []; let node = target;
    while (node && node !== document.body && node !== document.documentElement) {
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(c => sig(c) === sig(node)).length;
        if (same >= 5) candidates.push({ el: node, same, len: (node.innerText || '').length });
      }
      node = parent;
    }
    if (!candidates.length) return null;
    const rows = candidates.filter(c => c.len > 0 && c.len < 3000);
    const chosen = (rows.length ? rows : candidates).slice(-1)[0];
    return { el: chosen.el, why: `repeated container (${chosen.same} siblings)`, candidates: candidates.map(c => `${c.el.tagName.toLowerCase()} x${c.same} text:${c.len}`) };
  }
  function copySelectedRow() {
    const found = selectedRow ? { el: selectedRow, why: 'selected row', candidates: [] } : recordContainerFor(lastClickTarget);
    if (found?.el) { const head = `<!-- ${found.why}${found.candidates.length ? ' | candidates: ' + found.candidates.join('; ') : ''} -->\n`; return copyText(head + found.el.outerHTML, 'Copied row HTML'); }
    const first = document.querySelector('tr,[role="row"]'); if (first) return copyText(first.outerHTML, 'Copied row HTML');
    showToast('Tap a province row first, then press Copy Row', false);
  }
  function clearQueue() { saveQueue([]); renderPanel(lastCapture, 'Queue cleared', true); showToast('Spartan capture queue cleared', true); }
  function relink() { setBlocked(false); if (pageKind() === 'throne') bootstrapIdentity(true).then(result => renderPanel(lastCapture, result.ok ? 'Identity linked ✓' : (result.error || result.body?.error || `HTTP ${result.status}`), result.ok)); else renderPanel(lastCapture, 'Open Throne to relink identity', false); }

  function makeButton(label, handler, secondary = false) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.style.cssText = ['flex:1','padding:8px 6px','border:0','border-radius:6px',`background:${secondary ? '#30363d' : '#238636'}`,'color:#fff','font:bold 11px monospace','cursor:pointer'].join(';');
    button.addEventListener('click', handler);
    return button;
  }

  function renderPanel(record = lastCapture, state = 'Ready', success = true) {
    const panel = document.getElementById(PANEL_ID); if (!panel) return;
    panel.replaceChildren();
    if (minimized) {
      const compact = document.createElement('div');
      compact.style.cssText = 'display:flex;align-items:center;gap:8px;color:#7ee787;font:bold 12px monospace';
      compact.append('⚡ Spartan Capture');
      const expand = makeButton('▲', () => { minimized=false; GM_setValue('spartan_universal_minimized',false); renderPanel(record,state,success); }, true);
      expand.style.flex='0 0 auto'; compact.appendChild(expand); panel.appendChild(compact); return;
    }
    const header = document.createElement('div');
    header.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:7px';
    const title=document.createElement('div'); title.textContent=`⚡ Spartan Universal Capture v${VERSION}`; title.style.cssText='color:#7ee787;font:bold 13px monospace';
    const minimize=makeButton('—',()=>{ minimized=true; GM_setValue('spartan_universal_minimized',true); renderPanel(record,state,success); },true); minimize.style.flex='0 0 auto'; header.append(title,minimize); panel.appendChild(header);
    const note=document.createElement('div'); note.textContent='Full DOM + virtualized Intel grid + structured parser + Spartan authorization'; note.style.cssText='color:#8b949e;font:9px monospace;line-height:1.35;margin-bottom:7px'; panel.appendChild(note);
    const status=document.createElement('div'); status.textContent=state; status.style.cssText=`color:${success ? '#7ee787':'#ff7b72'};font:10px monospace;word-break:break-word;margin-bottom:7px`; panel.appendChild(status);

    const first=document.createElement('div'); first.style.cssText='display:flex;gap:6px;margin-bottom:6px'; first.append(makeButton('Capture',()=>captureNow(true,'manual')),makeButton('Copy DOM',copyDom,true)); panel.appendChild(first);
    const second=document.createElement('div'); second.style.cssText='display:flex;gap:6px;margin-bottom:6px'; second.append(makeButton('Copy Text',copyVisibleText,true),makeButton('Copy Parsed',copyParsedFields,true)); panel.appendChild(second);
    const third=document.createElement('div'); third.style.cssText='display:flex;gap:6px;margin-bottom:6px'; third.append(makeButton('Copy Row',copySelectedRow,true),makeButton('Refresh',()=>location.reload(),true)); panel.appendChild(third);
    const fourth=document.createElement('div'); fourth.style.cssText='display:flex;gap:6px'; fourth.append(makeButton('Clear Queue',clearQueue,true),makeButton('Relink',relink,true)); panel.appendChild(fourth);

    const id=getStoredIdentity();
    const identityLine=document.createElement('div'); identityLine.style.cssText='margin-top:7px;padding-top:6px;border-top:1px solid #30363d;color:#8b949e;font:9px monospace;line-height:1.4;word-break:break-word';
    identityLine.textContent=isBlocked() ? 'AUTH: DISABLED BY SPARTAN' : id?.locked ? `AUTH: linked · ${id.provinceName} · ${id.kingdomCode}` : 'AUTH: not linked · open Throne'; panel.appendChild(identityLine);
    if (record) { const metadata=document.createElement('div'); metadata.style.cssText='margin-top:5px;color:#8b949e;font:9px monospace;line-height:1.4;word-break:break-word'; const grid=record.rawPayload?.grid;\n      const size=grid ? formatBytes(JSON.stringify(grid)) : formatBytes(record.rawPayload?.rawDom || '');\n      metadata.textContent=grid ? `${record.url || location.pathname} · kind:${record.pageKind || pageKind()} · grid:${grid.row_count}/${grid.expected_row_count ?? '?'} rows · ${grid.columns?.length || 0} cols · ${size}` : `${record.url || location.pathname} · kind:${record.pageKind || pageKind()} · ${size} DOM · ${Object.keys(record.parsedPayload || {}).length} fields`; panel.appendChild(metadata); }
  }

  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel=document.createElement('div'); panel.id=PANEL_ID; panel.style.cssText='position:fixed;right:14px;bottom:14px;width:300px;padding:11px;z-index:2147483646;background:#0d1117;border:1px solid #30363d;border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.45)'; document.documentElement.appendChild(panel);
    renderPanel(null,isBlocked() ? 'Disabled by Spartan' : 'Ready',!isBlocked());
    document.addEventListener('click',event=>{ if(event.target?.closest?.('#'+PANEL_ID)) return; lastClickTarget=event.target; const row=event.target?.closest?.('tr,[role="row"]'); selectedRow=(row && !event.target.closest('button,input,select,textarea,a')) ? row : null; },true);
  }

  function boot() {
    installPanel();
    watchNavigation();
    watchCps();
    scheduleAutoCapture();
    if (getQueue().length) setTimeout(flushQueue, 800);
    if (pageKind() === 'throne' && !storedIdentityValid() && !isBlocked()) setTimeout(() => bootstrapIdentity().then(result => { if (result.ok) renderPanel(lastCapture, `Identity linked ✓ · ${result.body?.provinceName || 'Province'}`, true); }), 500);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
