"use client"

import { useEffect } from "react"

export default function DiagnosticsMonitor() {
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setInterval> | undefined

    const report = async (payload: Record<string, unknown>) => {
      try {
        await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        })
      } catch {
        // Diagnostics must never create its own reporting loop.
      }
    }

    const check = async () => {
      try {
        const response = await fetch("/api/diagnostics", { cache: "no-store" })
        if (!response.ok && response.status !== 401) {
          await report({
            subsystem: "client",
            endpoint: "/api/diagnostics",
            severity: "error",
            message: `Diagnostics endpoint returned HTTP ${response.status}`,
            context: { status: response.status },
          })
        }
      } catch (error) {
        await report({
          subsystem: "client",
          endpoint: "/api/diagnostics",
          severity: "error",
          message: error instanceof Error ? error.message : "Diagnostics request failed",
        })
      }
    }

    const onError = (event: ErrorEvent) => {
      void report({
        subsystem: "browser",
        endpoint: window.location.pathname,
        severity: "error",
        message: event.message || "Unhandled browser error",
        context: {
          source: event.filename || null,
          line: event.lineno || null,
          column: event.colno || null,
        },
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? "Unhandled promise rejection")
      void report({
        subsystem: "browser",
        endpoint: window.location.pathname,
        severity: "error",
        message: reason,
        context: { type: "unhandledrejection" },
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    void check()
    timer = setInterval(() => {
      if (!stopped) void check()
    }, 60000)

    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
