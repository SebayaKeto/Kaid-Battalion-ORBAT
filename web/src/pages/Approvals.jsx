import { useEffect, useMemo, useState } from "react";
import { pb, errorMessage } from "../pb.js";
import { loadCatalog } from "./Troopers.jsx";

export const PLATOONS = ["", "Acklay", "Chimaera", "Banshee", "Drexl", "Ranger", "Air Wing", "Navy", "Other"];
const ROLES = [["instructor", "Instructor"], ["trainee", "Trainee"], ["attendee", "Attendee"]];
const day = (iso) => (iso ? iso.slice(0, 10) : "");
const nice = (iso) => (iso ? new Date(iso.replace(" ", "T")).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "");
const stamp = (iso) => (iso ? new Date(iso.replace(" ", "T")).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const ACTIONS = {
  logged: "Logged", post_edited: "Discord post edited", post_edited_after_review: "Post edited after review",
  post_deleted_after_review: "Post deleted after review", withdrawn: "Withdrawn", reopened: "Reopened",
  details_changed: "Details changed", date_confirmed: "Date confirmed", attendee_added: "Attendee added",
  attendee_changed: "Attendee changed", attendee_removed: "Attendee removed", approved: "Approved", denied: "Denied",
  points_adjusted: "Points adjusted", member_registered: "Registered", member_updated: "Trooper updated",
  award_added: "Qualification or certification added", award_revoked: "Qualification or certification taken off",
  campaign_started: "Campaign started", campaign_renamed: "Campaign renamed",
  retracted: "Retracted", reopened_for_edit: "Reopened to edit",
  asset_logged: "Assets logged", asset_retracted: "Asset entry retracted", asset_type_submitted: "Asset type submitted",
  asset_type_approved: "Asset type approved", asset_type_denied: "Asset type denied", asset_type_changed: "Asset type changed",
  asset_type_retired: "Asset type retired", asset_type_restored: "Asset type restored", asset_preset_saved: "Supply preset saved",
  asset_preset_deleted: "Supply preset deleted", asset_supply_set: "Starting supply set",
  codex_page_saved: "Codex page saved", codex_page_created: "Codex page added", codex_page_deleted: "Codex page deleted",
  codex_page_reset: "Codex page put back to original", codex_page_restored: "Codex page version restored", codex_pages_reordered: "Codex pages reordered",
};
const actionTag = (a) => (a === "approved" || a === "member_registered" || a === "asset_type_approved" ? "approved" : a === "denied" || a === "withdrawn" || a === "retracted" || a === "post_deleted_after_review" || a === "asset_retracted" || a === "asset_type_denied" ? "denied" : a === "asset_type_submitted" ? "pending" : a === "post_edited_after_review" || a === "reopened_for_edit" ? "pending" : "training");
export const eventTitle = (ev) => ev.title || (ev.type === "operation" ? "Operation" : "Training log");

const reviewer = (ev) => ev.expand?.reviewed_by?.discord_name || ev.expand?.reviewed_by?.username || "—";

function TypeTag({ type }) {
  return <span className={`tag tag-${type}`}>{type === "operation" ? "OPERATION" : "TRAINING"}</span>;
}

// Points staff: review pending events and approve or deny them.
export default function Approvals({ me, onCountChange }) {
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState([]);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState("queue");
  const [historyPick, setHistoryPick] = useState("");

  const loadQueue = async (keep) => {
    try {
      const [p, r] = await Promise.all([
        pb.collection("events").getFullList({ filter: "status = 'pending'", sort: "event_date,created" }),
        pb.collection("events").getList(1, 10, { filter: "status != 'pending'", sort: "-updated", expand: "reviewed_by" }),
      ]);
      setPending(p);
      setRecent(r.items);
      onCountChange?.(p.length);
      setSelected((cur) => (keep && p.some((x) => x.id === cur) ? cur : p[0]?.id || ""));
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };
  const loadMembers = async () => {
    try { setMembers(await pb.collection("members").getFullList({ sort: "display_name" })); } catch { /* shown elsewhere */ }
  };
  useEffect(() => { loadQueue(true); loadMembers(); }, []);
  // new Discord logs arrive in the background
  useEffect(() => { const t = setInterval(() => loadQueue(true), 30000); return () => clearInterval(t); }, []);

  const current = pending.find((p) => p.id === selected);

  const createManual = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    try {
      const rec = await pb.collection("events").create({
        type: f.get("type"), title: f.get("title"), host_platoon: f.get("host"),
        event_date: `${f.get("date")} 12:00:00.000Z`,
      });
      setCreating(false);
      await loadQueue(false);
      setSelected(rec.id);
      setMsg({ kind: "ok", text: "Event created. Add who attended, then approve it." });
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 8 }}><span className="admin-tag">ADMIN</span><span className="eyebrow">POINTS</span></span>
          <h1 className="h1">APPROVALS</h1>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {[["queue", `QUEUE · ${pending.length}`], ["history", "HISTORY"], ["log", "SITE LOG"]].map(([v, l]) => (
            <button key={v} type="button" className={`btn btn-sm${view === v ? " btn-primary" : ""}`} aria-pressed={view === v} onClick={() => { setView(v); if (v === "queue") { loadQueue(true); loadMembers(); } }}>{l}</button>
          ))}
          {view === "queue" && <button type="button" className="btn btn-admin" onClick={() => setCreating((c) => !c)}>{creating ? "CANCEL" : "+ LOG EVENT"}</button>}
        </div>
      </section>

      {view === "history" && <History key={historyPick} me={me} initial={historyPick} onReopened={async (id, text) => { setView("queue"); await loadQueue(false); setSelected(id); setMsg({ kind: "ok", text }); }} />}
      {view === "log" && <SiteLog onOpen={(id) => { setHistoryPick(id); setView("history"); }} />}
      {view === "queue" && <>

      {msg.text && <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}

      {creating && (
        <form onSubmit={createManual} className="panel admin-zone row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "0 1 150px" }}>TYPE
            <select className="input" name="type" defaultValue="operation"><option value="operation">Operation</option><option value="training">Training</option></select>
          </label>
          <label className="field" style={{ flex: "1 1 220px" }}>TITLE
            <input className="input" name="title" maxLength={200} placeholder="Op name or course" />
          </label>
          <label className="field" style={{ flex: "0 1 170px" }}>DATE
            <input className="input" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="field" style={{ flex: "0 1 160px" }} title="For operations: troopers from this platoon get billeted points, everyone else gets fill-in points. None counts everyone as billeted.">HOST PLATOON
            <select className="input" name="host" defaultValue="">{PLATOONS.map((p) => <option key={p} value={p}>{p || "None"}</option>)}</select>
          </label>
          <button type="submit" className="btn btn-primary">CREATE</button>
        </form>
      )}

      <div className="split">
        <aside className="stack" aria-label="Queue">
          <h2 className="h2">PENDING · {pending.length}</h2>
          <div className="queue">
            {pending.map((ev) => (
              <button key={ev.id} type="button" className="queue-item" aria-current={ev.id === selected} onClick={() => setSelected(ev.id)}>
                <span className="row" style={{ gap: 6 }}><TypeTag type={ev.type} />{((ev.parse_notes || []).length > 0 || ev.date_needs_check) && <span className="tag tag-pending">CHECK</span>}</span>
                <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{eventTitle(ev)}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {nice(ev.event_date)} · {ev.source === "discord" ? `Discord · ${ev.discord_author_name || "log"}` : ev.source === "arma" ? "Arma server" : "Logged on site"}
                </span>
              </button>
            ))}
            {pending.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Nothing waiting. New training logs posted in Discord appear here.</p>}
          </div>
          <h2 className="h2" style={{ marginTop: 12 }}>RECENTLY REVIEWED</h2>
          <div className="queue">
            {recent.map((ev) => (
              <button key={ev.id} type="button" className="queue-item" onClick={() => { setHistoryPick(ev.id); setView("history"); }} title="Open in History">
                <span className="row" style={{ gap: 6 }}><TypeTag type={ev.type} /><span className={`tag tag-${ev.status}`}>{ev.status.toUpperCase()}</span></span>
                <span style={{ fontWeight: 700 }}>{eventTitle(ev)}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {nice(ev.event_date)} · {ev.status === "withdrawn" ? "post removed" : `by ${reviewer(ev)}`}{ev.review_note && ev.status !== "withdrawn" ? ` · "${ev.review_note}"` : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {current
          ? <EventReview key={current.id} ev={current} me={me} members={members} onMembersChanged={loadMembers}
              onSaved={() => loadQueue(true)} onDone={(text) => { setMsg({ kind: "ok", text }); loadQueue(false); }} />
          : <section className="panel"><p className="mono" style={{ margin: 0, color: "var(--text-dim)" }}>Select an event to review it.</p></section>}
      </div>
      </>}
    </>
  );
}

function EventReview({ ev, me, members, onMembersChanged, onSaved, onDone }) {
  const [details, setDetails] = useState({ type: ev.type, title: ev.title, date: day(ev.event_date), host: ev.host_platoon });
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const byName = useMemo(() => Object.fromEntries(members.map((m) => [m.display_name.toLowerCase(), m])), [members]);
  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  const loadRows = async () => {
    try { setRows(await pb.collection("attendance").getFullList({ filter: pb.filter("event = {:e}", { e: ev.id }), sort: "created" })); }
    catch (err) { setError(errorMessage(err)); }
  };
  useEffect(() => { loadRows(); }, [ev.id]);

  const dirty = details.type !== ev.type || details.title !== ev.title || details.date !== day(ev.event_date) || details.host !== ev.host_platoon;
  const saveDetails = async () => {
    setError("");
    try {
      await pb.collection("events").update(ev.id, { type: details.type, title: details.title, host_platoon: details.host, event_date: `${details.date} 12:00:00.000Z` });
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
  };

  const confirmDate = async () => {
    setError("");
    try { await pb.collection("events").update(ev.id, { date_needs_check: false }); onSaved(); }
    catch (err) { setError(errorMessage(err)); }
  };

  const patchRow = async (row, data) => {
    setError("");
    try {
      const updated = await pb.collection("attendance").update(row.id, data);
      setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)));
    } catch (err) { setError(errorMessage(err)); }
  };
  const removeRow = async (row) => {
    try { await pb.collection("attendance").delete(row.id); setRows((rs) => rs.filter((r) => r.id !== row.id)); }
    catch (err) { setError(errorMessage(err)); }
  };
  const addToRoster = async (row) => {
    try {
      const m = await pb.collection("members").create({ display_name: row.name, active: true, source: "site" });
      await onMembersChanged();
      await patchRow(row, { member: m.id });
    } catch (err) { setError(errorMessage(err)); }
  };
  const addAttendee = async (ev2) => {
    ev2.preventDefault();
    const m = byName[adding.trim().toLowerCase()];
    if (!m) { setError(`"${adding}" isn't on the roster. Pick a name from the list.`); return; }
    if (rows.some((r) => r.member === m.id)) { setError(`${m.display_name} is already listed.`); return; }
    try {
      const r = await pb.collection("attendance").create({ event: ev.id, member: m.id, name: m.display_name, discord_id: m.discord_id, role: "attendee", award_point: true });
      setRows((rs) => [...rs, r]);
      setAdding("");
      setError("");
    } catch (err) { setError(errorMessage(err)); }
  };

  const awarded = new Set(rows.filter((r) => r.award_point && r.member).map((r) => r.member)).size;

  // qualification or certification for the trainees who passed
  const [cat, setCat] = useState(null);
  const [award, setAward] = useState(null); // "" = nothing, "qual:MM:0", "cert:ZEUS:1"
  useEffect(() => {
    loadCatalog().then(setCat).catch(() => {});
    const text = ev.qualification || ev.title;
    if (ev.type !== "training" || !text) { setAward(""); return; }
    pb.send(`/api/orbat/awards/catalog?text=${encodeURIComponent(text)}`, { method: "GET" })
      .then((c) => setAward(c.match ? `${c.match.kind}:${c.match.key}:${c.match.level}` : ""))
      .catch(() => setAward(""));
  }, [ev.id]);
  const [ticked, setTicked] = useState(null); // null = trainees on the log
  const people = [];
  rows.forEach((r) => { if (r.member && !people.some((x) => x.member === r.member)) people.push(r); });
  const isTrainee = (id) => rows.some((y) => y.member === id && y.role === "trainee");
  const isTicked = (r) => (ticked ? ticked.includes(r.member) : isTrainee(r.member));
  const toggle = (r) => {
    const cur = people.filter(isTicked).map((x) => x.member);
    setTicked(cur.includes(r.member) ? cur.filter((x) => x !== r.member) : [...cur, r.member]);
  };
  const awardParts = award ? award.split(":") : null;
  const awardTo = people.filter(isTicked).map((x) => x.member);
  const awardBody = awardParts && awardTo.length ? { kind: awardParts[0], key: awardParts[1], level: Number(awardParts[2]), members: awardTo } : null;
  const awardName = (() => {
    if (!awardParts || !cat) return "";
    const list = awardParts[0] === "qual" ? cat.quals : cat.certs;
    const x = list.find((y) => y.key === awardParts[1]);
    if (!x) return "";
    if (x.steps) return x.steps[Number(awardParts[2])] + (x.code ? ` (${x.code} step ${Number(awardParts[2]) + 1})` : "");
    return x.code ? `${x.name} (${x.code})` : x.name;
  })();
  const missing = rows.filter((r) => r.award_point && !r.member);

  const [activityKey, setActivityKey] = useState(0);
  useEffect(() => { setActivityKey((k) => k + 1); }, [rows, ev.updated]);

  const review = async (decision) => {
    if (decision === "deny" && note.trim().length < 3) { setError("Write the reason for denying it first. The bot posts it in Discord for the person who logged it."); return; }
    if (decision === "deny" && !window.confirm(`Deny this event? Nobody gets points for it${ev.source === "discord" ? ", and the bot will tell the person who logged it why, in a Discord thread" : ""}.`)) return;
    if (dirty) await saveDetails();
    setBusy(true);
    setError("");
    try {
      const r = await pb.send(`/api/orbat/events/${ev.id}/review`, { method: "POST", body: { decision, note, award: decision === "approve" ? awardBody : null } });
      onDone(decision === "approve"
        ? `Approved: ${r.points} point${r.points === 1 ? "" : "s"} awarded for ${eventTitle(ev)}.`
          + (r.awarded?.length ? ` ${awardName} added to ${r.awarded.join(", ")}.` : "")
          + (r.promoted?.length ? ` Promoted to CT: ${r.promoted.join(", ")}.` : "")
        : `Denied: ${eventTitle(ev)}.`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  // Unit Leader: drop a log without denying it (no Discord thread); it stays on record
  const retract = async () => {
    if (note.trim().length < 3) { setError("Write the reason for retracting it in the note first."); return; }
    if (!window.confirm(`Retract ${eventTitle(ev)}? Nobody gets points for it and it leaves the queue. The log stays on record as retracted, and nothing is posted in Discord.`)) return;
    setBusy(true);
    setError("");
    try {
      await pb.send(`/api/orbat/events/${ev.id}/retract`, { method: "POST", body: { reason: note } });
      onDone(`Retracted: ${eventTitle(ev)}.`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  const link = ev.discord_message_id ? `https://discord.com/channels/${me.guildId}/${ev.discord_channel_id}/${ev.discord_message_id}` : "";

  return (
    <section className="panel admin-zone stack" aria-labelledby="ev-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id="ev-title" className="h2" style={{ margin: 0 }}>{eventTitle({ ...ev, ...details }).toUpperCase()}</h2>
        {link && <a className="btn btn-sm" href={link} target="_blank" rel="noreferrer">OPEN IN DISCORD</a>}
      </div>

      {(ev.parse_notes || []).map((n, i) => <p key={i} className="notice notice-warn" style={{ margin: 0 }}>{n}</p>)}
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}

      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "0 1 150px" }}>TYPE
          <select className="input" value={details.type} onChange={(e) => setDetails({ ...details, type: e.target.value })}>
            <option value="training">Training</option><option value="operation">Operation</option>
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 220px" }}>TITLE / QUALIFICATION
          <input className="input" value={details.title} maxLength={200} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
        </label>
        <label className="field" style={{ flex: "0 1 170px", color: ev.date_needs_check ? "#f4e2b0" : undefined }}>DATE{ev.date_needs_check ? " · CHECK" : ""}
          <input className="input" type="date" value={details.date} onChange={(e) => setDetails({ ...details, date: e.target.value })} />
        </label>
        <label className="field" style={{ flex: "0 1 160px" }} title="For operations: troopers from this platoon get billeted points, everyone else gets fill-in points. None counts everyone as billeted.">HOST PLATOON
          <select className="input" value={details.host} onChange={(e) => setDetails({ ...details, host: e.target.value })}>
            {PLATOONS.map((p) => <option key={p} value={p}>{p || "None"}</option>)}
          </select>
        </label>
        {dirty && <button type="button" className="btn" onClick={saveDetails}>SAVE DETAILS</button>}
        {ev.date_needs_check && !dirty && (
          <button type="button" className="btn btn-admin" onClick={confirmDate} title="The date wasn't a Discord timestamp. Check it, then confirm.">CONFIRM DATE</button>
        )}
      </div>

      {ev.raw_text && (
        <details>
          <summary className="mono" style={{ cursor: "pointer", fontSize: 12, color: "var(--label)" }}>DISCORD POST BY {(ev.discord_author_name || "UNKNOWN").toUpperCase()}</summary>
          <pre className="raw" style={{ marginTop: 8 }}>{ev.raw_text}</pre>
        </details>
      )}

      <div className="table-wrap">
        <table className="data" style={{ minWidth: 640 }}>
          <thead><tr><th>POINT</th><th>AS LOGGED</th><th>ROSTER MEMBER</th><th>ROLE</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const m = byId[r.member];
              return (
                <tr key={r.id}>
                  <td><input type="checkbox" className="check" checked={r.award_point} aria-label={`Point for ${r.name}`} onChange={(e) => patchRow(r, { award_point: e.target.checked })} /></td>
                  <td>{r.name || "—"}</td>
                  <td>
                    {m ? (
                      <span className="row" style={{ gap: 6 }}>
                        <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{m.display_name}</span>
                        {m.source === "discord" && <span className="tag tag-pending" title="Added automatically from Discord. Check their details on the roster.">NEW</span>}
                      </span>
                    ) : (
                      <span className="row" style={{ gap: 6 }}>
                        <MemberPicker members={members} onPick={(id) => patchRow(r, { member: id })} />
                        <button type="button" className="btn btn-sm" onClick={() => addToRoster(r)}>ADD "{r.name}" TO ROSTER</button>
                      </span>
                    )}
                  </td>
                  <td>
                    <select className="input" style={{ minHeight: 34, padding: "4px 8px" }} value={r.role || "attendee"} onChange={(e) => patchRow(r, { role: e.target.value })} aria-label={`Role for ${r.name}`}>
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td><button type="button" className="btn btn-sm" onClick={() => removeRow(r)} aria-label={`Remove ${r.name}`}>REMOVE</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="mono" style={{ color: "var(--text-dim)" }}>No attendees yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <form onSubmit={addAttendee} className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 260px" }}>ADD ATTENDEE
          <input className="input" list="roster-names" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Start typing a roster name…" />
        </label>
        <button type="submit" className="btn">+ ADD</button>
      </form>
      <datalist id="roster-names">{members.map((m) => <option key={m.id} value={m.display_name} />)}</datalist>

      {cat && award !== null && (
        <div className="award-box stack" style={{ gap: 8 }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "1 1 320px" }}>QUALIFICATION OR CERTIFICATION TO AWARD
              <select className="input" value={award} onChange={(e) => setAward(e.target.value)}>
                <option value="">Nothing to award</option>
                <optgroup label="Qualifications">{cat.quals.map((x) => <option key={x.key} value={`qual:${x.key}:0`}>{x.name} ({x.code}){x.key === "RFL" ? " · GENTAC" : ""}</option>)}</optgroup>
                <optgroup label="Certifications">{cat.certs.flatMap((x) => x.steps
                  ? x.steps.map((st, j) => <option key={x.key + j} value={`cert:${x.key}:${j}`}>{st}{x.code ? ` (${x.code} step ${j + 1})` : ""}</option>)
                  : [<option key={x.key} value={`cert:${x.key}:0`}>{x.name}{x.code ? ` (${x.code})` : ""}</option>])}</optgroup>
              </select>
            </label>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", flex: "1 1 220px", paddingBottom: 10 }}>
              {ev.type !== "training" ? "Operations don't usually award anything." : award ? `Picked from the log's Qualification field ("${ev.qualification || ev.title}"). Change it if that's wrong.` : (ev.qualification || ev.title) ? `Nothing matched "${ev.qualification || ev.title}". Pick one if it should award something.` : "The log has no Qualification field."}
            </span>
          </div>
          {award && (
            <div>
              <span className="eyebrow">AWARD TO · TRAINEES ARE TICKED</span>
              {people.map((r) => (
                <label key={r.member} className="trainee">
                  <input type="checkbox" className="check" checked={isTicked(r)} onChange={() => toggle(r)} />
                  {byId[r.member]?.display_name || r.name}
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>{isTrainee(r.member) ? "trainee" : r.role || "attendee"}</span>
                </label>
              ))}
              {people.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Nobody on the log is matched to the roster yet.</p>}
              {awardParts[1] === "RFL" && <p className="mono" style={{ margin: "6px 0 0", fontSize: 12, color: "#f4e2b0" }}>GENTAC: ticked troopers who are still CR are promoted to CT when you approve.</p>}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ alignItems: "flex-end", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
        <label className="field" style={{ flex: "1 1 260px" }}>NOTE / REASON (NEEDED TO DENY)
          <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={ev.source === "discord" ? "A denial reason is posted in Discord for the person who logged it" : "Shown in the history"} />
        </label>
        {me.perms.can_manage_logs && <button type="button" className="btn btn-danger" disabled={busy} onClick={retract} title="Unit Leader: remove it from the queue without denying it. Kept on record as retracted.">RETRACT</button>}
        <button type="button" className="btn" disabled={busy} onClick={() => review("deny")}>DENY</button>
        <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0 || (ev.date_needs_check && !dirty)} onClick={() => review("approve")}
          title={missing.length ? "Pick a roster member for everyone ticked" : ev.date_needs_check ? "Confirm the date first" : undefined}>
          APPROVE · {awarded} POINT{awarded === 1 ? "" : "S"}{awardBody ? ` + ${awardName.split(" (")[0].toUpperCase()}` : ""}
        </button>
      </div>
      {ev.date_needs_check && !dirty && <p className="mono" style={{ margin: 0, fontSize: 12, color: "#f4e2b0" }}>Check the date, then press CONFIRM DATE (or change it) to approve.</p>}
      {missing.length > 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "#f4e2b0" }}>Pick a roster member for {missing.map((r) => r.name).join(", ")}, or untick them, to approve.</p>}
      <Activity eventId={ev.id} refreshKey={activityKey} />
    </section>
  );
}

function MemberPicker({ members, onPick }) {
  const [v, setV] = useState("");
  const pick = (val) => {
    setV(val);
    const m = members.find((x) => x.display_name.toLowerCase() === val.trim().toLowerCase());
    if (m) onPick(m.id);
  };
  return <input className="input" style={{ minHeight: 34, padding: "4px 8px", maxWidth: 200 }} list="roster-names" value={v} onChange={(e) => pick(e.target.value)} placeholder="Match to member…" aria-label="Match to roster member" />;
}

// Everything that happened to one log, oldest first.
function Activity({ eventId, refreshKey }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    pb.collection("audit_log").getFullList({ filter: pb.filter("event = {:e}", { e: eventId }), sort: "created" })
      .then((r) => live && setItems(r)).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [eventId, refreshKey]);
  return (
    <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <h3 className="eyebrow" style={{ margin: 0 }}>ACTIVITY</h3>
      {!items && <p className="mono" style={{ margin: 0, fontSize: 12 }}>Loading…</p>}
      {items && items.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>No activity recorded.</p>}
      {items && items.length > 0 && <ol className="timeline">{items.map((a) => <AuditRow key={a.id} a={a} />)}</ol>}
    </div>
  );
}

function AuditRow({ a, showEvent, onOpen }) {
  return (
    <li className="timeline-item">
      <span className="mono timeline-time">{stamp(a.created)}</span>
      <span className="stack" style={{ gap: 3 }}>
        <span className="row" style={{ gap: 8 }}>
          <span className={`tag tag-${actionTag(a.action)}`}>{(ACTIONS[a.action] || a.action).toUpperCase()}</span>
          <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{a.actor_name || "System"}</span>
          {showEvent && a.event_title && (a.event && onOpen
            ? <button type="button" className="linkish" onClick={() => onOpen(a.event)}>{a.event_title}</button>
            : <span>{a.event_title}</span>)}
        </span>
        {a.detail && <span style={{ fontSize: 14 }}>{a.detail}</span>}
        {(a.before_text || a.after_text) && a.action !== "logged" && (
          <details>
            <summary className="mono" style={{ cursor: "pointer", fontSize: 12, color: "var(--label)" }}>{a.before_text && a.after_text ? "SHOW BEFORE AND AFTER" : "SHOW POST"}</summary>
            <div className="before-after">
              {a.before_text && <div><span className="eyebrow">BEFORE</span><pre className="raw">{a.before_text}</pre></div>}
              {a.after_text && <div><span className="eyebrow">AFTER</span><pre className="raw">{a.after_text}</pre></div>}
            </div>
          </details>
        )}
      </span>
    </li>
  );
}

// Every log that has been approved, denied or withdrawn, read-only.
function History({ me, initial, onReopened }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(initial || "");
  const [error, setError] = useState("");
  const [recKey, setRecKey] = useState(0);

  const filter = () => {
    const parts = ["status != 'pending'"];
    const params = {};
    if (status) { parts.push("status = {:s}"); params.s = status; }
    if (q.trim()) { parts.push("(title ~ {:q} || discord_author_name ~ {:q} || review_note ~ {:q})"); params.q = q.trim(); }
    return pb.filter(parts.join(" && "), params);
  };
  const load = async (p) => {
    try {
      const r = await pb.collection("events").getList(p, 30, { filter: filter(), sort: "-event_date,-updated", expand: "reviewed_by" });
      setItems((cur) => (p === 1 ? r.items : [...cur, ...r.items]));
      setPage(p);
      setMore(r.page < r.totalPages);
      if (p === 1 && !initial) setSelected((cur) => cur || r.items[0]?.id || "");
    } catch (err) { setError(errorMessage(err)); }
  };
  useEffect(() => { const t = setTimeout(() => load(1), 200); return () => clearTimeout(t); }, [status, q]);

  return (
    <div className="split">
      <aside className="stack" aria-label="Past logs">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 140px" }}>SEARCH
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, logger, reason…" />
          </label>
          <label className="field" style={{ flex: "0 1 130px" }}>STATUS
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="withdrawn">Withdrawn</option><option value="retracted">Retracted</option>
            </select>
          </label>
        </div>
        {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div className="queue">
          {items.map((ev) => (
            <button key={ev.id} type="button" className="queue-item" aria-current={ev.id === selected} onClick={() => setSelected(ev.id)}>
              <span className="row" style={{ gap: 6 }}><TypeTag type={ev.type} /><span className={`tag tag-${ev.status === "withdrawn" ? "denied" : ev.status}`}>{ev.status.toUpperCase()}</span></span>
              <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{eventTitle(ev)}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{nice(ev.event_date)} · {ev.status === "withdrawn" ? "post removed" : `by ${reviewer(ev)}`}</span>
            </button>
          ))}
          {items.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>No reviewed logs{q || status ? " match" : " yet"}.</p>}
          {more && <button type="button" className="btn btn-sm" onClick={() => load(page + 1)}>LOAD MORE</button>}
        </div>
      </aside>
      {selected
        ? <EventRecord key={`${selected}-${recKey}`} id={selected} me={me} onReopened={onReopened} onChanged={() => { load(1); setRecKey((k) => k + 1); }} />
        : <section className="panel"><p className="mono" style={{ margin: 0, color: "var(--text-dim)" }}>Select a log to see what happened to it.</p></section>}
    </div>
  );
}

function EventRecord({ id, me, onReopened, onChanged }) {
  const [ev, setEv] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      pb.collection("events").getOne(id, { expand: "reviewed_by,created_by" }),
      pb.collection("attendance").getFullList({ filter: pb.filter("event = {:e}", { e: id }), sort: "created", expand: "member" }),
    ]).then(([e, r]) => { setEv(e); setRows(r); }).catch((err) => setError(errorMessage(err)));
  }, [id]);
  if (error) return <section className="panel"><p className="notice notice-error" style={{ margin: 0 }}>{error}</p></section>;
  if (!ev) return <section className="panel"><p className="mono" style={{ margin: 0 }}>Loading…</p></section>;
  const link = ev.discord_message_id ? `https://discord.com/channels/${me.guildId}/${ev.discord_channel_id}/${ev.discord_message_id}` : "";
  const given = new Set(rows.filter((r) => r.award_point && r.member).map((r) => r.member)).size;
  return (
    <section className="panel stack" aria-labelledby="rec-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 8 }}>
          <TypeTag type={ev.type} />
          <span className={`tag tag-${ev.status === "withdrawn" ? "denied" : ev.status}`}>{ev.status.toUpperCase()}</span>
          <h2 id="rec-title" className="h2" style={{ margin: 0 }}>{eventTitle(ev).toUpperCase()}</h2>
        </span>
        {link && ev.status !== "withdrawn" && <a className="btn btn-sm" href={link} target="_blank" rel="noreferrer">OPEN IN DISCORD</a>}
      </div>
      <dl className="facts">
        <dt>DATE</dt><dd>{nice(ev.event_date)}</dd>
        <dt>HOST PLATOON</dt><dd>{ev.host_platoon || "None"}</dd>
        <dt>LOGGED BY</dt><dd>{ev.source === "discord" ? `${ev.discord_author_name || "Unknown"} (Discord)` : ev.expand?.created_by?.discord_name || ev.expand?.created_by?.username || "Site"}</dd>
        {ev.status !== "withdrawn" && <><dt>{ev.status === "approved" ? "APPROVED BY" : ev.status === "retracted" ? "RETRACTED BY" : "DENIED BY"}</dt><dd>{reviewer(ev)} · {stamp(ev.reviewed_at)}</dd></>}
        {ev.review_note && <><dt>{ev.status === "denied" || ev.status === "retracted" ? "REASON" : "NOTE"}</dt><dd>{ev.review_note}</dd></>}
        {ev.status === "retracted" && <><dt>POINTS</dt><dd>Taken back when it was retracted</dd></>}
        {ev.status === "approved" && <><dt>POINTS GIVEN</dt><dd>{given}</dd></>}
      </dl>
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 480 }}>
          <thead><tr><th>POINT</th><th>AS LOGGED</th><th>ROSTER MEMBER</th><th>ROLE</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="pts">{r.award_point ? (ev.status === "approved" ? "+1" : "✓") : "—"}</td>
                <td>{r.name || "—"}</td>
                <td style={{ fontWeight: 700, color: "var(--text-strong)" }}>{r.expand?.member?.display_name || "Not matched"}</td>
                <td>{(ROLES.find(([v]) => v === r.role) || [, "Attendee"])[1]}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="mono" style={{ color: "var(--text-dim)" }}>Nobody listed.</td></tr>}
          </tbody>
        </table>
      </div>
      {ev.raw_text && (
        <details>
          <summary className="mono" style={{ cursor: "pointer", fontSize: 12, color: "var(--label)" }}>DISCORD POST AS REVIEWED</summary>
          <pre className="raw" style={{ marginTop: 8 }}>{ev.raw_text}</pre>
        </details>
      )}
      {me.perms.can_manage_logs && ev.status !== "withdrawn" && <ManageLog ev={ev} onReopened={onReopened} onChanged={onChanged} />}
      <Activity eventId={ev.id} refreshKey={0} />
    </section>
  );
}

// Unit Leader tools on a reviewed log: reopen it to edit, or retract it.
// Retracting keeps the log on record but takes back its points.
function ManageLog({ ev, onReopened, onChanged }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = async (what) => {
    setBusy(true); setError("");
    try {
      const body = what === "retract" ? { reason } : {};
      const r = await pb.send(`/api/orbat/events/${ev.id}/${what}`, { method: "POST", body });
      const pts = r.pointsRemoved ? ` ${r.pointsRemoved} point${r.pointsRemoved === 1 ? "" : "s"} taken back` : "";
      if (what === "reopen") onReopened?.(ev.id, `${eventTitle(ev)} is back in the queue to edit.${pts ? pts + " until it's approved again." : ""}`);
      else onChanged?.();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  const reopen = () => {
    const note = ev.status === "approved" ? " Its points come off until you approve it again." : "";
    if (window.confirm(`Reopen ${eventTitle(ev)} to edit it? It goes back in the pending queue.${note}`)) call("reopen");
  };
  const retract = (e) => {
    e.preventDefault();
    if (reason.trim().length < 3) { setError("Give a reason for retracting it."); return; }
    if (window.confirm(`Retract ${eventTitle(ev)}? Any points it gave are taken back. The log stays on record as retracted.`)) call("retract");
  };
  return (
    <div className="admin-zone stack" style={{ padding: 12, gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 8 }}><span className="admin-tag">UNIT LEADER</span><span className="eyebrow">CORRECT THIS LOG</span></span>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-admin" disabled={busy} onClick={reopen}>{ev.status === "retracted" ? "REOPEN" : "EDIT"}</button>
          {ev.status !== "retracted" && <button type="button" className="btn btn-sm btn-danger" disabled={busy} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "CANCEL" : "RETRACT"}</button>}
        </span>
      </div>
      {open && (
        <form onSubmit={retract} className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 260px" }}>REASON FOR RETRACTING
            <input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Kept with the log, e.g. logged twice" autoFocus />
          </label>
          <button type="submit" className="btn btn-danger" disabled={busy}>RETRACT LOG</button>
        </form>
      )}
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}

// Every audit entry across the site, newest first.
function SiteLog({ onOpen }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const KINDS = { "": "Everything", reviews: "Approvals and denials", edits: "Edits", after: "Changes after review", points: "Points adjustments", roster: "Registrations and edits", codex: "Codex edits" };
  const kindFilter = {
    reviews: "(action = 'approved' || action = 'denied')",
    edits: "(action = 'post_edited' || action = 'details_changed' || action = 'date_confirmed' || action ~ 'attendee_')",
    after: "(action = 'post_edited_after_review' || action = 'post_deleted_after_review')",
    points: "action = 'points_adjusted'",
    roster: "action ~ 'member_'",
    codex: "action ~ 'codex_'",
  };
  const load = async (p) => {
    const parts = [];
    if (kind) parts.push(kindFilter[kind]);
    if (q.trim()) parts.push(pb.filter("(actor_name ~ {:q} || event_title ~ {:q} || detail ~ {:q})", { q: q.trim() }));
    try {
      const r = await pb.collection("audit_log").getList(p, 50, { filter: parts.join(" && "), sort: "-created" });
      setItems((cur) => (p === 1 ? r.items : [...cur, ...r.items]));
      setPage(p);
      setMore(r.page < r.totalPages);
    } catch (err) { setError(errorMessage(err)); }
  };
  useEffect(() => { const t = setTimeout(() => load(1), 200); return () => clearTimeout(t); }, [kind, q]);
  return (
    <section className="panel stack">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 220px" }}>SEARCH
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who, which log, or what…" />
        </label>
        <label className="field" style={{ flex: "0 1 220px" }}>SHOW
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <ol className="timeline">{items.map((a) => <AuditRow key={a.id} a={a} showEvent onOpen={onOpen} />)}</ol>
      {items.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Nothing recorded{q || kind ? " that matches" : " yet"}.</p>}
      {more && <button type="button" className="btn btn-sm" onClick={() => load(page + 1)}>LOAD MORE</button>}
    </section>
  );
}
