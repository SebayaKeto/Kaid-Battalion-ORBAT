import { useEffect, useState } from "react";
import logo from "../assets/41st_logo.png";
import Home from "./Home.jsx";
import Account from "./Account.jsx";
import RoleMap from "./RoleMap.jsx";
import Members from "./Members.jsx";
import SecurityLog from "./SecurityLog.jsx";
import Points from "./Points.jsx";
import Approvals from "./Approvals.jsx";
import Orbat from "./OrbatBoard.jsx";
import Assets from "./Assets.jsx";
import Troopers from "./Troopers.jsx";
import { onOpenTrooper } from "../nav.js";
import { pb } from "../pb.js";

export default function Shell({ me, onSignOut, onRefresh, accessUpdate, onApplyAccess, notice, onDismissNotice }) {
  const p = me.perms;
  const canStaff = p.is_full || p.can_promotions;
  const canPoints = p.is_full || p.can_points;
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!canPoints) return;
    const load = () => pb.collection("events").getList(1, 1, { filter: "status = 'pending'", skipTotal: false }).then((r) => setPendingCount(r.totalItems)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [canPoints]);
  // new asset types waiting for the Unit Leader
  const [assetCount, setAssetCount] = useState(0);
  useEffect(() => {
    if (!p.can_approve_assets) return;
    const load = () => pb.send("/api/orbat/assets/pending-count", { method: "GET" }).then((r) => setAssetCount(r.count)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [p.can_approve_assets]);
  const tabs = [
    { key: "home", label: "COMMAND" },
    { key: "orbat", label: "ORBAT" },
    { key: "troopers", label: "TROOPERS" },
    { key: "points", label: "POINTS" },
    { key: "assets", label: `ASSETS${assetCount ? ` · ${assetCount}` : ""}` },
    { key: "account", label: "MY ACCOUNT" },
    canPoints && { key: "approvals", label: `APPROVALS${pendingCount ? ` · ${pendingCount}` : ""}`, admin: true },
    canStaff && { key: "members", label: "MEMBERS", admin: true },
    canStaff && { key: "security", label: "SECURITY LOG", admin: true },
    p.is_full && { key: "access", label: "DISCORD ACCESS", admin: true },
  ].filter(Boolean);
  const [tab, setTabState] = useState("home");
  // a new key on every click remounts the page, so it always loads fresh data
  const [visit, setVisit] = useState(0);
  const setTab = (t) => { setTabState(t); setVisit((n) => n + 1); };
  // a callsign clicked elsewhere opens that trooper's profile
  const [trooperId, setTrooperId] = useState("");
  useEffect(() => onOpenTrooper((id) => { setTrooperId(id); setTab("troopers"); }), []);
  // if access was removed, leave any section that's no longer allowed
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab("home");
  });

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(#08130d, #050a07 420px)" }}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="portal-link" href="#portal" title="Back to the unit portal">
            <img src={logo} alt="41st emblem" width="40" height="40" style={{ objectFit: "contain" }} />
            <div className="stack" style={{ gap: 0 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: ".2em", color: "var(--text-strong)" }}>41ST ELITE CORPS</span>
              <span className="mono" style={{ fontSize: 11, letterSpacing: ".18em", color: "var(--label)" }}>PERSONNEL CONSOLE</span>
            </div>
          </a>
          <div style={{ flex: "1 1 auto" }} />
          <span className={`badge ${p.is_full ? "badge-full" : ""}`}>{me.accessLabel.toUpperCase()}</span>
          <span className="mono" style={{ fontSize: 13, color: "#8cc4a2" }}>{me.username}</span>
          <a className="btn btn-sm" href="#portal">‹ PORTAL</a>
          <button type="button" className="btn btn-sm" onClick={onSignOut}>SIGN OUT</button>
        </div>
        <nav className="nav" aria-label="Sections">
          {tabs.map((t) => (
            <button key={t.key} type="button" disabled={t.soon} className={t.admin ? "nav-admin" : ""}
              aria-current={tab === t.key ? "page" : undefined} onClick={() => setTab(t.key)}
              title={t.soon ? "Coming in the next build" : undefined}>
              {t.label}{t.soon ? " ·SOON" : ""}
            </button>
          ))}
        </nav>
      </header>

      <div className="page">
        {accessUpdate && (
          <div className="notice notice-ok row" role="status" style={{ margin: 0, justifyContent: "space-between" }}>
            <span>Your access has been updated to {accessUpdate}. Reload to see your new sections.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={onApplyAccess}>RELOAD</button>
          </div>
        )}
        {notice && !accessUpdate && (
          <div className="notice notice-warn row" role="status" style={{ margin: 0, justifyContent: "space-between" }}>
            <span>{notice}</span>
            <button type="button" className="btn btn-sm" onClick={onDismissNotice}>DISMISS</button>
          </div>
        )}
        <div key={visit} className="stack" style={{ display: "contents" }}>
          {tab === "home" && <Home me={me} />}
          {tab === "orbat" && <Orbat me={me} />}
          {tab === "troopers" && <Troopers me={me} initialId={trooperId} />}
          {tab === "points" && <Points me={me} />}
          {tab === "assets" && <Assets me={me} />}
          {tab === "approvals" && <Approvals me={me} onCountChange={setPendingCount} />}
          {tab === "account" && <Account me={me} onSignOut={onSignOut} />}
          {tab === "members" && <Members me={me} />}
          {tab === "security" && <SecurityLog />}
          {tab === "access" && <RoleMap onChanged={onRefresh} />}
        </div>
      </div>
    </div>
  );
}
