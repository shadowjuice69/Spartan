const WIKI_RETURN_BUTTON = `
<a href="/" aria-label="Return to Command Center" style="
  position:fixed;top:16px;right:18px;z-index:99999;
  background:#101c23;border:1px solid #d8ff54;color:#d8ff54;
  padding:11px 16px;border-radius:9px;font:900 10px/1 Arial,sans-serif;
  letter-spacing:.08em;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.35);
">← RETURN TO COMMAND CENTER</a>`;

const SPARTAN_THEME = `
<style id="spartan-theme">
  :root {
    --bg: #07090d !important;
    --bg2: #0c1016 !important;
    --bg3: #10151d !important;
    --surface: #0c1016 !important;
    --surface2: #141b21 !important;
    --border: #202832 !important;
    --border2: #2c3540 !important;
    --gold: #d8ff54 !important;
    --gold2: #d8ff54 !important;
    --gold-dim: #647b2b !important;
    --amber: #ffc45c !important;
    --teal: #75e0a0 !important;
    --teal2: #8ee0ac !important;
    --red: #ff6879 !important;
    --red2: #ff8b98 !important;
    --text: #e9edf3 !important;
    --text2: #8993a1 !important;
    --text3: #596471 !important;
    --heading: #f0f4f7 !important;
    --accent: #8da7ff !important;
    --accent2: #8da7ff !important;
  }

  html, body { background: #07090d !important; color: #e9edf3 !important; }
  body {
    background:
      radial-gradient(circle at 70% -10%, rgba(141,167,255,.09), transparent 32%),
      radial-gradient(circle at 20% 50%, rgba(216,255,84,.035), transparent 30%),
      #07090d !important;
  }

  #app { background: transparent !important; }
  #sidebar, .sidebar, nav {
    background: rgba(8,11,16,.96) !important;
    border-color: #202832 !important;
  }
  #main { background: transparent !important; }

  .sidebar-logo, header, .topbar {
    border-color: #202832 !important;
    background: rgba(7,9,13,.88) !important;
  }

  .sidebar-logo h1, h1, h2, h3, h4, h5, h6 {
    color: #f0f4f7 !important;
  }

  a { color: #d8ff54 !important; }
  a:hover { color: #efffa8 !important; }

  button, .tab, [role="tab"] {
    color: #8993a1 !important;
    border-color: #202832 !important;
  }
  button:hover, .tab:hover, [role="tab"]:hover {
    color: #e9edf3 !important;
    background: #121821 !important;
  }
  .active, .active-tab, button.active, .tab.active, [role="tab"][aria-selected="true"] {
    color: #d8ff54 !important;
    border-color: #647b2b !important;
    background: #141b21 !important;
  }

  .card, .panel, section, article, .content-card, .table-wrap, .info-box,
  .reference-card, .rule-card, .stat-card {
    background: rgba(12,16,22,.94) !important;
    border-color: #202832 !important;
  }

  table { border-color: #202832 !important; }
  th { background: #10151d !important; color: #d8ff54 !important; border-color: #202832 !important; }
  td { border-color: #202832 !important; color: #c1c8d1 !important; }
  tr:hover td { background: #10161d !important; }

  code, pre, .mono { color: #8ee0ac !important; }
  blockquote { border-left-color: #647b2b !important; background: #0b1210 !important; }

  ::selection { background: rgba(216,255,84,.22); color: #fff; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #07090d; }
  ::-webkit-scrollbar-thumb { background: #29313c; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #4b5868; }
</style>`;

export async function GET(request: Request) {
  // Use Spartan's live wiki route, which serves the latest approved wiki from Supabase.
  // This prevents this themed route from drifting behind on a separate repository copy.
  const wikiUrl = new URL("/wiki", request.url);
  const response = await fetch(wikiUrl, { cache: "no-store" });

  if (!response.ok) {
    return new Response("Utopia Wiki source is temporarily unavailable.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let html = await response.text();

  // Keep the original wiki HTML/JS/navigation intact. Only layer Spartan's
  // visual system and a return link on top so the wiki remains the user's authoritative file.
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${SPARTAN_THEME}</head>`);
  } else {
    html = `${SPARTAN_THEME}${html}`;
  }

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${WIKI_RETURN_BUTTON}</body>`);
  } else {
    html = `${html}${WIKI_RETURN_BUTTON}`;
  }

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
