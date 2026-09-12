import { loginWithDiscord } from './actions'

type LoginPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  return (
    <main className="login-shell">
      <div className="login-art" aria-hidden="true">
        <div className="login-soldier"><div className="soldier-glow" /><div className="soldier-head" /><div className="soldier-helmet" /><div className="soldier-body" /><div className="soldier-armor" /><div className="soldier-shield"><span>S</span></div><div className="soldier-spear" /></div>
        <div className="login-grid" />
        <div className="login-scan" />
      </div>
      <div className="login-overlay" />

      <section className="login-panel">
        <div className="login-brand"><div className="login-mark">S</div><div><strong>SPARTAN</strong><span>UTOPIA COMMAND</span></div></div>
        <div className="login-heading"><span className="panel-kicker">COMMAND ACCESS</span><h1>Enter the war room.</h1><p>Authenticate with the Discord identity registered through Spartan.</p></div>

        {params.error === 'access-denied' && <div className="login-message error">Access denied. Your Spartan identity or connection is not authorized.</div>}
        {params.error === 'discord-required' && <div className="login-message error">A registered Spartan Discord identity is required.</div>}
        {params.error === 'discord-config' && <div className="login-message error">Discord authentication is not configured yet.</div>}
        {params.error === 'oauth' && <div className="login-message error">Discord authentication could not be completed.</div>}
        {params.error === 'security' && <div className="login-message error">Spartan security could not validate this connection.</div>}

        <form className="login-form">
          <button className="login-primary" formAction={loginWithDiscord}>ENTER WITH DISCORD <span>→</span></button>
        </form>

        <div className="login-security">
          <span><i /> DISCORD IDENTITY</span>
          <span>IP SECURITY ACTIVE</span>
          <span>SPARTAN ACCESS CONTROL</span>
        </div>
        <div className="login-footer"><span><i /> SECURE AUTHENTICATION</span><span>AGE 116</span></div>
      </section>

      <style>{`
        .login-soldier{position:absolute;right:7vw;top:50%;width:min(470px,42vw);height:82vh;transform:translateY(-48%);opacity:.88;filter:drop-shadow(0 0 45px rgba(216,255,84,.08))}.soldier-glow{position:absolute;inset:10% 12%;background:radial-gradient(ellipse,rgba(216,255,84,.1),transparent 62%);filter:blur(18px)}.soldier-head{position:absolute;top:15%;left:43%;width:20%;height:15%;border-radius:45% 45% 38% 38%;background:linear-gradient(100deg,#111821,#303945 48%,#0b1016);border:1px solid #3b4652}.soldier-helmet{position:absolute;z-index:2;top:10%;left:35%;width:36%;height:17%;border-radius:55% 55% 22% 22%;background:linear-gradient(105deg,#111820,#56616a 48%,#171e25);border:2px solid #68747e;box-shadow:inset 0 -10px 18px rgba(0,0,0,.45),0 0 20px rgba(216,255,84,.08)}.soldier-helmet:after{content:'';position:absolute;left:7%;right:7%;bottom:13%;height:13%;background:#090d12;border:1px solid #53606b}.soldier-body{position:absolute;top:29%;left:24%;width:52%;height:54%;background:linear-gradient(105deg,#0a1016,#303b45 44%,#0b1117);clip-path:polygon(26% 0,74% 0,100% 18%,87% 100%,13% 100%,0 18%);border:1px solid #4a5661}.soldier-armor{position:absolute;top:34%;left:30%;width:40%;height:44%;border:2px solid #68747e;clip-path:polygon(20% 0,80% 0,100% 17%,86% 100%,14% 100%,0 17%);background:linear-gradient(145deg,rgba(90,104,112,.28),rgba(9,14,19,.35));box-shadow:inset 0 0 35px rgba(216,255,84,.04)}.soldier-shield{position:absolute;z-index:4;left:2%;top:39%;width:34%;height:43%;background:linear-gradient(145deg,#263039,#090f14 70%);border:3px solid #727e86;clip-path:polygon(50% 0,92% 14%,100% 28%,93% 82%,50% 100%,7% 82%,0 28%,8% 14%);display:grid;place-items:center;box-shadow:10px 15px 35px rgba(0,0,0,.5),inset 0 0 20px rgba(216,255,84,.06)}.soldier-shield span{font:800 62px Manrope;color:rgba(216,255,84,.72);text-shadow:0 0 18px rgba(216,255,84,.18)}.soldier-spear{position:absolute;z-index:1;right:5%;top:2%;width:4px;height:91%;background:linear-gradient(#a8b0b4,#3e4850 20%,#77838a 55%,#232b32);transform:rotate(7deg);box-shadow:0 0 8px rgba(216,255,84,.1)}.soldier-spear:before{content:'';position:absolute;top:-5%;left:-8px;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:30px solid #9ba5a9}.login-grid{position:absolute;right:0;bottom:0;width:55%;height:55%;opacity:.12;background-image:linear-gradient(#8da7ff 1px,transparent 1px),linear-gradient(90deg,#8da7ff 1px,transparent 1px);background-size:42px 42px;transform:perspective(500px) rotateX(60deg);transform-origin:bottom}.login-scan{position:absolute;right:0;top:12%;width:55%;height:1px;background:linear-gradient(90deg,transparent,#d8ff54,transparent);box-shadow:0 0 18px rgba(216,255,84,.45);opacity:.25;animation:login-scan 5s linear infinite}@keyframes login-scan{0%{transform:translateY(0)}100%{transform:translateY(70vh)}}
        .login-security{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.login-security span{font-size:10px;letter-spacing:.12em;color:#89949e;border:1px solid rgba(255,255,255,.08);padding:7px 9px;border-radius:999px}.login-security i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#d8ff54;margin-right:6px;box-shadow:0 0 8px rgba(216,255,84,.5)}
        @media(max-width:1050px){.login-soldier{right:-5vw;width:500px;opacity:.5}.login-overlay{background:linear-gradient(90deg,rgba(5,7,10,.97),rgba(5,7,10,.78))}}@media(max-width:700px){.login-soldier{right:-130px;top:52%;width:390px;opacity:.22}.login-overlay{background:rgba(5,7,10,.84)}}
      `}</style>
    </main>
  )
}
