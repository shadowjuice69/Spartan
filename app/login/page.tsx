import { login, signup } from './actions'

type LoginPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  return (
    <main className="login-shell">
      <div className="login-art" aria-hidden="true" />
      <div className="login-overlay" />

      <section className="login-panel">
        <div className="login-brand">
          <div className="login-mark">S</div>
          <div>
            <strong>SPARTAN</strong>
            <span>UTOPIA COMMAND</span>
          </div>
        </div>

        <div className="login-heading">
          <span className="panel-kicker">COMMAND ACCESS</span>
          <h1>Enter the war room.</h1>
          <p>Authenticate to access your province command center and Age 116 intelligence.</p>
        </div>

        {params.error === 'invalid' && <div className="login-message error">Access denied. Check your email and password.</div>}
        {params.error === 'missing' && <div className="login-message error">Enter your email and password to continue.</div>}
        {params.error === 'signup' && <div className="login-message error">Unable to create the account. Check your details and try again.</div>}
        {params.success === 'signup' && <div className="login-message success">Account created. Check your email if confirmation is required, then sign in.</div>}

        <form className="login-form">
          <label htmlFor="email">EMAIL ADDRESS</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="commander@kingdom.utopia" required />

          <label htmlFor="password">PASSWORD</label>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••••••" required />

          <button className="login-primary" formAction={login}>ENTER SPARTAN <span>→</span></button>
          <button className="login-secondary" formAction={signup}>CREATE COMMAND ACCOUNT</button>
        </form>

        <div className="login-footer">
          <span><i /> SECURE AUTHENTICATION</span>
          <span>AGE 116</span>
        </div>
      </section>
    </main>
  )
}
