import Link from "next/link";

const WIKI_SOURCE = "https://raw.githubusercontent.com/shadowjuice69/utopia-nexus/main/utopia-wiki.html";

function extractWikiBody(source: string) {
  let body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? source;
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<link\b[^>]*>/gi, "");
  body = body.replace(/<meta\b[^>]*>/gi, "");
  body = body.replace(/<html\b[^>]*>/gi, "").replace(/<\/html\s*>/gi, "");
  body = body.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  return body.trim();
}

export default async function WikiPage() {
  let wiki = "";
  let sourceError = false;
  try {
    const response = await fetch(WIKI_SOURCE, { cache: "no-store" });
    if (!response.ok) throw new Error("Wiki source unavailable");
    wiki = extractWikiBody(await response.text());
  } catch {
    sourceError = true;
  }

  return (
    <main className="wiki-shell">
      <aside className="wiki-sidebar">
        <Link href="/" className="wiki-brand">
          <span className="wiki-mark">S</span>
          <span><strong>SPARTAN</strong><small>UTOPIA COMMAND</small></span>
        </Link>
        <div className="wiki-side-label">COMMAND SYSTEMS</div>
        <nav>
          <Link href="/">⌁ <span>Command</span></Link>
          <Link href="/command/province">◈ <span>Province</span></Link>
          <Link href="/command/war-room">⚔ <span>War Room</span></Link>
          <Link href="/command/build-lab">▦ <span>Build Lab</span></Link>
          <Link href="/command/military">♜ <span>Military</span></Link>
          <Link href="/command/magic">✦ <span>Magic</span></Link>
          <Link href="/command/thievery">◉ <span>Thievery</span></Link>
          <Link href="/command/science">⌘ <span>Science</span></Link>
          <Link href="/command/wiki" className="active">▤ <span>Wiki</span><b>LIVE</b></Link>
          <Link href="/command/tools">⚙ <span>Tools</span></Link>
        </nav>
        <div className="wiki-status"><i /> <span><strong>WIKI CORE ONLINE</strong><small>Age 116 reference loaded</small></span></div>
      </aside>

      <section className="wiki-workspace">
        <header className="wiki-topbar">
          <div><span>SPARTAN</span><b>/</b> KNOWLEDGE CORE <b>/</b> AGE 116 WIKI</div>
          <div className="wiki-live"><i /> SOURCE LINKED</div>
        </header>

        <div className="wiki-content">
          <section className="wiki-hero">
            <div>
              <div className="kicker">SPARTAN // KNOWLEDGE CORE</div>
              <h1>Utopia Wiki</h1>
              <p>Authoritative Age 116 reference data, presented through the Spartan intelligence interface.</p>
            </div>
            <div className="source-card"><span>REFERENCE SOURCE</span><strong>utopia-wiki.html</strong><small>shadowjuice69/utopia-nexus · main</small></div>
          </section>

          <section className="wiki-notice">
            <span>◆</span>
            <div><strong>LOSSLESS KNOWLEDGE LAYER</strong><p>Spartan renders the repaired wiki source as a readable knowledge layer. The source remains the reference; styling does not rewrite its content.</p></div>
          </section>

          {sourceError ? (
            <section className="wiki-error"><strong>WIKI SOURCE TEMPORARILY UNAVAILABLE</strong><p>The Spartan interface is intact, but the linked Age 116 source could not be loaded. No fabricated wiki content is displayed.</p></section>
          ) : (
            <article className="wiki-document" dangerouslySetInnerHTML={{ __html: wiki }} />
          )}
        </div>
      </section>

      <style>{`
        .wiki-shell{min-height:100vh;display:flex;background:#07090d;color:#e9edf3;font-family:Manrope,Arial,sans-serif}
        .wiki-sidebar{width:248px;min-height:100vh;border-right:1px solid #202832;background:rgba(8,11,16,.96);padding:25px 15px;position:sticky;top:0;height:100vh;flex:none;display:flex;flex-direction:column}
        .wiki-brand{display:flex;align-items:center;gap:11px;padding:0 9px 27px;text-decoration:none;color:#e9edf3}.wiki-brand strong{display:block;font-size:13px;letter-spacing:.17em}.wiki-brand small{display:block;color:#66717f;font:9px 'DM Mono',monospace;letter-spacing:.1em;margin-top:3px}.wiki-mark{width:35px;height:35px;border:1px solid #647b2b;background:linear-gradient(145deg,#c9f34c,#6b841f);color:#11150a;display:grid;place-items:center;font-weight:900;clip-path:polygon(50% 0,91% 22%,91% 78%,50% 100%,9% 78%,9% 22%)}
        .wiki-side-label,.kicker{font:500 9px 'DM Mono',monospace;letter-spacing:.17em;color:#66717f}.wiki-side-label{padding:0 10px 10px}.wiki-sidebar nav{display:flex;flex-direction:column;gap:2px}.wiki-sidebar nav a{height:43px;border-radius:6px;padding:0 10px;display:flex;align-items:center;gap:11px;color:#8993a1;text-decoration:none;font-size:12px;font-weight:600}.wiki-sidebar nav a:hover{background:#121821;color:#dce2ea}.wiki-sidebar nav a.active{background:#141b21;color:#f0f4f7;box-shadow:inset 2px 0 #d8ff54}.wiki-sidebar nav a:first-letter{color:#687484}.wiki-sidebar nav b{margin-left:auto;color:#d8ff54;font:8px 'DM Mono';letter-spacing:.1em}.wiki-status{margin-top:auto;border:1px solid #1e2a20;background:#0b1210;padding:12px;display:flex;gap:9px}.wiki-status i{width:7px;height:7px;background:#d8ff54;border-radius:50%;box-shadow:0 0 12px rgba(216,255,84,.7);margin-top:3px}.wiki-status strong{display:block;font:9px 'DM Mono';color:#a9bcaa}.wiki-status small{display:block;font-size:8px;color:#59665f;margin-top:4px}
        .wiki-workspace{flex:1;min-width:0}.wiki-topbar{height:65px;border-bottom:1px solid #202832;display:flex;align-items:center;justify-content:space-between;padding:0 31px;background:rgba(7,9,13,.78);backdrop-filter:blur(12px);position:sticky;top:0;z-index:5;font:10px 'DM Mono',monospace;letter-spacing:.12em;color:#65707d}.wiki-topbar>div:first-child span{color:#d8ff54}.wiki-topbar b{font-weight:400;color:#303945;padding:0 8px}.wiki-live{color:#8f9a9d}.wiki-live i{display:inline-block;width:6px;height:6px;background:#75e9a1;border-radius:50%;margin-right:7px;box-shadow:0 0 8px #75e9a1}
        .wiki-content{padding:34px 38px 60px;max-width:1550px;margin:auto}.wiki-hero{display:flex;justify-content:space-between;gap:25px;align-items:flex-end;margin-bottom:20px}.wiki-hero h1{font-size:34px;line-height:1.05;letter-spacing:-.045em;margin:8px 0}.wiki-hero p{margin:0;color:#7e8998;font-size:11px;line-height:1.7}.source-card{min-width:255px;border:1px solid #202832;background:#0c1016;padding:14px 16px}.source-card span{display:block;color:#66717f;font:8px 'DM Mono';letter-spacing:.13em}.source-card strong{display:block;color:#d8ff54;font:11px 'DM Mono';margin-top:7px}.source-card small{display:block;color:#596471;font:8px 'DM Mono';margin-top:5px}
        .wiki-notice{display:flex;gap:13px;align-items:flex-start;border:1px solid #344126;background:linear-gradient(90deg,#121a12,#0e1416);padding:15px 17px;margin-bottom:18px}.wiki-notice>span{color:#d8ff54;font-size:17px}.wiki-notice strong{display:block;color:#d8ff54;font:9px 'DM Mono';letter-spacing:.12em}.wiki-notice p{margin:5px 0 0;color:#89938c;font-size:10px;line-height:1.6}
        .wiki-document{background:#0c1016;border:1px solid #202832;padding:30px 34px;line-height:1.7;color:#cbd2db;overflow:hidden}.wiki-document h1,.wiki-document h2,.wiki-document h3,.wiki-document h4{color:#f0f4f7;line-height:1.2;letter-spacing:-.025em}.wiki-document h1{font-size:28px;border-bottom:1px solid #27303a;padding-bottom:12px}.wiki-document h2{font-size:20px;margin-top:32px;border-left:2px solid #d8ff54;padding-left:10px}.wiki-document h3{font-size:15px;color:#d8ff54;margin-top:24px}.wiki-document h4{font-size:12px}.wiki-document p,.wiki-document li{font-size:11px;color:#aeb7c2}.wiki-document a{color:#a8c4ff}.wiki-document strong{color:#e8edf2}.wiki-document code,.wiki-document pre{font-family:'DM Mono',monospace}.wiki-document pre{background:#080c11;border:1px solid #202832;padding:14px;overflow:auto}.wiki-document table{width:100%;border-collapse:collapse;margin:16px 0;background:#090d12;font-size:10px}.wiki-document th{background:#121821;color:#d8ff54;font:9px 'DM Mono';letter-spacing:.06em;text-align:left}.wiki-document th,.wiki-document td{border:1px solid #222b35;padding:8px;vertical-align:top}.wiki-document tr:nth-child(even) td{background:rgba(255,255,255,.012)}.wiki-document img{max-width:100%;height:auto}.wiki-document blockquote{border-left:2px solid #586b2a;margin:15px 0;padding:4px 15px;color:#8f9aa7;background:#0a0f13}.wiki-document hr{border:0;border-top:1px solid #202832;margin:25px 0}.wiki-error{border:1px solid #4a2029;background:#1b0d11;padding:20px}.wiki-error strong{color:#ff9aa6;font:10px 'DM Mono';letter-spacing:.12em}.wiki-error p{color:#b98f96;font-size:11px}
        @media(max-width:900px){.wiki-sidebar{width:70px;padding:18px 9px}.wiki-brand{justify-content:center}.wiki-brand>span:last-child,.wiki-side-label,.wiki-sidebar nav a span,.wiki-sidebar nav b,.wiki-status span{display:none}.wiki-sidebar nav a{justify-content:center;padding:0;font-size:16px}.wiki-content{padding:25px 14px 45px}.wiki-hero{display:block}.source-card{margin-top:15px}.wiki-document{padding:22px 17px}.wiki-topbar{padding:0 16px}.wiki-topbar>div:first-child{font-size:8px}.wiki-live{font-size:8px}}
      `}</style>
    </main>
  );
}
