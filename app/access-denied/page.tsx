export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const params = await searchParams
  const reason = params?.reason
  const masked = reason === 'ip_masking_detected'
  const unavailable = reason === 'ip_unavailable' || reason === 'ip_reputation_unavailable'
  const title = masked ? 'IP MASKING DETECTED' : unavailable ? 'IP VERIFICATION REQUIRED' : 'ACCESS DENIED'
  const message = masked
    ? 'Spartan detected that this connection is using a VPN, proxy, Tor relay, residential proxy, or hosting/data-center IP. Disable the IP-masking software and reload Spartan.'
    : unavailable
      ? 'Spartan could not verify a valid client IP for this connection. Disable any IP-masking software and reload when a normal, server-observable IP is available.'
      : 'Your Discord identity is not currently authorized to enter the Spartan command systems.'

  return (
    <main style={{ minHeight: '100vh', background: '#05070a', color: '#e7edf2', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Manrope, system-ui, sans-serif' }}>
      <section style={{ width: 'min(620px, 100%)', border: `1px solid ${masked || unavailable ? 'rgba(255,90,90,.3)' : 'rgba(255,255,255,.09)'}`, background: 'linear-gradient(145deg,#0d1218,#080b0f)', padding: 40, boxShadow: '0 30px 90px rgba(0,0,0,.45)' }}>
        <div style={{ color: masked || unavailable ? '#ff7474' : '#d8ff54', fontSize: 11, letterSpacing: '.18em', fontWeight: 800, marginBottom: 18 }}>SPARTAN // SECURITY</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(32px, 6vw, 56px)', letterSpacing: '-.04em' }}>{title}</h1>
        <p style={{ color: '#9aa5ae', lineHeight: 1.7, maxWidth: 520 }}>{message}</p>
        <div style={{ marginTop: 28, padding: 16, border: `1px solid ${masked || unavailable ? 'rgba(255,90,90,.16)' : 'rgba(216,255,84,.16)'}`, background: masked || unavailable ? 'rgba(255,90,90,.03)' : 'rgba(216,255,84,.03)', color: '#c5ced5', fontSize: 13 }}>
          {masked || unavailable ? 'SPARTAN FAILS CLOSED FOR UNVERIFIED OR MASKED CONNECTIONS. Owner and Trusted Admin identities are exempt from automated IP reputation blocking.' : 'Access is controlled by Spartan registration status and connection security. If your access was removed, re-registering another Discord account does not bypass the security layer.'}
        </div>
        <a href="/" style={{ display: 'inline-block', marginTop: 28, color: '#071006', background: '#d8ff54', padding: '12px 18px', textDecoration: 'none', fontWeight: 900, fontSize: 12, letterSpacing: '.08em' }}>RETURN TO SPARTAN</a>
      </section>
    </main>
  )
}
