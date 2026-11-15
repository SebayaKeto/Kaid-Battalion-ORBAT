import { useState } from "react";
import { pb, errorMessage } from "../pb.js";

export default function Account({ me, onSignOut }) {
  const [oldPassword, setOld] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (ev) => {
    ev.preventDefault();
    setError("");
    setBusy(true);
    try {
      await pb.send("/api/orbat/change-password", { method: "POST", body: { oldPassword, password, passwordConfirm: confirm } });
      onSignOut("Password changed. Sign in with your new password.");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <section style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <span className="eyebrow">MY ACCOUNT</span>
        <h1 className="h1">{me.username.toUpperCase()}</h1>
      </section>
      <div className="row" style={{ alignItems: "flex-start", gap: 18 }}>
        <section className="panel stack" style={{ flex: "1 1 320px" }} aria-labelledby="ident">
          <h2 id="ident" className="h2">IDENTITY</h2>
          <dl className="mono" style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
            <dt style={{ color: "var(--label)" }}>USERNAME</dt><dd style={{ margin: 0 }}>{me.username}</dd>
            <dt style={{ color: "var(--label)" }}>DISCORD</dt><dd style={{ margin: 0 }}>{me.discordLinked ? (me.discordName || "Linked") : "Not linked"}</dd>
            <dt style={{ color: "var(--label)" }}>ACCESS</dt><dd style={{ margin: 0 }}>{me.accessLabel}</dd>
          </dl>
        </section>
        <section className="panel stack" style={{ flex: "1 1 380px" }} aria-labelledby="pw">
          <h2 id="pw" className="h2">CHANGE PASSWORD</h2>
          {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
          <form onSubmit={submit} className="stack">
            <label className="field">CURRENT PASSWORD
              <input className="input" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOld(e.target.value)} required />
            </label>
            <label className="field">NEW PASSWORD
              <input className="input" type="password" autoComplete="new-password" minLength={10} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label className="field">CONFIRM NEW PASSWORD
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "SAVING…" : "CHANGE PASSWORD"}</button>
          </form>
        </section>
      </div>
    </>
  );
}
