import { Fragment, useEffect, useMemo, useState } from "react";
import { pb, errorMessage } from "../pb.js";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Monday of this week, UK style, as YYYY-MM-DD
function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
const nice = (iso) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");
const short = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

// how a point was earned
export const KINDS = [
  { key: "billeted", label: "BILLETED OP", short: "OP", cls: "k-billeted", help: "Operation with their own platoon" },
  { key: "fillIn", label: "FILL-IN OP", short: "FILL", cls: "k-fill", help: "Filled in on another platoon's operation" },
  { key: "training", label: "TRAINING", short: "TRN", cls: "k-training", help: "Training" },
  { key: "adjustment", label: "OTHER", short: "ADJ", cls: "k-adjust", help: "Manual adjustments and starting points" },
];
const KIND_TAG = { billeted: KINDS[0], fill_in: KINDS[1], training: KINDS[2], adjustment: KINDS[3] };

function remember(key, value) {
  try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch { /* private window */ }
  return null;
}

// Leaderboard by campaign, and the rolling calendar. Open to everyone; staff can adjust.
export default function Points({ me }) {
  const [view, setViewState] = useState(() => remember("points-view") || "board");
  const setView = (v) => { setViewState(v); remember("points-view", v); if (v === "board") load(); };
  const [campaigns, setCampaigns] = useState([]);
  const [data, setData] = useState({ rows: [] });
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const canAdjust = !!me && (me.perms.can_points || me.perms.is_full);

  const load = async () => {
    try {
      const [c, d] = await Promise.all([
        pb.send("/api/orbat/campaigns", { method: "GET" }),
        pb.send(`/api/orbat/points/leaderboard?since=${weekStart()}`, { method: "GET" }),
      ]);
      setCampaigns(c.items);
      setData(d);
      setTick((t) => t + 1);
    } catch (err) { setError(errorMessage(err)); }
  };
  useEffect(() => { load(); }, []);

  const previous = campaigns.filter((c) => !c.current);
  const mine = me ? data.rows.find((r) => me.discordId && r.discordId === me.discordId) : null;

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">1 POINT PER TRAINING OR OPERATION ATTENDED</span>
          <h1 className="h1">POINTS</h1>
        </div>
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Points view">
          {[["board", "LEADERBOARD"], ["calendar", "CALENDAR"]].map(([v, l]) => (
            <button key={v} type="button" className={`btn btn-sm${view === v ? " btn-primary" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </section>

      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}

      {view === "calendar" && <Calendar />}

      {view === "board" && (
        <>
          {mine && (
            <section className="row" aria-label="Your points">
              <div className="stat"><span className="eyebrow">THIS CAMPAIGN</span><span className="stat-num">{mine.total}</span></div>
              <div className="stat"><span className="eyebrow">THIS WEEK</span><span className="stat-num">{mine.recent}</span></div>
              <div className="stat"><span className="eyebrow">ALL TIME</span><span className="stat-num">{mine.allTime}</span></div>
            </section>
          )}
          {canAdjust && <Adjust members={data.rows} onDone={load} />}
          {canAdjust && <CampaignAdmin current={data.campaign} onDone={load} />}

          <section className="stack" style={{ gap: 8 }}>
            <div className="stack" style={{ gap: 0 }}>
              <span className="eyebrow">CURRENT CAMPAIGN{data.campaign && data.campaign.startsOn > "2000-01-01" ? ` · SINCE ${nice(data.campaign.startsOn).toUpperCase()}` : ""}</span>
              <h2 className="h2" style={{ fontSize: 18, margin: 0 }}>{data.campaign ? data.campaign.name.toUpperCase() : "ALL POINTS"}</h2>
            </div>
            <Board rows={data.rows} me={me} mine={mine} showWeek />
          </section>

          <Previous list={previous} me={me} key={tick} />
        </>
      )}
    </>
  );
}

// one campaign's leaderboard
function Board({ rows, me, mine, showWeek, hideEmpty }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState("");
  const [history, setHistory] = useState({});
  const ranked = useMemo(() => rows.filter((r) => !hideEmpty || r.total !== 0).map((r, i) => ({ ...r, rank: i + 1 })), [rows, hideEmpty]);
  const shown = ranked.filter((r) => !q || `${r.name} ${r.platoon}`.toLowerCase().includes(q.toLowerCase()));
  const cols = 5 + KINDS.length - (showWeek ? 0 : 1);

  const toggle = async (id) => {
    if (!me) return; // history is for signed-in staff
    if (open === id) { setOpen(""); return; }
    setOpen(id);
    try {
      const items = await pb.collection("points").getFullList({ filter: pb.filter("member = {:m}", { m: id }), sort: "-earned_at,-created" });
      setHistory((h) => ({ ...h, [id]: items }));
    } catch { setHistory((h) => ({ ...h, [id]: [] })); }
  };

  return (
    <section className="panel stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "flex-end", alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "0 1 260px" }}>SEARCH
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or platoon…" />
        </label>
      </div>
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>#</th><th>MEMBER</th><th>PLATOON</th>
              {KINDS.map((k) => <th key={k.key} title={k.help}><span className={`kdot ${k.cls}`} />{k.label}</th>)}
              {showWeek && <th>THIS WEEK</th>}
              <th>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.id}>
                <tr style={{ cursor: me ? "pointer" : "default" }} onClick={() => toggle(r.id)} aria-expanded={me ? open === r.id : undefined}>
                  <td className="mono">{r.rank}</td>
                  <td style={{ fontWeight: 700, color: "var(--text-strong)" }}>
                    {me ? <button type="button" onClick={(e) => { e.stopPropagation(); toggle(r.id); }} style={{ all: "unset", cursor: "pointer" }}>{r.name}</button> : r.name}
                    {r.id === mine?.id && <span className="badge badge-on" style={{ marginLeft: 8 }}>YOU</span>}
                  </td>
                  <td>{r.platoon || "—"}</td>
                  {KINDS.map((k) => <td key={k.key} className="mono">{r[k.key] || <span className="dim">·</span>}</td>)}
                  {showWeek && <td className="pts">{r.recent}</td>}
                  <td className="pts">{r.total}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={cols} style={{ background: "var(--panel-deep)" }}><History items={history[r.id]} /></td></tr>
                )}
              </Fragment>
            ))}
            {shown.length === 0 && <tr><td colSpan={cols} className="mono" style={{ color: "var(--text-dim)" }}>{hideEmpty ? "No points in this campaign." : "No troopers yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="row legend" style={{ gap: 12 }}>
      {KINDS.map((k) => <span key={k.key} title={k.help}><span className={`kdot ${k.cls}`} />{k.label}</span>)}
    </div>
  );
}

// earlier campaigns, collapsed until asked for
function Previous({ list, me }) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState({});
  const [boards, setBoards] = useState({});
  if (!list.length) return null;
  const toggle = async (c) => {
    setOpen((o) => ({ ...o, [c.id]: !o[c.id] }));
    if (boards[c.id]) return;
    try {
      const d = await pb.send(`/api/orbat/points/leaderboard?campaign=${encodeURIComponent(c.id)}&since=${weekStart()}`, { method: "GET" });
      setBoards((b) => ({ ...b, [c.id]: d.rows }));
    } catch { setBoards((b) => ({ ...b, [c.id]: [] })); }
  };
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div>
        <button type="button" className="btn" aria-expanded={shown} onClick={() => setShown((s) => !s)}>
          {shown ? "HIDE PREVIOUS CAMPAIGNS" : `PREVIOUS CAMPAIGNS · ${list.length}`}
        </button>
      </div>
      {shown && list.map((c) => (
        <div key={c.id} className="stack" style={{ gap: 6 }}>
          <button type="button" className="campaign-row" aria-expanded={!!open[c.id]} onClick={() => toggle(c)}>
            <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{c.name}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--label)" }}>{c.startsOn > "2000-01-01" ? nice(c.startsOn) : "Start"} to {nice(c.endsOn)}</span>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 12 }}>{open[c.id] ? "HIDE" : "SHOW"}</span>
          </button>
          {open[c.id] && (boards[c.id] ? <Board rows={boards[c.id]} me={me} hideEmpty /> : <p className="mono" style={{ margin: 0, fontSize: 12 }}>Loading…</p>)}
        </div>
      ))}
    </section>
  );
}

// ── rolling calendar: last week, this week and 6 ahead ──────────────────────
function Calendar() {
  const [cal, setCal] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    pb.send(`/api/orbat/points/calendar?today=${ymd(new Date())}`, { method: "GET" }).then(setCal).catch((err) => setError(errorMessage(err)));
  }, []);
  if (error) return <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>;
  if (!cal) return <p className="mono" style={{ margin: 0, fontSize: 12 }}>Loading…</p>;
  const people = cal.people.filter((p) => !q || `${p.number}-${p.callsign} ${p.rank} ${p.group}`.toLowerCase().includes(q.toLowerCase()));
  const groups = cal.groups.filter((g) => people.some((p) => p.group === g));
  return (
    <section className="panel stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">WEEKS START MONDAY · {short(cal.weeks[0]).toUpperCase()} TO {short(cal.weeks[cal.weeks.length - 1]).toUpperCase()}</span>
          <Legend />
        </div>
        <label className="field" style={{ flex: "0 1 260px" }}>SEARCH
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number or unit…" />
        </label>
      </div>
      <div className="table-wrap">
        <table className="data cal" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th className="cal-who">TROOPER</th>
              {cal.weeks.map((w) => (
                <th key={w} className={w === cal.thisWeek ? "cal-now" : w > cal.thisWeek ? "cal-ahead" : ""}>
                  <span style={{ display: "block" }}>{w === cal.thisWeek ? "THIS WEEK" : w < cal.thisWeek ? "LAST WEEK" : "W/C"}</span>
                  <span className="mono" style={{ fontSize: 11 }}>{short(w).toUpperCase()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="group-row"><td colSpan={cal.weeks.length + 1}>{g.toUpperCase()} · {people.filter((p) => p.group === g).length}</td></tr>
                {people.filter((p) => p.group === g).map((p) => (
                  <tr key={p.id}>
                    <td className="cal-who">
                      <span className="rank-chip" style={{ marginRight: 8 }}>{p.rank}</span>
                      <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{p.number ? `${p.number}-${p.callsign}` : p.callsign}</span>
                    </td>
                    {cal.weeks.map((w) => <Cell key={w} cell={p.weeks[w]} now={w === cal.thisWeek} ahead={w > cal.thisWeek} />)}
                  </tr>
                ))}
              </Fragment>
            ))}
            {groups.length === 0 && <tr><td colSpan={cal.weeks.length + 1} className="mono" style={{ color: "var(--text-dim)" }}>No registered troopers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ cell, now, ahead }) {
  const cls = now ? "cal-cell cal-now" : ahead ? "cal-cell cal-ahead" : "cal-cell";
  const parts = cell ? KINDS.filter((k) => cell[k.key]) : [];
  if (!parts.length) return <td className={cls}><span className="dim">·</span></td>;
  const title = parts.map((k) => `${cell[k.key]} ${k.label.toLowerCase()}`).join(", ");
  return (
    <td className={cls} title={title}>
      <span className="cal-pills">
        {parts.map((k) => <span key={k.key} className={`kpill ${k.cls}`}>{cell[k.key]} {k.short}</span>)}
      </span>
    </td>
  );
}

function History({ items }) {
  if (!items) return <p className="mono" style={{ margin: 0, fontSize: 12 }}>Loading…</p>;
  if (!items.length) return <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>No points yet.</p>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
      {items.map((p) => {
        const k = KIND_TAG[p.kind] || (p.category === "manual" ? KINDS[3] : null);
        return (
          <li key={p.id} className="row" style={{ gap: 10, fontSize: 14 }}>
            <span className="mono" style={{ fontSize: 12, minWidth: 96, color: "var(--text-dim)" }}>{nice(p.earned_at || p.created)}</span>
            <span className="pts" style={{ minWidth: 32 }}>{p.amount > 0 ? `+${p.amount}` : p.amount}</span>
            {k && <span className={`kpill ${k.cls}`}>{k.label}</span>}
            {p.carried_over && <span className="kpill k-adjust" title="Counts all-time only">CARRIED OVER</span>}
            <span>{p.reason}</span>
          </li>
        );
      })}
    </ul>
  );
}

// staff: start the next campaign, or rename the current one
function CampaignAdmin({ current, onDone }) {
  const [mode, setMode] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => ymd(new Date()));
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const submit = async (ev) => {
    ev.preventDefault();
    try {
      if (mode === "start") {
        await pb.send("/api/orbat/campaigns/start", { method: "POST", body: { name, startsOn: date } });
        setMsg({ kind: "ok", text: `${name} has started. ${current?.name || "The last campaign"} moved to Previous campaigns.` });
      } else {
        await pb.send(`/api/orbat/campaigns/${current.id}/rename`, { method: "POST", body: { name } });
        setMsg({ kind: "ok", text: `Renamed to ${name}.` });
      }
      setMode(""); setName("");
      onDone();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };
  const open = (m) => { setMode(mode === m ? "" : m); setName(m === "rename" ? current?.name || "" : ""); setMsg({ kind: "", text: "" }); };
  return (
    <section className="panel admin-zone stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 8 }}><span className="admin-tag">ADMIN</span><h2 className="h2" style={{ margin: 0 }}>CAMPAIGNS</h2></span>
        <span className="row" style={{ gap: 6 }}>
          {current && <button type="button" className="btn btn-sm btn-admin" onClick={() => open("rename")}>{mode === "rename" ? "CLOSE" : "RENAME CURRENT"}</button>}
          <button type="button" className="btn btn-sm btn-admin" onClick={() => open("start")}>{mode === "start" ? "CLOSE" : "START NEW CAMPAIGN"}</button>
        </span>
      </div>
      {msg.text && <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
      {mode && (
        <form onSubmit={submit} className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "2 1 240px" }}>{mode === "start" ? "NEW CAMPAIGN NAME" : "NAME"}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Operation Knightfall" />
          </label>
          {mode === "start" && (
            <label className="field" style={{ flex: "0 1 180px" }}>STARTS ON
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
          )}
          <button type="submit" className="btn btn-admin">{mode === "start" ? "START CAMPAIGN" : "SAVE"}</button>
        </form>
      )}
      {mode === "start" && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>{current?.name || "The current campaign"} ends the day before. Points earned from the start date count towards the new campaign.</p>}
    </section>
  );
}

// Searchable member list styled to the theme (the browser's own suggestion list can't be styled).
function MemberPicker({ members, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const q = value.trim().toLowerCase();
  const hits = useMemo(() => members.filter((m) => !q || m.name.toLowerCase().includes(q) || (m.platoon || "").toLowerCase().includes(q)).slice(0, 30), [members, q]);
  const pick = (m) => { onChange(m.name); setOpen(false); };
  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <label className="field combo" style={{ flex: "1 1 200px" }}>MEMBER
      <input className="input" value={value} required autoComplete="off" placeholder="Search name or platoon…"
        role="combobox" aria-expanded={open} aria-controls="points-member-list" aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={key} />
      {open && (
        <div className="combo-list" id="points-member-list" role="listbox">
          {hits.length === 0 && <span className="combo-empty">Nobody matches.</span>}
          {hits.map((m, i) => (
            <button key={m.id} type="button" role="option" aria-selected={i === hi} className={`combo-opt${i === hi ? " on" : ""}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => pick(m)}>
              <span>{m.name}</span><span className="combo-sub">{(m.platoon || "No unit").toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function Adjust({ members, onDone }) {
  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const submit = async (ev) => {
    ev.preventDefault();
    const m = members.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (!m) { setMsg({ kind: "error", text: "Pick a member from the list." }); return; }
    try {
      await pb.send("/api/orbat/points/adjust", { method: "POST", body: { memberId: m.id, amount: Number(amount), reason } });
      setMsg({ kind: "ok", text: `${Number(amount) > 0 ? "+" : ""}${amount} for ${m.name} recorded.` });
      setName(""); setAmount(1); setReason("");
      onDone();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };

  return (
    <section className="panel admin-zone stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 8 }}><span className="admin-tag">ADMIN</span><h2 className="h2" style={{ margin: 0 }}>MANUAL ADJUSTMENT</h2></span>
        <button type="button" className="btn btn-sm btn-admin" onClick={() => setOpenForm((o) => !o)}>{openForm ? "CLOSE" : "ADJUST POINTS"}</button>
      </div>
      {msg.text && <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
      {openForm && (
        <form onSubmit={submit} className="row" style={{ alignItems: "flex-end" }}>
          <MemberPicker members={members} value={name} onChange={setName} />
          <label className="field" style={{ flex: "0 1 110px" }}>AMOUNT
            <input className="input" type="number" min={-100} max={100} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field" style={{ flex: "2 1 260px" }}>REASON
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Recruitment bounty, correction" required />
          </label>
          <button type="submit" className="btn btn-admin">RECORD</button>
        </form>
      )}
    </section>
  );
}
