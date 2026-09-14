// ==UserScript==
// @name         Spartan Universal Capture
// @namespace    spartan-universal-capture
// @version      1.0.0
// @description  Capture every Utopia page as raw DOM for Spartan's vault, AND parse throne/province-style pages into structured stats so the live dashboard populates.
// @match        https://www.utopia-game.com/*
// @match        https://utopia-game.com/*
// @match        https://intel.utopia-game.com/*
// @match        https://intel.utopia.site/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @connect      spartan-dashboard.onrender.com
// @run-at       document-end
// @all-frames   false
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "1.0.0";
  const SOURCE = "universal_capture";
  const ENDPOINT = "https://spartan-dashboard.onrender.com/api/capture";
  const CAPTURE_KEY = "NikkoAce";
  const PANEL_ID = "spartan-universal-capture-panel";
  const AUTO_DELAY_MS = 2500;

  let autoTimer = null;
  let captureBusy = false;
  let lastCapturedUrl = "";
  let lastCapture = null;
  let lastParsed = null;
  let selectedRow = null;
  let minimized = GM_getValue("spartan_universal_minimized", false);

  function showToast(message, success = true) {
    document.getElementById("spartan-universal-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "spartan-universal-toast";
    toast.textContent = message;
    toast.style.cssText = [
      "position:fixed", "top:18px", "right:18px", "z-index:2147483647",
      "max-width:360px", "padding:10px 14px", "border-radius:8px",
      "font:600 12px monospace", "color:#fff",
      `background:${success ? "#238636" : "#da3633"}`,
      "box-shadow:0 4px 18px rgba(0,0,0,.4)"
    ].join(";");
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function formatBytes(value) {
    const size = new Blob([String(value || "")]).size;
    if (size < 1024) return `${size} B`;
    if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1048576).toFixed(2)} MB`;
  }

  function makeCaptureId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function findIdentityHints(text) {
    const identity = {};
    const sourceText = String(text || "");

    const provinceMatch = sourceText.match(
      /(?:Province:\s*|The Province of\s+)([^\n(]{2,80})\s*\(?([0-9]+:[0-9]+)?/i
    );
    if (provinceMatch) {
      identity.province = provinceMatch[1].trim();
      if (provinceMatch[2]) identity.kd_code = provinceMatch[2];
    }
    if (!identity.kd_code) {
      const kdMatch = sourceText.match(/\b(\d+):(\d+)\b/);
      if (kdMatch) identity.kd_code = `${kdMatch[1]}:${kdMatch[2]}`;
    }
    return identity;
  }

  function grab(text, ...patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1] !== undefined) {
        const cleaned = match[1].replace(/,/g, "").trim();
        const n = Number(cleaned);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  }

  function parseThroneFields(visibleText) {
    const t = String(visibleText || "");
    const fields = {
      acres: grab(t, /Acres[:\s]+([\d,]+)/i, /Land[:\s]+([\d,]+)/i),
      nw: grab(t, /Net\s*worth[:\s]+([\d,]+)/i, /\bNW[:\s]+([\d,]+)/i),
      gold: grab(t, /Gold[:\s]+([\d,]+)/i, /Treasury[:\s]+([\d,]+)/i),
      food: grab(t, /Food[:\s]+([\d,]+)/i, /Granaries?[:\s]+([\d,]+)/i),
      runes: grab(t, /Runes?[:\s]+([\d,]+)/i),
      peons: grab(t, /Peasants?[:\s]+([\d,]+)/i, /Peons?[:\s]+([\d,]+)/i, /Population[:\s]+([\d,]+)/i),
      soldiers: grab(t, /Soldiers[:\s]+([\d,]+)/i),
      off_specs: grab(t, /Off(?:ensive)?\s*Specs[:\s]+([\d,]+)/i, /Attack\s*Specialists[:\s]+([\d,]+)/i),
      def_specs: grab(t, /Def(?:ensive)?\s*Specs[:\s]+([\d,]+)/i, /Defense\s*Specialists[:\s]+([\d,]+)/i),
      elites: grab(t, /Elites?[:\s]+([\d,]+)/i),
      thieves: grab(t, /Thieves[:\s]+([\d,]+)/i),
      wizards: grab(t, /Wizards[:\s]+([\d,]+)/i),
      generals: grab(t, /Generals[:\s]+([\d,]+)/i),
      prisoners: grab(t, /Prisoners[:\s]+([\d,]+)/i),
      war_horses: grab(t, /War\s*Horses[:\s]+([\d,]+)/i),
      off: grab(t, /Offen[cs]e\s*Points?[:\s]+([\d,]+)/i, /^Offen[cs]e[:\s]+([\d,]+)/im),
      def: grab(t, /Defen[cs]e\s*Points?[:\s]+([\d,]+)/i, /^Defen[cs]e[:\s]+([\d,]+)/im),
      mana: grab(t, /Mana[:\s]+([\d,]+)/i),
      stlth: grab(t, /Stealth[:\s]+([\d,]+)%?/i),
      be: grab(t, /Build(?:ing)?\s*Efficiency[:\s]+([\d,.]+)%?/i),
      wages: grab(t, /Wages[:\s]+([\d,.]+)/i),
      r_tpa: grab(t, /Rate\s*TPA[:\s]+([\d,.]+)/i),
      o_tpa: grab(t, /Off(?:ense)?\s*TPA[:\s]+([\d,.]+)/i),
      d_tpa: grab(t, /Def(?:ense)?\s*TPA[:\s]+([\d,.]+)/i),
      r_wpa: grab(t, /Rate\s*WPA[:\s]+([\d,.]+)/i),
      o_wpa: grab(t, /Off(?:ense)?\s*WPA[:\s]+([\d,.]+)/i),
      d_wpa: grab(t, /Def(?:ense)?\s*WPA[:\s]+([\d,.]+)/i),
    };

    const identity = findIdentityHints(t);
    if (identity.province) fields.name = identity.province;
    if (identity.kd_code) fields.coordinates = identity.kd_code;

    const populatedCount = Object.values(fields).filter(v => v !== null && v !== undefined).length;
    return { fields, populatedCount };
  }

  function detectPageKind(url, visibleText) {
    const path = String(url || "").toLowerCase();
    const t = String(visibleText || "").toLowerCase();
    if (path.includes("throne") || t.includes("throne room")) return "throne";
    if (path.includes("kingdom")) return "kingdom-details";
    if (path.includes("military")) return "military";
    if (path.includes("magic") || path.includes("wizard")) return "magic";
    if (path.includes("thiev") || path.includes("thief")) return "thievery";
    if (path.includes("science")) return "science";
    return "generic";
  }

  function buildCapture() {
    const raw = document.documentElement?.outerHTML || "";
    const visibleText = String(document.body?.innerText || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
    const capturedAt = new Date().toISOString();
    const identity = findIdentityHints(visibleText);
    const pageKind = detectPageKind(location.href, visibleText);
    const { fields: parsedFields, populatedCount } = parseThroneFields(visibleText);

    return {
      capture_id: makeCaptureId(),
      captured_at: capturedAt,
      scraper_version: VERSION,
      page_kind: pageKind,
      page: {
        url: location.href, origin: location.origin, hostname: location.hostname,
        pathname: location.pathname, search: location.search, hash: location.hash,
        title: document.title || "", ready_state: document.readyState,
        language: document.documentElement?.lang || null
      },
      subject_identity: identity,
      parsed_fields: parsedFields,
      populated_count: populatedCount,
      visible_text: visibleText,
      raw
    };
  }

  function toSpartanPayload(record) {
    const hasParsedStats = record.populated_count > 0;

    return {
      capture: {
        captureId: record.capture_id,
        capturedAt: record.captured_at,
        source: SOURCE,
        sourceId: record.capture_id,
        pageKind: record.page_kind,
        url: record.page.url,
        rawText: record.visible_text,
        rawPayload: { page: record.page, subject_identity: record.subject_identity },
        parsedPayload: hasParsedStats ? record.parsed_fields : {}
      }
    };
  }

  function sendCapture(record) {
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: "POST",
        url: ENDPOINT,
        headers: {
          "Content-Type": "application/json",
          "x-spartan-capture-key": CAPTURE_KEY
        },
        data: JSON.stringify(toSpartanPayload(record)),
        timeout: 30000,
        onload: response => {
          let parsedBody = null;
          try { parsedBody = JSON.parse(response.responseText); } catch (_) { }
          resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            body: parsedBody
          });
        },
        onerror: () => resolve({ ok: false, status: 0, body: null }),
        ontimeout: () => resolve({ ok: false, status: 0, body: null })
      });
    });
  }

  async function capture(manual = false) {
    if (captureBusy) return;
    captureBusy = true;

    try {
      const record = buildCapture();
      lastCapture = record;
      lastParsed = record.parsed_fields;
      renderPanel(record, "Sending…", true);

      const result = await sendCapture(record);

      if (result.ok) {
        lastCapturedUrl = location.href;
        const decision = result.body?.stewardDecision;
        const stats = record.populated_count > 0 ? `${record.populated_count} stats parsed` : "raw archive only";
        const status = decision === "quarantine" ? `Quarantined (review needed) · ${stats}` : `Saved ✓ · ${stats}`;
        renderPanel(record, status, decision !== "quarantine");
        if (manual) showToast(`Captured ${formatBytes(record.raw)} DOM · ${stats}`, true);
      } else {
        const errMsg = result.body?.error ? `: ${result.body.error}` : "";
        renderPanel(record, `HTTP ${result.status || "connection error"}${errMsg}`, false);
        showToast("Spartan capture failed to save", false);
      }
    } finally {
      captureBusy = false;
    }
  }

  function copyText(text, message) {
    GM_setClipboard(String(text || ""), "text");
    showToast(message, true);
  }

  function copyDom() {
    const html = document.documentElement?.outerHTML || "";
    if (!html) { showToast("No DOM available", false); return; }
    copyText(html, `Copied complete DOM (${formatBytes(html)})`);
  }

  function copyVisibleText() {
    const text = String(document.body?.innerText || "");
    if (!text) { showToast("No visible text found", false); return; }
    copyText(text, `Copied visible text (${formatBytes(text)}) — send this if parsing looks wrong`);
  }

  function copyParsedFields() {
    if (!lastParsed) { showToast("Capture a page first", false); return; }
    copyText(JSON.stringify(lastParsed, null, 2), "Copied parsed fields JSON");
  }

  function copySelectedRow() {
    const row = selectedRow || document.querySelector("tr");
    if (!row) { showToast("No table row found", false); return; }
    copyText(row.outerHTML, "Copied row HTML");
  }

  function makeButton(label, handler, secondary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = [
      "flex:1", "padding:8px 6px", "border:0", "border-radius:6px",
      `background:${secondary ? "#30363d" : "#238636"}`,
      "color:#fff", "font:bold 11px monospace", "cursor:pointer"
    ].join(";");
    button.addEventListener("click", handler);
    return button;
  }

  function renderPanel(record = lastCapture, state = "Ready", success = true) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.replaceChildren();

    if (minimized) {
      const compact = document.createElement("div");
      compact.style.cssText = "display:flex;align-items:center;gap:8px;color:#7ee787;font:bold 12px monospace";
      compact.append("⚡ Spartan Capture");
      const expand = makeButton("▲", () => {
        minimized = false;
        GM_setValue("spartan_universal_minimized", false);
        renderPanel(record, state, success);
      }, true);
      expand.style.flex = "0 0 auto";
      compact.appendChild(expand);
      panel.appendChild(compact);
      return;
    }

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:7px";
    const title = document.createElement("div");
    title.textContent = `⚡ Spartan Universal Capture v${VERSION}`;
    title.style.cssText = "color:#7ee787;font:bold 13px monospace";
    const minimize = makeButton("—", () => {
      minimized = true;
      GM_setValue("spartan_universal_minimized", true);
      renderPanel(record, state, success);
    }, true);
    minimize.style.flex = "0 0 auto";
    header.append(title, minimize);
    panel.appendChild(header);

    const note = document.createElement("div");
    note.textContent = "Raw DOM archive + label-based stat parser → spartan-dashboard.onrender.com";
    note.style.cssText = "color:#8b949e;font:9px monospace;line-height:1.35;margin-bottom:7px";
    panel.appendChild(note);

    const status = document.createElement("div");
    status.textContent = state;
    status.style.cssText = `color:${success ? "#7ee787" : "#ff7b72"};font:10px monospace;word-break:break-word;margin-bottom:7px`;
    panel.appendChild(status);

    const firstRow = document.createElement("div");
    firstRow.style.cssText = "display:flex;gap:6px;margin-bottom:6px";
    firstRow.append(makeButton("Capture", () => capture(true)), makeButton("Copy DOM", copyDom, true));
    panel.appendChild(firstRow);

    const secondRow = document.createElement("div");
    secondRow.style.cssText = "display:flex;gap:6px;margin-bottom:6px";
    secondRow.append(makeButton("Copy Text", copyVisibleText, true), makeButton("Copy Parsed", copyParsedFields, true));
    panel.appendChild(secondRow);

    const thirdRow = document.createElement("div");
    thirdRow.style.cssText = "display:flex;gap:6px";
    thirdRow.append(makeButton("Copy Row", copySelectedRow, true), makeButton("Refresh", () => location.reload(), true));
    panel.appendChild(thirdRow);

    if (record) {
      const metadata = document.createElement("div");
      metadata.style.cssText = "margin-top:7px;padding-top:6px;border-top:1px solid #30363d;color:#8b949e;font:9px monospace;line-height:1.4;word-break:break-word";
      metadata.textContent = `${record.page.pathname} · kind:${record.page_kind} · ${formatBytes(record.raw)} DOM · ${record.populated_count} stats parsed`;
      panel.appendChild(metadata);
    }
  }

  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = "position:fixed;right:14px;bottom:14px;width:290px;padding:11px;z-index:2147483646;background:#0d1117;border:1px solid #30363d;border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.45)";
    document.documentElement.appendChild(panel);
    renderPanel(null, "Ready", true);

    document.addEventListener("click", event => {
      const row = event.target?.closest?.("tr");
      if (row && !event.target.closest("button,input,select,textarea,a")) {
        selectedRow = row;
      }
    }, true);
  }

  function scheduleAutoCapture() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      if (lastCapturedUrl === location.href) return;
      capture(false);
    }, AUTO_DELAY_MS);
  }

  function watchNavigation() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (typeof original !== "function") continue;
      history[method] = function () {
        const result = original.apply(this, arguments);
        setTimeout(scheduleAutoCapture, 100);
        return result;
      };
    }
    addEventListener("popstate", () => setTimeout(scheduleAutoCapture, 100));
  }

  function boot() {
    installPanel();
    watchNavigation();
    scheduleAutoCapture();
  }

  if (document.readyState === "loading") {
    addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
