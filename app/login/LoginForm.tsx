"use client";

import { useState, useTransition } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await login(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign("/");
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
