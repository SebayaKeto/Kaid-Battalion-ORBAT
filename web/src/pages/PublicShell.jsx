import { useEffect, useState } from "react";
import logo from "../assets/41st_logo.png";
import Orbat from "./OrbatBoard.jsx";
import Points from "./Points.jsx";
import Assets from "./Assets.jsx";
import Troopers from "./Troopers.jsx";
import { onOpenTrooper } from "../nav.js";

function remember(key, value) {
  try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch { /* private window */ }
  return null;
}

// View-only console for everyone. Only staff sign in.
export default function PublicShell({ notice, onDismissNotice, onSignIn }) {
  const [tab, setTab] = useState(() => remember("public-tab") || "orbat");
  const [visit, setVisit] = useState(0);
  const go = (t) => { setTab(t); remember("public-tab", t); setVisit((n) => n + 1); };
  const [trooperId, setTrooperId] = useState("");
  useEffect(() => onOpenTrooper((id) => { setTrooperId(id); go("troopers"); }), []);
  const tabs = [
    { key: "orbat", label: "ORBAT" },
    { key: "troopers", label: "TROOPERS" },
    { key: "points", label: "POINTS" },
    { key: "assets", label: "ASSETS" },
  ];
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(#08130d, #050a07 420px)" }}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="portal-link" href="#portal" title="Back to the unit portal">
            <img src={logo} alt="41st emblem" width="40" height="40" style={{ objectFit: "contain" }} />
            <div className="stack" style={{ gap: 0 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: ".2em", color: "var(--text-strong)" }}>41ST ELITE CORPS</span>
              <span className="mono" style={{ fontSize: 11, letterSpacing: ".18em", color: "var(--label)" }}>ORDER OF BATTLE · VIEW ONLY</span>
            </div>
          </a>
          <div style={{ flex: "1 1 auto" }} />
          <a className="btn btn-sm" href="#portal">‹ PORTAL</a>
          <button type="button" className="btn btn-sm" onClick={onSignIn}>STAFF SIGN IN</button>
        </div>
        <nav className="nav" aria-label="Sections">
          {tabs.map((t) => (
            <button key={t.key} type="button" disabled={t.soon} aria-current={tab === t.key ? "page" : undefined}
              onClick={() => go(t.key)} title={t.soon ? "Coming in the next build" : undefined}>
              {t.label}{t.soon ? " ·SOON" : ""}
            </button>
          ))}
        </nav>
      </header>
      <div className="page">
        {notice && (
          <div className="notice notice-warn row" role="status" style={{ margin: 0, justifyContent: "space-between" }}>
            <span>{notice}</span>
            <button type="button" className="btn btn-sm" onClick={onDismissNotice}>DISMISS</button>
          </div>
        )}
        <div key={visit} style={{ display: "contents" }}>
          {tab === "orbat" && <Orbat me={null} />}
          {tab === "troopers" && <Troopers me={null} initialId={trooperId} />}
          {tab === "points" && <Points me={null} />}
          {tab === "assets" && <Assets me={null} />}
        </div>
      </div>
    </div>
  );
}
