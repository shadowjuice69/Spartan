/* Spartan Universal Capture 4.0.4 Chrome adapter. */
function GM_getValue(key, fallback) {
  try { const raw = localStorage.getItem('spartan_gm_' + key); if (raw === null) return fallback; try { return JSON.parse(raw); } catch (_) { return raw; } } catch (_) { return fallback; }
}
function GM_setValue(key, value) { try { localStorage.setItem('spartan_gm_' + key, JSON.stringify(value)); } catch (_) {} }
function GM_setClipboard(value) { try { navigator.clipboard?.writeText(String(value ?? '')); } catch (_) {} }
function GM_xmlhttpRequest(opts) {
  chrome.runtime.sendMessage({ __spartanFetch: true, method: opts.method || 'POST', url: opts.url, headers: opts.headers || {}, data: opts.data, timeout: opts.timeout || 28000 }, response => {
    if (chrome.runtime.lastError) return opts.onerror?.(new Error(chrome.runtime.lastError.message));
    if (!response) return opts.onerror?.(new Error('No background response'));
    if (response.timedOut) return opts.ontimeout?.();
    if (response.error) return opts.onerror?.(new Error(response.error));
    opts.onload?.({ status: response.status, responseText: response.responseText });
  });
}
const script = document.createElement('script');
script.src = chrome.runtime.getURL('engine.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
