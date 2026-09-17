import { createSpartanAccount, login, loginWithDiscord } from './actions'
import LoginForm from './LoginForm'

type LoginPageProps = { searchParams: Promise<Record<string, string | undefined>> }

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const error = params.error
  const success = params.success
  const message = error && error.includes('%') ? decodeURIComponent(error) : error

  return (
    <main className="login-shell">
      <div className="login-art" aria-hidden="true"><div className="login-grid" /><div className="login-scan" /></div>
      <div className="login-overlay" />
      <section className="login-panel">
        <div className="login-brand"><div className="login-mark">S</div><div><strong>SPARTAN</strong><span>UTOPIA COMMAND</span></div></div>
        <div className="login-heading"><span className="panel-kicker">COMMAND ACCESS</span><h1>Enter the war room.</h1><p>Create your Spartan identity using the province already registered through the bot.</p></div>

        {message && <div className="login-message error">{message === 'invalid' ? 'Invalid screen name or password.' : message === 'missing' ? 'Enter your screen name and password.' : message === 'password-mismatch' ? 'Passwords do not match.' : message === 'registration-failed' ? 'Registration could not be completed.' : message}</div>}
        {success === 'account-created' && <div className="login-message success">Account created. Sign in to continue.</div>}

        <div className="forms">
          <div className="form-card">
            <div className="card-title">SIGN IN</div>
            <LoginForm />
          </div>

          <div className="form-card register-card">
            <div className="card-title">CREATE ACCOUNT</div>
            <p className="card-copy">Your province name and location must already be registered with the Spartan bot.</p>
            <form className="login-form" action={createSpartanAccount}>
              <label>SCREEN NAME<input name="screenName" autoComplete="username" placeholder="3–32 characters" required /></label>
              <div className="two-col">
                <label>PROVINCE NAME<input name="provinceName" placeholder="Province name" required /></label>
                <label>LOCATION<input name="provinceLocation" type="text" inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="6:5" pattern="[0-9]+[ ]*:[ ]*[0-9]+" title="Enter your province location like 6:9" required /></label>
              </div>
              <label>PASSWORD<input name="password" type="password" autoComplete="new-password" placeholder="10+ characters" required /></label>
              <label>CONFIRM PASSWORD<input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat password" required /></label>
              <button className="login-secondary" type="submit">CREATE SPARTAN ACCOUNT <span>→</span></button>
            </form>
          </div>
        </div>

        <details className="legacy"><summary>Legacy Discord authentication</summary><form action={loginWithDiscord}><button className="legacy-button" type="submit">ENTER WITH DISCORD</button></form></details>

        <div className="login-security"><span><i /> PROVINCE VERIFIED</span><span>IP SECURITY ACTIVE</span><span>ACCOUNT SESSION TRACKING</span></div>
        <div className="login-footer"><span><i /> SECURE AUTHENTICATION</span><span>AGE 116</span></div>
      </section>
      <style>{`
        *{box-sizing:border-box}.login-shell{min-height:100vh;background:#05070a;color:#e9eef2;position:relative;overflow:hidden;font-family:Manrope,system-ui,sans-serif}.login-art{position:absolute;inset:0;background:radial-gradient(circle at 78% 40%,rgba(216,255,84,.09),transparent 28%),linear-gradient(135deg,#05070a,#0a0e13 55%,#05070a)}.login-grid{position:absolute;right:-5%;bottom:-10%;width:65%;height:65%;opacity:.12;background-image:linear-gradient(#8da7ff 1px,transparent 1px),linear-gradient(90deg,#8da7ff 1px,transparent 1px);background-size:42px 42px;transform:perspective(500px) rotateX(60deg);transform-origin:bottom}.login-scan{position:absolute;right:0;top:15%;width:70%;height:1px;background:linear-gradient(90deg,transparent,#d8ff54,transparent);box-shadow:0 0 18px rgba(216,255,84,.45);opacity:.25;animation:scan 5s linear infinite}@keyframes scan{0%{transform:translateY(0)}100%{transform:translateY(75vh)}}.login-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,7,10,.98) 0%,rgba(5,7,10,.91) 45%,rgba(5,7,10,.55) 100%)}.login-panel{position:relative;z-index:2;width:min(940px,94vw);padding:7vh 0 5vh 7vw}.login-brand{display:flex;align-items:center;gap:12px}.login-brand strong{display:block;font-size:20px;letter-spacing:.16em}.login-brand span{display:block;font-size:9px;letter-spacing:.2em;color:#78848d;margin-top:2px}.login-mark{width:42px;height:42px;border:1px solid #d8ff54;color:#d8ff54;display:grid;place-items:center;font-weight:900;font-size:22px;box-shadow:0 0 24px rgba(216,255,84,.08)}.login-heading{margin:7vh 0 26px;max-width:700px}.panel-kicker,.card-title{font-size:10px;letter-spacing:.18em;color:#d8ff54}.login-heading h1{font-size:clamp(34px,5vw,64px);line-height:1;margin:10px 0 15px;letter-spacing:-.04em}.login-heading p,.card-copy{color:#8d99a3;line-height:1.6}.forms{display:grid;grid-template-columns:1fr 1.2fr;gap:16px;max-width:900px}.form-card{border:1px solid rgba(255,255,255,.09);background:rgba(10,14,19,.72);padding:22px;backdrop-filter:blur(10px)}.register-card{border-color:rgba(216,255,84,.18)}.card-copy{font-size:12px;margin:10px 0 16px}.login-form{display:grid;gap:12px;margin-top:14px}.login-form label{display:grid;gap:7px;font-size:9px;letter-spacing:.14em;color:#8d99a3}.login-form input{width:100%;border:1px solid rgba(255,255,255,.1);background:#070a0e;color:#edf2f5;padding:13px 12px;outline:none;font:inherit;letter-spacing:normal}.login-form input:focus{border-color:rgba(216,255,84,.65);box-shadow:0 0 0 2px rgba(216,255,84,.06)}.two-col{display:grid;grid-template-columns:1fr .65fr;gap:10px}.login-primary,.login-secondary,.legacy-button{border:1px solid #d8ff54;background:#d8ff54;color:#05070a;padding:13px 15px;font-weight:900;letter-spacing:.1em;font-size:10px;cursor:pointer;text-align:left}.login-primary span,.login-secondary span{float:right}.login-secondary{background:transparent;color:#d8ff54}.login-secondary:hover{background:rgba(216,255,84,.08)}.login-message{max-width:900px;padding:11px 13px;border:1px solid rgba(255,255,255,.1);font-size:11px;margin-bottom:14px}.login-message.error{border-color:rgba(255,100,100,.35);color:#ffb5b5}.login-message.success{border-color:rgba(216,255,84,.3);color:#d8ff54}.legacy{margin-top:18px;max-width:900px;color:#68737c;font-size:10px;letter-spacing:.1em}.legacy summary{cursor:pointer}.legacy-button{margin-top:10px;background:transparent;color:#8d99a3;border-color:rgba(255,255,255,.12)}.login-security{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.login-security span{font-size:9px;letter-spacing:.12em;color:#89949e;border:1px solid rgba(255,255,255,.08);padding:7px 9px;border-radius:999px}.login-security i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#d8ff54;margin-right:6px;box-shadow:0 0 8px rgba(216,255,84,.5)}.login-footer{display:flex;justify-content:space-between;max-width:900px;margin-top:30px;font-size:9px;letter-spacing:.13em;color:#68737c}.login-footer i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#d8ff54;margin-right:6px}@media(max-width:760px){.login-panel{padding:28px 20px 40px}.forms{grid-template-columns:1fr}.login-heading{margin-top:45px}.login-art{opacity:.55}.two-col{grid-template-columns:1fr 1fr}}
      `}</style>
    </main>
  )
}
