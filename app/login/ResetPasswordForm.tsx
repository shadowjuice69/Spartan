"use client";

import { useState, useTransition } from "react";
import { requestPasswordResetCode, resetSpartanPassword } from "./actions";

export default function ResetPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [discordId, setDiscordId] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function requestCode(formData: FormData) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await requestPasswordResetCode(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCodeSent(true);
      setMessage(result.message);
    });
  }

  function resetPassword(formData: FormData) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await resetSpartanPassword(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Password updated. You can now sign in with your new password.");
      setCodeSent(false);
    });
  }

  return (
    <div>
      {!codeSent ? (
        <form className="login-form" action={requestCode}>
          <label>
            DISCORD ID
            <input
              name="discordId"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Your Discord user ID"
              value={discordId}
              onChange={(event) => setDiscordId(event.target.value.replace(/\D/g, ""))}
              minLength={17}
              maxLength={20}
              required
            />
          </label>
          <p className="card-copy">We’ll send a one-time reset code to the Discord account linked to this Spartan account. The code expires in 10 minutes.</p>
          <button className="login-secondary" type="submit" disabled={pending}>
            {pending ? "SENDING CODE…" : "SEND DISCORD CODE"} <span>→</span>
          </button>
        </form>
      ) : (
        <form className="login-form" action={resetPassword}>
          <input type="hidden" name="discordId" value={discordId} />
          <label>
            6-DIGIT DISCORD CODE
            <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={6} required />
          </label>
          <label>
            NEW PASSWORD
            <input name="password" type="password" autoComplete="new-password" placeholder="10+ characters" minLength={10} required />
          </label>
          <label>
            CONFIRM NEW PASSWORD
            <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat new password" minLength={10} required />
          </label>
          <button className="login-primary" type="submit" disabled={pending}>
            {pending ? "RESETTING…" : "RESET PASSWORD"} <span>→</span>
          </button>
          <button className="login-secondary" type="button" disabled={pending} onClick={() => { setCodeSent(false); setMessage(""); setError(""); }}>
            USE A DIFFERENT DISCORD ID
          </button>
        </form>
      )}
      {message && <div className="login-message success" style={{ marginTop: 10 }}>{message}</div>}
      {error && <div className="login-message error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
