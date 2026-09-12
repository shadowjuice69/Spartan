export default function AccessDeniedPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#05070a', color: '#e7edf2', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <section style={{ width: 'min(620px, 100%)', border: '1px solid rgba(255,255,255,.09)', background: 'linear-gradient(145deg,#0d1218,#080b0f)', padding: 40, boxShadow: '0 30px 90px rgba(0,0,0,.45)' }}>
        <div style={{ color: '#d8ff54', fontSize: 11, letterSpacing: '.18em', fontWeight: 800, marginBottom: 18 }}>SPARTAN // SECURITY</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(32px, 6vw, 56px)', letterSpacing: '-.04em' }}>ACCESS DENIED</h1>
        <p style={{ color: '#9aa5ae', lineHeight: 1.7, maxWidth: 520 }}>Your Discord identity is not currently authorized to enter the Spartan command systems.</p>
        <div style={{ marginTop: 28, padding: 16, border: '1px solid rgba(216,255,84,.16)', background: 'rgba(216,255,84,.03)', color: '#c5ced5', fontSize: 13 }}>Access is controlled by Spartan registration status and connection security. If your access was removed, re-registering another Discord account does not bypass the security layer.</div>
        <a href="/" style={{ display: 'inline-block', marginTop: 28, color: '#071006', background: '#d8ff54', padding: '12px 18px', textDecoration: 'none', fontWeight: 900, fontSize: 12, letterSpacing: '.08em' }}>RETURN TO SPARTAN</a>
      </section>
    </main>
  )
}
