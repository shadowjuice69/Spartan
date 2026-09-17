"use client";

import { useState, useTransition } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = await login(formData);
        if (result?.ok) {
          // Force a real hard reload instead of a soft client-side
          // transition — the Server Action's redirect() doesn't reliably
          // carry the freshly-set auth cookie into the next fetch that
          // Jeeves makes on the very first render after login.
          window.location.href = "/";
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed.");
      }
    });
  }

  return (
    <form className="login-form" action={handleSubmit}>
      <label>
        SCREEN NAME
        <input name="screenName" autoComplete="username" placeholder="Your Spartan name" required />
      </label>
      <label>
        PASSWORD
        <input name="password" type="password" autoComplete="current-password" placeholder="••••••••••" required />
      </label>
      <button className="login-primary" type="submit" disabled={pending}>
        {pending ? "ENTERING…" : "ENTER SPARTAN"} <span>→</span>
      </button>
      {error && <div className="login-message error" style={{ marginTop: 10 }}>{error}</div>}
    </form>
  );
}
