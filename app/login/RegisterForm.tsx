"use client";

import { useState, useTransition } from "react";
import { createSpartanAccount } from "./actions";

export default function RegisterForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  function handleSubmit(formData: FormData) {
    setError("");
    setCreated("");
    startTransition(async () => {
      const result = await createSpartanAccount(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(`Account ${result.screenName} created. You can sign in now.`);
      window.setTimeout(() => window.location.assign("/login"), 700);
    });
  }

  return (
    <form className="login-form" action={handleSubmit}>
      <label>
        SCREEN NAME
        <input name="screenName" autoComplete="username" placeholder="Your Spartan name" required />
      </label>
      <label>
        PROVINCE NAME
        <input name="provinceName" placeholder="Exact registered province name" required />
      </label>
      <label>
        KD / LOCATION
        <input name="provinceLocation" placeholder="6:9" inputMode="numeric" required />
      </label>
      <label>
        PASSWORD
        <input name="password" type="password" autoComplete="new-password" placeholder="10+ characters" minLength={10} required />
      </label>
      <label>
        CONFIRM PASSWORD
        <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat password" minLength={10} required />
      </label>
      <button className="login-primary" type="submit" disabled={pending}>
        {pending ? "CREATING…" : "CREATE ACCOUNT"} <span>→</span>
      </button>
      {error && <div className="login-message error" style={{ marginTop: 10 }}>{error}</div>}
      {created && <div className="login-message success" style={{ marginTop: 10 }}>{created}</div>}
    </form>
  );
}
