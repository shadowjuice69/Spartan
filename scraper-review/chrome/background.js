// Spartan Universal Capture — background service worker
//
// Relays outbound requests for content.js's GM_xmlhttpRequest shim.
// This worker has host_permissions for sparta-west.onrender.com
// (declared in manifest.json), so its fetch() is not subject to the
// page-level CORS restriction a content script's own fetch would hit —
// the same role GM_xmlhttpRequest/@connect played in Tampermonkey.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.__spartanFetch) return false;

  const timeoutMs = message.timeout || 28000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  fetch(message.url, {
    method: message.method || 'POST',
    headers: message.headers || {},
    body: message.data,
    signal: controller.signal
  })
    .then(async response => {
      clearTimeout(timer);
      const responseText = await response.text();
      sendResponse({ ok: response.ok, status: response.status, responseText });
    })
    .catch(error => {
      clearTimeout(timer);
      if (error && error.name === 'AbortError') {
        sendResponse({ ok: false, timedOut: true });
      } else {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    });

  return true; // keep the message channel open for the async sendResponse above
});
