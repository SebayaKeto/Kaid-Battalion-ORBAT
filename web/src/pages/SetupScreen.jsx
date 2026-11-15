import { useState } from "react";
import { pb, errorMessage } from "../pb.js";

// Shown once, after a member's first Discord sign-in.
export default function SetupScreen({ me, onDone, onCancel }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (ev) => {
    ev.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      await pb.send("/api/orbat/setup-credentials", {
        method: "POST",
        body: { username: username.trim().toLowerCase(), password, passwordConfirm: confirm },
      });
      onDone("Credentials saved. Sign in with your new username and password.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <div className="scan" aria-hidden="true" />
      <section aria-labelledby="setup-title" className="holo clip stack" style={{ width: "100%", maxWidth: 520, padding: "24px 26px", background: "rgba(6,22,14,.85)", border: "1px solid #1f5a38" }}>
        <span className="eyebrow">DISCORD IDENTITY VERIFIED{me.discordName ? ` · ${me.discordName.toUpperCase()}` : ""}</span>
        <h1 id="setup-title" className="h1" style={{ fontSize: 22 }}>SET YOUR CREDENTIALS</h1>
        <p style={{ margin: 0, lineHeight: 1.5, color: "var(--text)" }}>
          Choose the username and password you'll use to sign in. Your access level ({me.accessLabel}) comes from your Discord roles and updates automatically.
        </p>
        {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <form onSubmit={submit} className="stack">
          <label className="field">USERNAME
            <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+" required />
            <span style={{ letterSpacing: ".04em", color: "var(--text-dim)" }}>3–32 characters: letters, numbers, dots, dashes, underscores.</span>
          </label>
          <label className="field">PASSWORD
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} maxLength={72} required />
            <span style={{ letterSpacing: ".04em", color: "var(--text-dim)" }}>At least 10 characters. Don't reuse your Discord password.</span>
          </label>
          <label className="field">CONFIRM PASSWORD
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn" onClick={onCancel}>CANCEL</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "SAVING…" : "SAVE & CONTINUE"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
