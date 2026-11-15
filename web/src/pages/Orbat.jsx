import { Fragment, useEffect, useState } from "react";
import { pb, errorMessage } from "../pb.js";
import TransferDialog from "./Transfer.jsx";
import { openTrooper } from "../nav.js";

// Same lists as pb_hooks/lib/roster.js
export const RANKS = ["CR", "CT", "SCT", "VCT", "CLC", "CPL", "CS", "CSS", "CSM", "1SG", "SGM", "BSM", "CL", "CC", "BC"];
export const ORBAT_PLATOONS = ["Battalion Command", "Katarn Company", "Tusken Company", "Acklay", "Chimaera", "Banshee", "Drexl", "Ranger", "Air Wing", "Navy"];
export const STATUSES = [["recruit", "Recruit"], ["active", "Active"], ["active_reserve", "Active reserve"], ["inactive_reserve", "Inactive reserve"], ["discharged", "Discharged"]];
const statusLabel = (s) => (STATUSES.find(([v]) => v === s) || [, "—"])[1];
const nice = (iso) => (iso ? new Date(iso.replace(" ", "T")).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);

// who can change a trooper's details (rank, number, callsign, status)
export const canEditDetails = (me) => !!me && (me.perms.is_full || me.perms.can_recruitment);

// fireteam colours a slot can carry
export const TEAMS = [["", "No colour"], ["red", "Red"], ["yellow", "Yellow"], ["green", "Green"], ["blue", "Blue"]];
const teamName = (t) => (TEAMS.find(([k]) => k === t) || [, ""])[1];
// "Medic (Blue)", or just "Medic"
export const slotName = (sl) => sl.billet + (sl.team ? ` (${teamName(sl.team)})` : "");

// a unit's vacant slots grouped by section, with identical billets merged ("Trooper (4 open)")
function vacantGroups(layout, platoon, skip) {
  const units = layout.units.filter((u) => u.platoon === platoon);
  const out = [];
  units.forEach((u) => {
    layout.sections.filter((s) => s.unit === u.id).sort((a, b) => a.sort - b.sort).forEach((s) => {
      const billets = [];
      layout.slots.filter((sl) => sl.section === s.id && !sl.member && sl.id !== skip).sort((a, b) => a.sort - b.sort).forEach((sl) => {
        const name = slotName(sl);
        const same = billets.find((b) => b.billet === name);
        if (same) same.open++;
        else billets.push({ billet: name, slotId: sl.id, open: 1 });
      });
      if (billets.length) out.push({ section: s, label: units.length > 1 ? `${u.name} · ${s.name}` : s.name, billets });
    });
  });
  return out;
}

// RANK-1234 "Name" from a Discord nickname, as far as it goes
function fromNickname(nick) {
  const t = String(nick || "");
  if (/^Discord user \d+$/.test(t)) return { rank: "", number: "", callsign: "" };
  const rank = (t.match(/^\s*([A-Z0-9]{2,4})\s*[-–]/i) || [])[1]?.toUpperCase();
  const number = (t.match(/(?:^|\D)(\d{4})(?!\d)/) || [])[1] || "";
  const quoted = (t.match(/["“”'‘’]\s*([^"“”'‘’]+?)\s*["“”'‘’]/) || [])[1];
  const callsign = quoted || (number ? t.slice(t.indexOf(number) + 4).replace(/^[\s\-–|:.]+/, "").trim() : t.trim());
  return { rank: RANKS.includes(rank) ? rank : "", number, callsign };
}

// Everyone: the roster by platoon. Recruitment staff: register and edit.
export function RosterList({ me }) {
  const canRecruit = me.perms.is_full || me.perms.can_recruitment;
  const canTransfer = me.perms.is_full || me.perms.can_transfers;
  const canEdit = canEditDetails(me);
  const cols = canTransfer || canEdit ? 8 : 7;
  const [transfer, setTransfer] = useState(null);
  const [members, setMembers] = useState([]);
  const [points, setPoints] = useState({});
  const [q, setQ] = useState("");
  const [showStatus, setShowStatus] = useState("current");
  const [form, setForm] = useState(null); // null | { mode: "new" | "link" | "edit", member?, discord? }
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = async () => {
    try {
      const [m, lb] = await Promise.all([
        pb.collection("members").getFullList({ sort: "platoon,display_name" }),
        pb.send("/api/orbat/points/leaderboard", { method: "GET" }),
      ]);
      setMembers(m);
      setPoints(Object.fromEntries(lb.rows.map((r) => [r.id, r.allTime])));
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };
  useEffect(() => { load(); }, []);

  const registered = members.filter((m) => m.registered);
  const awaiting = members.filter((m) => !m.registered);
  const rankOrder = (r) => -RANKS.indexOf(r);
  const shown = registered
    .filter((m) => showStatus === "all" || (showStatus === "current" ? m.status !== "discharged" : m.status === showStatus))
    .filter((m) => !q || `${m.display_name} ${m.billet} ${m.platoon}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank) || a.service_number.localeCompare(b.service_number));
  const groups = [...ORBAT_PLATOONS, ""].map((p) => ({ platoon: p, rows: shown.filter((m) => (m.platoon || "") === p) })).filter((g) => g.rows.length);

  const done = (text) => { setForm(null); setMsg({ kind: "ok", text }); load(); };

  // troopers who share a number or callsign (from before re-use was blocked)
  const countBy = (f) => registered.reduce((o, m) => { const k = (m[f] || "").toLowerCase(); if (k) o[k] = (o[k] || 0) + 1; return o; }, {});
  const numCount = countBy("service_number"), csCount = countBy("callsign");
  const dupNum = (m) => numCount[(m.service_number || "").toLowerCase()] > 1;
  const dupCs = (m) => csCount[(m.callsign || "").toLowerCase()] > 1;
  const dupes = registered.filter((m) => dupNum(m) || dupCs(m));

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{registered.filter((m) => m.status !== "discharged").length} TROOPERS ON THE ROSTER</span>
          <h1 className="h1">ALL TROOPERS</h1>
        </div>
        {canRecruit && !form && (
          <button type="button" className="btn btn-admin" onClick={() => { setMsg({ kind: "", text: "" }); setForm({ mode: "new" }); }}>+ REGISTER TROOPER</button>
        )}
      </section>

      {msg.text && <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}

      {canEdit && dupes.length > 0 && (
        <p className="notice notice-error" role="status" style={{ margin: 0 }}>
          {dupes.length} troopers share a number or callsign with someone else: {dupes.map((m) => m.display_name).join(", ")}. They're flagged in the list below. Edit one of each pair to give them their own.
        </p>
      )}

      {transfer && <TransferDialog member={transfer} onClose={() => setTransfer(null)} onDone={(t) => { setTransfer(null); setMsg({ kind: "ok", text: t }); load(); }} />}
      {form && form.mode !== "edit" && <TrooperForm key={form.member?.id || form.mode} {...form} onCancel={() => setForm(null)} onDone={done} />}

      {canRecruit && !form && awaiting.length > 0 && (
        <section className="panel admin-zone stack">
          <div className="row" style={{ gap: 8 }}><span className="admin-tag">RECRUITMENT</span><h2 className="h2" style={{ margin: 0 }}>AWAITING REGISTRATION · {awaiting.length}</h2></div>
          <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Added automatically from training logs. Registering them keeps any points they've already earned.</p>
          <div className="row" style={{ gap: 6 }}>
            {awaiting.map((m) => (
              <button key={m.id} type="button" className="btn btn-sm" onClick={() => setForm({ mode: "link", member: m })}>
                {m.display_name}{points[m.id] ? ` · ${points[m.id]} PTS` : ""}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 240px" }}>SEARCH
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number, billet…" />
        </label>
        <label className="field" style={{ flex: "0 1 200px" }}>SHOW
          <select className="input" value={showStatus} onChange={(e) => setShowStatus(e.target.value)}>
            <option value="current">Everyone serving</option>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="all">Everyone, incl. discharged</option>
          </select>
        </label>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 680 }}>
            <thead><tr><th>RANK</th><th>NUMBER</th><th>CALLSIGN</th><th>STATUS</th><th>BILLET</th><th>JOINED</th><th>POINTS</th>{(canTransfer || canEdit) && <th />}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.platoon}>
                  <tr className="group-row"><td colSpan={cols}>{(g.platoon || "No platoon").toUpperCase()} · {g.rows.length}</td></tr>
                  {g.rows.map((m) => {
                    const open = form?.mode === "edit" && form.member.id === m.id;
                    return (
                    <Fragment key={m.id}>
                    <tr className={open ? "row-open" : undefined}>
                      <td className="mono">{m.rank}</td>
                      <td className="mono">{m.service_number}{canEdit && dupNum(m) && <span className="tag tag-dup" title="Another trooper has this number">SHARED</span>}</td>
                      <td style={{ fontWeight: 700, color: "var(--text-strong)" }}><button type="button" className="tp-link" onClick={() => openTrooper(m.id)} aria-label={`Open ${m.display_name}'s profile`}>{m.callsign}</button>{canEdit && dupCs(m) && <span className="tag tag-dup" title="Another trooper has this callsign">SHARED</span>}</td>
                      <td><span className={`tag tag-st-${m.status}`}>{statusLabel(m.status).toUpperCase()}</span></td>
                      <td>{m.billet || "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{nice(m.joined_at)}</td>
                      <td className="pts">{points[m.id] || 0}</td>
                      {(canTransfer || canEdit) && (
                        <td style={{ whiteSpace: "nowrap" }}>
                          {canTransfer && m.status !== "discharged" && <button type="button" className="btn btn-sm btn-primary" onClick={() => setTransfer(m)} aria-label={`Transfer ${m.display_name}`}>TRANSFER</button>}
                          {canEdit && <button type="button" className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => setForm(open ? null : { mode: "edit", member: m })} aria-expanded={open} aria-label={`Edit ${m.display_name}`}>{open ? "CLOSE" : "EDIT"}</button>}
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr className="edit-row">
                        <td colSpan={cols}>
                          <TrooperForm key={m.id} mode="edit" member={m} onCancel={() => setForm(null)} onDone={done} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </Fragment>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={cols} className="mono" style={{ color: "var(--text-dim)" }}>
                  {registered.length ? "Nobody matches." : canRecruit ? "Nobody registered yet. Press + REGISTER TROOPER to add the first." : "Nobody registered yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function TrooperForm({ mode, member, onCancel, onDone }) {
  const editing = mode === "edit";
  const start = member
    ? (editing
      ? { rank: member.rank, number: member.service_number, callsign: member.callsign }
      : fromNickname(member.display_name))
    : { rank: "", number: "", callsign: "" };
  const [v, setV] = useState({
    rank: start.rank || "CR", number: start.number || "", callsign: start.callsign || "",
    platoon: member?.platoon && ORBAT_PLATOONS.includes(member.platoon) ? member.platoon : "",
    status: editing ? member.status || "recruit" : "recruit",
    billet: editing ? member.billet : "",
    joinedAt: editing && member.joined_at ? member.joined_at.slice(0, 10) : today(),
    discordId: member?.discord_id || "", discordName: member?.discord_id ? member.display_name : "",
    steamId: member?.steam_id || "",
    startingPoints: 0, pointsReason: "", countInTotals: true,
    slotId: "",
  });
  // vacant slots, for the billet dropdown when registering
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    pb.send("/api/orbat/public/orbat", { method: "GET" }).then((l) => {
      setLayout(l);
      // editing: start on their current slot, or their typed billet
      if (editing) {
        const cur = l.slots.find((sl) => sl.member === member.id);
        setV((x) => ({ ...x, slotId: cur ? cur.id : member.billet ? "other" : "" }));
      }
    }).catch(() => setLayout(null));
  }, []);
  const current = editing && layout ? layout.slots.find((sl) => sl.member === member.id) : null;
  const where = (sl) => {
    const sec = layout.sections.find((s) => s.id === sl.section);
    const unit = sec && layout.units.find((u) => u.id === sec.unit);
    return [unit?.name, sec?.name, slotName(sl)].filter(Boolean).join(" · ");
  };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // number or callsign already used by another trooper (checked as they type)
  const [clash, setClash] = useState({});
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ number: v.number.trim(), callsign: v.callsign.trim(), self: member?.id || "" });
      pb.send(`/api/orbat/members/check?${qs}`, { method: "GET" }).then(setClash).catch(() => setClash({}));
    }, 250);
    return () => clearTimeout(t);
  }, [v.number, v.callsign]);
  const usedBy = (c) => `Already used by ${c.name}${c.status === "discharged" ? " (discharged)" : ""}. Numbers and callsigns can't be re-used.`;
  const blocked = !!(clash.number || clash.callsign);
  // a record made from a log: fill in what we can from their current Discord name
  useEffect(() => {
    if (mode !== "link" || !member.discord_id) return;
    pb.collection("discord_members").getFirstListItem(pb.filter("discord_id = {:d}", { d: member.discord_id }))
      .then((d) => pickDiscord(d)).catch(() => {});
  }, []);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const pickDiscord = (d) => {
    const n = fromNickname(d.display_name || d.global_name || d.username);
    setV((cur) => ({
      ...cur, discordId: d.discord_id, discordName: d.display_name || d.username,
      rank: cur.number || editing ? cur.rank : n.rank || cur.rank,
      number: cur.number || n.number, callsign: cur.callsign || n.callsign,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { ...v, startingPoints: Number(v.startingPoints) || 0, memberId: mode === "link" ? member.id : undefined };
    try {
      if (editing) {
        const r = await pb.send(`/api/orbat/members/${member.id}/update`, { method: "POST", body });
        onDone((r.changed || r.slot ? `Saved ${r.name}.` : "Nothing changed.")
          + (r.slot ? ` Now in ${r.slot}.` : "") + (r.slotError ? ` Slot not changed: ${r.slotError}` : ""));
      } else {
        const r = await pb.send("/api/orbat/members/register", { method: "POST", body: { ...body, slotId: v.slotId === "other" ? "" : v.slotId } });
        onDone(`Registered ${r.name}${r.points ? ` with ${r.points} point${r.points === 1 ? "" : "s"}` : ""}.`
          + (r.slot ? ` Placed in ${r.slot}.` : "") + (r.slotError ? ` They weren't placed in the slot: ${r.slotError}` : ""));
      }
    } catch (err) {
      const text = errorMessage(err);
      setError(text);
      setBusy(false);
    }
  };

  const preview = `${v.rank}-${v.number || "0000"} "${v.callsign || "Callsign"}"`;

  return (
    <form onSubmit={submit} className="panel admin-zone stack" aria-labelledby="tf-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="admin-tag">RECRUITMENT</span>
          <h2 id="tf-title" className="h2" style={{ margin: 0 }}>{editing ? `EDIT ${member.display_name}` : mode === "link" ? `REGISTER ${member.display_name}` : "REGISTER TROOPER"}</h2>
        </span>
        <span className="mono" style={{ fontSize: 14, color: "var(--holo-bright)" }} aria-label="Name preview">{preview}</span>
      </div>
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}

      <DiscordPicker value={v.discordId ? v.discordName || v.discordId : ""} onPick={pickDiscord}
        onClear={() => setV({ ...v, discordId: "", discordName: "" })} locked={mode === "link" && !!member.discord_id} />

      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "0 1 110px" }}>RANK
          <select className="input" value={v.rank} onChange={set("rank")}>{RANKS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label className="field" style={{ flex: "0 1 130px" }}>NUMBER
          <input className={`input mono${clash.number ? " input-bad" : ""}`} value={v.number} onChange={set("number")} inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="7567" required
            aria-invalid={!!clash.number} aria-describedby={clash.number ? "tf-num-clash" : undefined} />
        </label>
        <label className="field" style={{ flex: "1 1 180px" }}>CALLSIGN
          <input className={`input${clash.callsign ? " input-bad" : ""}`} value={v.callsign} onChange={set("callsign")} maxLength={40} placeholder="Rex" required
            aria-invalid={!!clash.callsign} aria-describedby={clash.callsign ? "tf-cs-clash" : undefined} />
        </label>
        <label className="field" style={{ flex: "0 1 180px" }}>UNIT
          <select className="input" value={v.platoon} onChange={(e) => setV({ ...v, platoon: e.target.value, slotId: editing ? v.slotId : "", billet: editing ? v.billet : "" })}>
            <option value="">None yet</option>
            <optgroup label="Command">{ORBAT_PLATOONS.slice(0, 3).map((p) => <option key={p}>{p}</option>)}</optgroup>
            <optgroup label="Platoons">{ORBAT_PLATOONS.slice(3, 7).map((p) => <option key={p}>{p}</option>)}</optgroup>
            <optgroup label="Special units">{ORBAT_PLATOONS.slice(7).map((p) => <option key={p}>{p}</option>)}</optgroup>
          </select>
        </label>
        <label className="field" style={{ flex: "0 1 170px" }}>STATUS
          <select className="input" value={v.status} onChange={set("status")}>{STATUSES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
        </label>
      </div>
      {blocked && (
        <div className="notice notice-error stack" role="alert" style={{ margin: 0, gap: 4 }}>
          {clash.number && <span id="tf-num-clash"><b>NUMBER {v.number.trim()}:</b> {usedBy(clash.number)}</span>}
          {clash.callsign && <span id="tf-cs-clash"><b>CALLSIGN {v.callsign.trim().toUpperCase()}:</b> {usedBy(clash.callsign)}</span>}
        </div>
      )}
      <div className="row" style={{ alignItems: "flex-end" }}>
        {layout && (v.platoon || current) ? (
          <>
            <label className="field" style={{ flex: "1 1 240px" }}>BILLET (OPTIONAL)
              <select className="input" value={v.slotId} onChange={(e) => setV({ ...v, slotId: e.target.value, billet: e.target.value === "other" && editing && !current ? v.billet : "" })}>
                {current && <option value={current.id}>Keep current: {where(current)}</option>}
                <option value="">{editing ? "No slot (holding)" : "No slot yet (holding)"}</option>
                {vacantGroups(layout, v.platoon, current?.id).map((g) => (
                  <optgroup key={g.section.id} label={g.label}>
                    {g.billets.map((b) => <option key={b.slotId} value={b.slotId}>{b.billet}{b.open > 1 ? ` (${b.open} open)` : ""}</option>)}
                  </optgroup>
                ))}
                <option value="other">Other (type a billet)</option>
              </select>
            </label>
            {v.slotId === "other" && (
              <label className="field" style={{ flex: "1 1 200px" }}>OTHER BILLET
                <input className="input" value={v.billet} onChange={set("billet")} maxLength={100} placeholder="e.g. Recruiter" />
              </label>
            )}
          </>
        ) : (
          <label className="field" style={{ flex: "1 1 200px" }}>BILLET (OPTIONAL)
            <input className="input" value={v.billet} onChange={set("billet")} maxLength={100} placeholder={editing ? "e.g. Medic, Squad Leader" : "Pick a unit to choose a slot"} />
          </label>
        )}
        <label className="field" style={{ flex: "0 1 170px" }}>JOINED
          <input className="input" type="date" value={v.joinedAt} onChange={set("joinedAt")} required />
        </label>
        <label className="field" style={{ flex: "0 1 230px" }}>STEAM ID (OPTIONAL)
          <input className="input mono" value={v.steamId} onChange={set("steamId")} inputMode="numeric" maxLength={17} placeholder="7656119…" />
        </label>
      </div>

      {!editing && (
        <div className="row" style={{ alignItems: "flex-end", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <label className="field" style={{ flex: "0 1 170px" }}>STARTING POINTS
            <input className="input" type="number" min={0} max={10000} value={v.startingPoints} onChange={set("startingPoints")} />
          </label>
          {Number(v.startingPoints) > 0 && (
            <label className="field" style={{ flex: "1 1 260px" }}>REASON
              <input className="input" value={v.pointsReason} onChange={set("pointsReason")} maxLength={300} placeholder="e.g. Points carried over from the old roster" />
            </label>
          )}
          {Number(v.startingPoints) > 0 && (
            <label className="row" style={{ gap: 8, fontSize: 14, flex: "1 1 100%" }}>
              <input type="checkbox" className="check" checked={v.countInTotals} onChange={set("countInTotals")} />
              Count towards this week's and the current campaign's totals
            </label>
          )}
          <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flex: "1 1 220px", paddingBottom: 10 }}>
            {Number(v.startingPoints) > 0
              ? (v.countInTotals ? "Added to the points ledger and the audit log." : "Added to their all-time total only. Weekly, campaign and calendar totals leave them out.")
              : "Leave at 0 for a new recruit."}
            {mode === "link" ? " Points they've already earned from logs are kept." : ""}
          </span>
        </div>
      )}


      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onCancel}>CANCEL</button>
        <button type="submit" className="btn btn-primary" disabled={busy || blocked} title={blocked ? "Pick a number and callsign nobody else uses" : undefined}>{editing ? "SAVE" : "REGISTER"}</button>
      </div>
    </form>
  );
}

// Search the Discord member list the bot keeps, to link the trooper's account.
function DiscordPicker({ value, onPick, onClear, locked }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      pb.collection("discord_members").getList(1, 8, {
        filter: pb.filter("in_server = true && (display_name ~ {:q} || username ~ {:q} || global_name ~ {:q} || service_number = {:q})", { q: term }),
        sort: "display_name",
      }).then((r) => setHits(r.items)).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <span className="eyebrow">DISCORD</span>
        <span className="badge badge-on">{value}</span>
        {!locked && <button type="button" className="btn btn-sm" onClick={onClear}>CHANGE</button>}
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="field">DISCORD ACCOUNT (RECOMMENDED)
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search their Discord name or number…" />
      </label>
      {hits.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {hits.map((d) => (
            <button key={d.id} type="button" className="btn btn-sm" onClick={() => { onPick(d); setQ(""); setHits([]); }}>
              {d.display_name || d.username}{d.username && d.display_name !== d.username ? ` (@${d.username})` : ""}
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>Nobody in the Discord matches. You can still register them without it.</span>}
    </div>
  );
}
