"use client";

import { useState } from "react";

const nav = ["Command", "Province", "War Room", "Build Lab", "Military", "Magic", "Thievery", "Science", "Wiki", "Tools"];

const stats = [
  { label: "Acres", value: "1,284", delta: "+86", tone: "up" },
  { label: "Networth", value: "168,420", delta: "+4.8%", tone: "up" },
  { label: "Population", value: "33,714", delta: "+1,126", tone: "up" },
  { label: "Offense", value: "71,842", delta: "+6.2%", tone: "up" },
  { label: "Defense", value: "64,190", delta: "+2.9%", tone: "up" },
  { label: "Mana", value: "78%", delta: "Stable", tone: "neutral" },
];

const systems = [
  ["Military", "71.8k / 64.2k", "READY", 84],
  ["Economy", "92.4k gc", "HEALTHY", 76],
  ["Science", "1,942 pts", "GROWING", 68],
  ["Magic", "78% mana", "READY", 82],
  ["Thievery", "63% stealth", "READY", 73],
];

export default function Home() {
  const [active, setActive] = useState("Command");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><strong>SPARTAN</strong><span>UTOPIA COMMAND</span></div>
        </div>
        <div className="side-label">COMMAND SYSTEMS</div>
        <nav>
          {nav.map((item, i) => (
            <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}>
              <span className="nav-icon">{["⌁", "◈", "⚔", "▦", "♜", "✦", "◉", "⌘", "▤", "⚙"][i]}</span>
              {item}
              {item === "Command" && <b>LIVE</b>}
            </button>
          ))}
        </nav>
        <div className="side-status">
          <div className="pulse-dot" />
          <div><strong>DATA CORE ONLINE</strong><span>Universal capture connected</span></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb"><span>AGE 116</span><i>/</i> PROVINCE COMMAND CENTER</div>
          <div className="top-actions"><span className="sync"><i /> LIVE SYNC</span><button className="icon-button">⌕</button><div className="avatar">SH</div></div>
        </header>

        <div className="content">
          <section className="hero">
            <div>
              <div className="eyebrow">SPARTAN // PROVINCE OVERVIEW</div>
              <h1>Shadow&apos;s Dominion</h1>
              <p>Human <span>·</span> Warlord <span>·</span> Kingdom #42 <span>·</span> Age 116, Year 7</p>
            </div>
            <div className="hero-status"><span className="status-dot" /> PROVINCE STABLE <small>Last capture 14s ago</small></div>
          </section>

          <section className="intel-banner">
            <div className="intel-symbol">✦</div>
            <div className="intel-copy"><strong>SPARTAN AI SITUATION BRIEF</strong><span>Growth trajectory is ahead of kingdom median. Military capacity is your current limiting factor.</span></div>
            <button>OPEN ANALYSIS <span>→</span></button>
          </section>

          <section className="stat-grid">
            {stats.map((stat) => <article className="stat-card" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small className={stat.tone}>{stat.delta}</small></article>)}
          </section>

          <section className="main-grid">
            <article className="panel growth-panel">
              <div className="panel-head"><div><span className="panel-kicker">GROWTH ANALYTICS</span><h2>Province trajectory</h2></div><select defaultValue="AGE 116"><option>AGE 116</option><option>LAST 30 DAYS</option></select></div>
              <div className="chart-wrap">
                <div className="y-labels"><span>1.4k</span><span>1.2k</span><span>1.0k</span><span>800</span><span>600</span></div>
                <svg className="chart" viewBox="0 0 760 250" preserveAspectRatio="none" aria-label="Province growth chart">
                  <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
                  <path className="grid-line" d="M0 25H760 M0 82H760 M0 139H760 M0 196H760" />
                  <path className="area" d="M0 202 C70 197 92 185 145 189 S210 161 270 166 S340 139 405 146 S475 108 530 119 S600 72 650 88 S710 43 760 54 L760 230 L0 230Z" />
                  <path className="line" d="M0 202 C70 197 92 185 145 189 S210 161 270 166 S340 139 405 146 S475 108 530 119 S600 72 650 88 S710 43 760 54" />
                  <circle cx="760" cy="54" r="5" className="point" />
                </svg>
                <div className="x-labels"><span>Y1</span><span>Y2</span><span>Y3</span><span>Y4</span><span>Y5</span><span>Y6</span><span>Y7</span></div>
              </div>
              <div className="chart-legend"><span><i className="legend-land"/> LAND</span><strong>+42.7%</strong><span className="median"><i/> KINGDOM MEDIAN</span><strong>+31.4%</strong></div>
            </article>

            <article className="panel systems-panel">
              <div className="panel-head"><div><span className="panel-kicker">SYSTEM HEALTH</span><h2>Readiness matrix</h2></div><span className="health-score">82 <small>/ 100</small></span></div>
              <div className="systems-list">
                {systems.map(([name, value, state, pct]) => <div className="system-row" key={name}><div className="system-title"><strong>{name}</strong><span>{value}</span></div><div className="bar"><i style={{width: `${pct}%`}} /></div><em>{state}</em></div>)}
              </div>
              <button className="panel-link">VIEW FULL PROVINCE STATE <span>→</span></button>
            </article>
          </section>

          <section className="bottom-grid">
            <article className="panel objective">
              <div className="panel-head"><div><span className="panel-kicker">NEXT OBJECTIVE</span><h2>Prepare for hostile action</h2></div><span className="priority">HIGH PRIORITY</span></div>
              <p>Raise defensive capacity before the next war window. Your current offense is strong enough to pressure targets, but defense is below the recommended safety threshold.</p>
              <div className="objective-actions"><button className="primary">BUILD PLAN <span>→</span></button><button className="secondary">ASK SPARTAN</button></div>
            </article>
            <article className="panel events"><div className="panel-head"><div><span className="panel-kicker">RECENT CHANGES</span><h2>Age activity</h2></div><button className="more">•••</button></div><div className="event-list"><div><time>14s</time><span className="event-dot green"/><p><strong>Universal capture</strong> updated province state</p></div><div><time>18m</time><span className="event-dot blue"/><p><strong>+12 acres</strong> from exploration</p></div><div><time>42m</time><span className="event-dot amber"/><p><strong>Science research</strong> completed</p></div></div></article>
          </section>
        </div>
      </section>
    </main>
  );
}
