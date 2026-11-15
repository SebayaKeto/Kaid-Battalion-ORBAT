import { useEffect, useState } from "react";
import logo from "../assets/41st_logo.png";
import { pb, errorMessage } from "../pb.js";

const BOOT_LINES = [
  ["ESTABLISHING HOLONET UPLINK", "OK"],
  ["ACCESSING GAR PERSONNEL DATABASE", "OK"],
  ["LOADING 41ST ORDER OF BATTLE", "OK"],
  ["AWAITING IDENTIFICATION", "…"],
];

function seenBoot() {
  try { return sessionStorage.getItem("orbat_boot_seen") === "1"; } catch { return false; }
}
function markBootSeen() {
  try { sessionStorage.setItem("orbat_boot_seen", "1"); } catch { /* private mode */ }
}

export default function BootScreen({ notice, onSignedIn, onBack }) {
  const [booted, setBooted] = useState(() => seenBoot() || !!notice);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (booted) return;
    const t = setTimeout(() => { setBooted(true); markBootSeen(); }, 2800);
    return () => clearTimeout(t);
  }, [booted]);

  const skip = () => { setBooted(true); markBootSeen(); };

  const signInPassword = async (ev) => {
    ev.preventDefault();
    setError("");
    setBusy("password");
    try {
      await pb.collection("users").authWithPassword(username.trim(), password);
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError(err.status === 400 && !err.response?.message?.includes("Discord")
        ? "Wrong username or password."
        : errorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const signInDiscord = async () => {
    setError("");
    setBusy("discord");
    try {
      await pb.collection("users").authWithOAuth2({ provider: "discord" });
      onSignedIn();
    } catch (err) {
      setError(err.isAbort ? "" : errorMessage(err, "Discord sign-in didn't complete."));
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="screen">
      <div className="scan" aria-hidden="true" />
      <div className="screen-corner" style={{ top: 24 }}>
        <span>GAR // COMNET NODE 41-E</span>
        <span>SECURE CHANNEL</span>
      </div>

      <div className="holo stack" style={{ width: "100%", maxWidth: 560, alignItems: "center", gap: 26 }}>
        <div style={{ position: "relative", width: 200, height: 200 }}>
          <svg className="sweep-rev" aria-hidden="true" viewBox="0 0 260 260" style={{ position: "absolute", inset: 0 }}>
            <circle cx="130" cy="130" r="124" fill="none" stroke="#2f7a4f" strokeWidth="1" strokeDasharray="2 6" />
            <circle cx="130" cy="130" r="112" fill="none" stroke="#5fd38a" strokeWidth="2" strokeDasharray="60 24 8 24" />
          </svg>
          <svg className="sweep" aria-hidden="true" viewBox="0 0 260 260" style={{ position: "absolute", inset: 0 }}>
            <path d="M130 130 L130 18 A112 112 0 0 1 224 72 Z" fill="#5fd38a" opacity="0.14" />
            <line x1="130" y1="130" x2="130" y2="18" stroke="#a8f0c8" strokeWidth="1.5" />
          </svg>
          <img src={logo} alt="41st Elite Corps emblem" style={{ position: "absolute", left: 38, top: 38, width: 124, height: 124, objectFit: "contain", filter: "drop-shadow(0 0 16px rgba(95,211,138,.5))" }} />
        </div>

        <div style={{ textAlign: "center" }} className="stack">
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(22px, 5vw, 32px)", letterSpacing: ".2em", color: "var(--text-strong)", textShadow: "0 0 18px rgba(95,211,138,.55)" }}>41ST ELITE CORPS</h1>
          <p style={{ margin: "-6px 0 0", fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: ".45em", color: "#8fd0a8" }}>PERSONNEL &amp; ORDER OF BATTLE</p>
        </div>

        {!booted ? (
          <div className="clip" style={{ width: "100%", padding: "18px 22px", background: "rgba(6,22,14,.75)", border: "1px solid #1f5a38", fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 1.9, color: "#aee6c4" }}>
            {BOOT_LINES.map(([label, status], i) => (
              <div key={label} className="ln" style={{ animationDelay: `${0.25 + i * 0.55}s, ${0.25 + i * 0.55}s` }}>
                &gt; {label} <span style={{ color: status === "OK" ? "#7ff0a8" : "#ffd166" }}>{status}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, height: 4, background: "#0e2f1c", position: "relative", overflow: "hidden" }}>
              <div className="bar-fill" style={{ position: "absolute", inset: 0, right: "auto", background: "linear-gradient(90deg,#2f9a5c,#a8f0c8)" }} />
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button type="button" className="btn btn-sm" onClick={skip}>SKIP SEQUENCE</button>
            </div>
          </div>
        ) : (
          <section aria-labelledby="signin-title" className="clip stack" style={{ width: "100%", padding: "22px 24px", background: "rgba(6,22,14,.8)", border: "1px solid #1f5a38" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 id="signin-title" className="h2">STAFF SIGN IN</h2>
              {onBack && <button type="button" className="btn btn-sm" onClick={onBack}>BACK TO THE ORBAT</button>}
            </div>
            <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Only staff need an account. Everyone can view the ORBAT, points and assets without signing in.</p>

            {notice && <p className="notice notice-warn" role="alert" style={{ margin: 0 }}>{notice}</p>}
            {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}

            <form onSubmit={signInPassword} className="stack">
              <label className="field">USERNAME
                <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </label>
              <label className="field">PASSWORD
                <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <button className="btn btn-primary" type="submit" disabled={!!busy}>
                {busy === "password" ? "VERIFYING…" : "SIGN IN"}
              </button>
            </form>

            <div className="row" style={{ gap: 12 }} aria-hidden="true">
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: ".2em" }}>OR</span>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>

            <button type="button" className="btn btn-discord" onClick={signInDiscord} disabled={!!busy}>
              <svg aria-hidden="true" width="20" height="16" viewBox="0 0 24 18"><path fill="currentColor" d="M20.3 1.5A19.6 19.6 0 0 0 15.4 0l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 0a19.5 19.5 0 0 0-4.9 1.5C.6 6.1-.3 10.6.1 15a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14.1 14.1 0 0 0 12.2 0l.5.4a12.8 12.8 0 0 1-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.5ZM8 12.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 7.5 8 7.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
              {busy === "discord" ? "WAITING FOR DISCORD…" : "SIGN IN WITH DISCORD"}
            </button>
            <p className="mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--text-dim)" }}>
              First time here? Sign in with Discord, then choose a username and password. If your connection changes, you'll be asked for your password again.
            </p>
          </section>
        )}
      </div>

      <div className="screen-corner" style={{ bottom: 20 }}>
        <span>FOR THE REPUBLIC</span>
        <span>ALL ACCESS IS LOGGED</span>
      </div>
    </main>
  );
}
