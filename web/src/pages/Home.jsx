const ACCESS = [
  ["is_full", "Full site access", "Everything, including settings and Discord access mapping"],
  ["can_points", "Points & approvals", "Approve or deny attendance points, and award the qualification or certification a training log gives"],
  ["can_promotions", "Promotions", "Promote members and edit service records"],
  ["can_transfers", "Transfers", "Move members between platoons and billets"],
  ["can_recruitment", "Recruitment", "Process new recruits, and add or revoke qualifications and certifications on trooper profiles"],
  ["can_assets", "Asset tracking", "Log and retract asset gains and losses, submit new asset types, manage starting supply"],
  ["can_approve_assets", "Approve asset types", "Approve or deny new asset types submitted for the Assets page"],
  ["can_manage_logs", "Edit & retract logs", "Reopen a reviewed log to edit it, or retract a log and the points it gave"],
  ["can_edit_codex", "Edit Codex", "Edit, add, reorder and hide Codex pages, with text formatting and pictures"],
];

export default function Home({ me }) {
  return (
    <>
      <section className="holo" style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <span className="eyebrow">WELCOME BACK</span>
        <h1 className="h1">{(me.discordName || me.username).toUpperCase()}</h1>
      </section>

      <section className="panel panel-top holo" aria-labelledby="access-title">
        <h2 id="access-title" className="h2" style={{ marginBottom: 6 }}>YOUR CLEARANCE · {me.accessLabel.toUpperCase()}</h2>
        <p className="mono" style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-dim)" }}>
          Set by your roles in the 41st Discord. Role changes there reach the site within 2 minutes.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {ACCESS.map(([key, title, desc]) => {
            const on = me.perms[key];
            return (
              <div key={key} style={{ display: "flex", gap: 10, padding: "10px 12px", border: `1px solid ${on ? "var(--holo)" : "#1a2c20"}`, background: on ? "rgba(95,211,138,.08)" : "transparent" }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, flex: "0 0 auto", marginTop: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${on ? "var(--holo)" : "#1a2c20"}`, background: on ? "var(--holo)" : "transparent" }}>
                  {on && <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#04140a" strokeWidth="2.4" /></svg>}
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 700, color: on ? "var(--text-strong)" : "#75887b" }}>{title}</span>
                  <span className="mono" style={{ fontSize: 11, color: on ? "#8cc4a2" : "#4f6356" }}>{on ? desc : "NOT GRANTED"}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel holo" aria-labelledby="next-title">
        <h2 id="next-title" className="h2" style={{ marginBottom: 8 }}>CONSOLE STATUS</h2>
        <p style={{ margin: 0, lineHeight: 1.5 }}>
          Sign-in, access control and points tracking are live. Training logs posted in Discord go to Approvals, and each approved attendee gets 1 point. The ORBAT, service records and asset pages are next.
        </p>
      </section>
    </>
  );
}
