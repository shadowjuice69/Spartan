# Spartan Universal Capture — Chrome Extension (v4.0.3)

This is a Chrome-extension port of the Tampermonkey "Spartan Universal
Capture" userscript. It does exactly the same thing — scrapes Utopia
(World of Legends) pages and sends them to the Spartan dashboard — no
Tampermonkey install required.

## Install (Riven — do this once)

1. Download/unzip this folder somewhere you'll keep it (don't delete it
   after installing — Chrome loads the extension from these files
   every time, it doesn't copy them anywhere).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select this folder (the one containing `manifest.json`).
6. You should see "Spartan Universal Capture" appear in your extensions
   list, enabled.

## Using it

1. Go to any Utopia game page (utopia-game.com) or intel.utopia.site.
2. A small panel appears in the bottom-right corner of the page —
   that's the capture panel, same as the Tampermonkey version.
3. **Visit your Throne page first.** This is required once per browser
   — it's how the extension links itself to your Spartan account. The
   panel will show "Identity linked ✓" once it works.
4. After that, browsing normally captures pages automatically. The
   "Capture" button forces one manually; "Relink" re-links your
   identity if it ever needs it.

## If something looks broken

- Panel status says "Open Throne once to link this province" — visit
  your Throne page. Nothing else will send until you do this.
- Panel status says "Spartan has disabled this scraper account" —
  your Spartan account isn't active; ask Shadow.
- No panel appears at all — check `chrome://extensions` to confirm the
  extension is still enabled (Chrome sometimes disables unpacked
  extensions after a browser update; just toggle it back on).

## Files in this folder

- `manifest.json` — extension configuration (Manifest V3)
- `content.js` — the actual scraper (same logic as the Tampermonkey
  script), plus small shims so it runs without Tampermonkey's GM_ APIs
- `background.js` — a background worker that relays network requests
  for the scraper (needed because a content script can't make
  cross-origin requests to the Spartan dashboard on its own — the
  background worker can, since it's granted permission in
  `manifest.json`)
