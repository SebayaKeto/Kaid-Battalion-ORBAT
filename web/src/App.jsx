import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { pb, fetchMe, onSessionEnded } from "./pb.js";
import BootScreen from "./pages/BootScreen.jsx";
import SetupScreen from "./pages/SetupScreen.jsx";
import Shell from "./pages/Shell.jsx";
import PublicShell from "./pages/PublicShell.jsx";
import Landing from "./pages/Landing.jsx";
const Codex = lazy(() => import("./pages/Codex.jsx"));

// The landing page (portal) is the front page. #orbat opens the ORBAT app,
// #codex (and #codex/<section>) opens the Codex.
function currentView() {
  const h = window.location.hash;
  if (h === "#orbat") return "orbat";
  if (h === "#codex" || h.startsWith("#codex/")) return "codex";
  return "portal";
}

// Screens: boot/login → (first time) set username + password → console
// "lost" if any permission was removed, "gained" if only added or the access name changed, "" if the same
function accessChange(a, b) {
  const keys = Object.keys({ ...a.perms, ...b.perms });
  if (keys.some((k) => a.perms[k] && !b.perms[k])) return "lost";
  if (keys.some((k) => !a.perms[k] && b.perms[k]) || a.accessLabel !== b.accessLabel) return "gained";
  return "";
}

export default function App() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(pb.authStore.isValid);
  const [notice, setNotice] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [view, setView] = useState(currentView);
  useEffect(() => {
    const onHash = () => { setView(currentView()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      setMe(await fetchMe());
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (pb.authStore.isValid) loadMe();
    return onSessionEnded((message) => {
      setMe(null);
      setPendingMe(null);
      setNotice(message);
    });
  }, [loadMe]);

  // Watch for access changes while the page is open (Discord role changes,
  // role mapping edits). Removed access applies at once; new access waits for
  // the member to press Reload. The server checks permissions on every request
  // either way, so an open page never keeps access that was taken away.
  const [pendingMe, setPendingMe] = useState(null);
  useEffect(() => {
    if (!me || me.needsSetup) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.hidden || !pb.authStore.isValid) return;
      let fresh;
      try { fresh = await fetchMe(); } catch { return; }
      const change = accessChange(me, fresh);
      if (change === "lost") { setMe(fresh); setPendingMe(null); setNotice(`Your access changed to ${fresh.accessLabel}. Some sections were removed.`); }
      else if (change === "gained") setPendingMe(fresh);
    };
    const timer = setInterval(check, 60000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [me]);

  const applyPending = () => { setMe(pendingMe); setPendingMe(null); setNotice(""); };

  const signedIn = (msg = "") => {
    setNotice(msg);
    setChecking(true);
    loadMe();
  };

  const signOut = (msg = "") => {
    pb.authStore.clear();
    setMe(null);
    setShowLogin(false);
    setNotice(msg);
  };

  if (view === "codex") {
    return (
      <Suspense fallback={<div className="screen"><div className="scan" aria-hidden="true" /><p className="eyebrow" role="status">Opening the archives…</p></div>}>
        <Codex />
      </Suspense>
    );
  }

  if (view === "portal") {
    return <Landing me={me && !me.needsSetup ? me : null} onStaffSignIn={() => { setShowLogin(true); window.location.hash = "orbat"; }} />;
  }

  if (checking) {
    return (
      <div className="screen">
        <div className="scan" aria-hidden="true" />
        <p className="eyebrow" role="status">Re-establishing uplink…</p>
      </div>
    );
  }
  // no account needed to look around; staff sign in from the corner button
  if (!me && !showLogin) return <PublicShell notice={notice} onDismissNotice={() => setNotice("")} onSignIn={() => setShowLogin(true)} />;
  if (!me) return <BootScreen notice={notice} onSignedIn={(m) => { setShowLogin(false); signedIn(m); }} onBack={() => { setShowLogin(false); setNotice(""); }} />;
  if (me.needsSetup) return <SetupScreen me={me} onDone={signOut} onCancel={() => signOut()} />;
  return (
    <Shell me={me} onSignOut={() => signOut()} onRefresh={loadMe}
      accessUpdate={pendingMe ? pendingMe.accessLabel : ""} onApplyAccess={applyPending}
      notice={notice} onDismissNotice={() => setNotice("")} />
  );
}
