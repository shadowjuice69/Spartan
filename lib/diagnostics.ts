'use client'

export type DiagnosticSeverity = 'info' | 'warning' | 'error' | 'critical'

export function reportDiagnostic(subsystem: string, endpoint: string, message: string, severity: DiagnosticSeverity = 'error', context: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  void fetch('/api/diagnostics', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ subsystem, endpoint, message, severity, context }),
    keepalive: true,
  }).catch(() => {})
}
