import { useEffect, useMemo, useState } from "react";
import { pb, errorMessage } from "../pb.js";
import Dialog from "./Dialog.jsx";

// Trooper profiles: qualifications, certifications, a points summary and the
// service record. Open to everyone. Unit Administration can add or take off a
// qualification or certification by hand; most arrive from approved training logs.

const nice = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);
function served(from) {
  if (!from) return "";
  const a = new Date(from + "T00:00:00Z"), b = new Date();
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
  if (m < 1) return "under a month";
  return m < 12 ? `${m} month${m > 1 ? "s" : ""}` : `${Math.floor(m / 12)}y ${m % 12}m`;
}
const RANK_ORDER = ["CR", "CT", "SCT", "VCT", "CLC", "CPL", "CS", "CSS", "CSM", "1SG", "SGM", "BSM", "CL", "CC", "BC"];
const KINDS = [["billeted", "Billeted ops", "var(--holo)"], ["fill_in", "Fill-in ops", "#4f9fe8"], ["training", "Trainings", "#e3c34a"], ["adjustment", "Other", "#84a893"]];
const KIND_TAG = { billeted: "OP", fill_in: "FILL", training: "TRN", adjustment: "ADJ" };

// the catalog is the same for every profile; load it once
let catalogCache = null;
export function loadCatalog() {
  if (!catalogCache) catalogCache = pb.send("/api/orbat/awards/catalog", { method: "GET" }).catch((e) => { catalogCache = null; throw e; });
  return catalogCache;
}

export default function Troopers({ me, initialId }) {
  const [dir, setDir] = useState([]);
  const [q, setQ] = useState("");
  const [id, setId] = useState(initialId || "");
  const [error, setError] = useState("");
  useEffect(() => {
    pb.send("/api/orbat/public/orbat", { method: "GET" })
      .then((d) => setDir(d.members.filter((m) => m.registered)))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => { if (initialId) setId(initialId); }, [initialId]);

  const term = q.trim().toLowerCase();
  const serving = dir.filter((m) => m.status !== "discharged");
  const hits = (term ? dir : serving)
    .filter((m) => !term || `${m.display_name} ${m.platoon} ${m.billet}`.toLowerCase().includes(term))
    .sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank) || String(a.service_number).localeCompare(String(b.service_number)));
  const shown = term ? hits.slice(0, 40) : hits.slice(0, 24);

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">SERVICE RECORDS · OPEN TO EVERYONE</span>
          <h1 className="h1">TROOPERS</h1>
        </div>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>Callsigns in ALL TROOPERS open the same profile.</span>
      </section>
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}

      <section className="panel stack" aria-label="Find a trooper">
        <div className="tp-finder">
          <label className="field">FIND A TROOPER
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Callsign, number or platoon" autoComplete="off" />
          </label>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)", paddingBottom: 10 }}>
            {term ? `${hits.length} found${hits.length > shown.length ? `, showing ${shown.length}` : ""}` : `${serving.length} serving${serving.length > shown.length ? ` · type to search` : ""}`}
          </span>
        </div>
        <div className="tp-hits">
          {shown.map((m) => (
            <button key={m.id} type="button" className="tp-hit" aria-current={m.id === id ? "true" : undefined} onClick={() => setId(m.id)}>
              <span className="rank-chip">{m.rank}</span>{m.service_number} "{m.callsign}"
              <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{m.status === "discharged" ? "Discharged" : m.platoon || "No unit"}</span>
            </button>
          ))}
          {dir.length > 0 && shown.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>No trooper matches.</p>}
        </div>
      </section>

      {id ? <Profile key={id} id={id} me={me} /> : (
        <section className="panel"><p className="mono" style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Pick a trooper to open their profile.</p></section>
      )}
    </>
  );
}

function Profile({ id, me }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [dialog, setDialog] = useState(null); // { add: "qual" | "cert" } | { revoke: item }
  const load = () => pb.send(`/api/orbat/troopers/${id}`, { method: "GET" }).then(setD).catch((err) => setError(errorMessage(err)));
  useEffect(() => { load(); }, [id]);
  const [cat, setCat] = useState(null);
  useEffect(() => { loadCatalog().then(setCat).catch(() => {}); }, []);

  if (error) return <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>;
  if (!d || !cat) return <section className="panel"><p className="mono" style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Loading profile…</p></section>;

  const t = d.member;
  const staff = !!me && d.canManage;
  const held = Object.fromEntries(d.quals.map((x) => [x.key, x]));
  const p = d.points;
  const total = KINDS.reduce((n, [k]) => n + Math.max(0, p.kinds[k] || 0), 0) || 1;
  const done = (text) => { setDialog(null); setMsg(text); load(); };

  return (
    <>
      {msg && <p className="notice notice-ok" role="status" style={{ margin: 0 }}>{msg}</p>}
      {staff && (
        <section className="panel admin-zone row" style={{ justifyContent: "space-between" }}>
          <span className="row" style={{ gap: 8 }}><span className="admin-tag">SERVICE RECORD</span><span className="eyebrow">UNIT ADMINISTRATION</span></span>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-admin" onClick={() => setDialog({ add: "qual" })}>ADD QUALIFICATION</button>
            <button type="button" className="btn btn-admin" onClick={() => setDialog({ add: "cert" })}>ADD CERTIFICATION</button>
          </span>
        </section>
      )}

      <section className="panel tp-ident" aria-labelledby="tp-name">
        <div className="tp-insignia" aria-hidden="true"><b>{t.rank}</b></div>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{(t.platoon || "No unit").toUpperCase()}{t.platoon && !/Command|Company|Wing|Navy/.test(t.platoon) ? " PLATOON" : ""}</span>
          <h2 className="tp-name" id="tp-name">{t.name}</h2>
          <div className="tp-facts">
            <span><b>BILLET</b>{t.billet || "Holding"}</span>
            <span><b>JOINED</b>{nice(t.joined)} · {served(t.joined)}</span>
            <span><b>RANK SINCE</b>{nice(t.rankSince)}</span>
          </div>
        </div>
        <div className="tp-side"><span className={`tag tag-st-${t.status}`}>{(t.statusLabel || "").toUpperCase()}</span></div>
      </section>

      <section className="tp-summary" aria-label="At a glance">
        <div className="tp-stat"><span className="k">THIS CAMPAIGN</span><b>{p.total}</b><span className="s">{p.campaign ? `#${p.place} of ${p.of} · ${p.campaign}` : "No campaign running"}</span></div>
        <div className="tp-stat"><span className="k">ALL TIME</span><b>{p.allTime}</b><span className="s">points since joining</span></div>
        <div className="tp-stat"><span className="k">QUALIFICATIONS</span><b>{d.quals.length}<span className="of"> / {cat.quals.length}</span></b><span className="s">combat roles</span></div>
        <div className="tp-stat"><span className="k">CERTIFICATIONS</span><b>{d.certs.length}</b><span className="s">courses and roles</span></div>
      </section>

      <section className="panel" aria-labelledby="tp-q">
        <div className="tp-head"><h2 className="h2" id="tp-q">QUALIFICATIONS</h2><span className="mono tp-note">Lit means held. Rifleman comes with GENTAC, along with the CT promotion.</span></div>
        <div className="tp-qboard">
          {cat.quals.map((x) => {
            const h = held[x.key];
            return (
              <div key={x.key} className={`tp-qb${h ? " on" : ""}`} title={h ? `${x.name}: ${nice(h.on)}${h.instructor ? `, instructor ${h.instructor}` : ""}` : `${x.name}: not held`}>
                <span className="ab">{x.code}</span><span className="nm">{x.name}</span>
                <span className="dt">{h ? nice(h.on).toUpperCase() : "NOT HELD"}</span>
                {staff && h && <button type="button" className="btn btn-sm tp-revoke" onClick={() => setDialog({ revoke: h })}>REVOKE</button>}
              </div>
            );
          })}
        </div>
        {d.quals.length > 0 && (
          <div className="stack" style={{ gap: 0, marginTop: 10 }}>
            {d.quals.slice().sort((a, b) => (a.on < b.on ? 1 : -1)).map((h) => (
              <div key={h.key} className="tp-item"><b>{h.title}</b><span className="mono tp-date">{nice(h.on)}</span>
                <span className="meta">{[h.instructor && `Instructor ${h.instructor}`, h.from === "log" ? h.eventLabel || "From a training log" : `Added by hand${h.addedBy ? ` by ${h.addedBy}` : ""}`].filter(Boolean).join(" · ")}</span></div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="tp-c">
        <div className="tp-head"><h2 className="h2" id="tp-c">CERTIFICATIONS</h2><span className="mono tp-note">They don't expire.</span></div>
        <div className="tp-split">
          {d.certs.map((c) => {
            const steps = (cat.certs.find((x) => x.key === c.key) || {}).steps;
            return (
              <div key={c.key} className="tp-item">
                <b>{c.title}</b>
                {staff ? <button type="button" className="btn btn-sm tp-revoke" onClick={() => setDialog({ revoke: c })}>WITHDRAW</button> : <span />}
                {steps && (
                  <div className="tp-ladder" aria-label={`Step ${c.level + 1} of ${steps.length}`}>
                    {steps.map((s, j) => <span key={s} className={j <= c.level ? "on" : ""}>{s.replace(/ Zeus$| Leadership$/, "").toUpperCase()}</span>)}
                  </div>
                )}
                <span className="meta">{[nice(c.on), c.instructor && `Instructor ${c.instructor}`, c.from === "log" ? c.eventLabel || "From a training log" : `Added by hand${c.addedBy ? ` by ${c.addedBy}` : ""}`].filter(Boolean).join(" · ")}</span>
              </div>
            );
          })}
          {d.certs.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>None yet.</p>}
        </div>
      </section>

      <section className="panel" aria-labelledby="tp-p">
        <div className="tp-head"><h2 className="h2" id="tp-p">POINTS</h2><span className="mono tp-note">{p.campaign ? `${p.campaign} · ` : ""}{p.week} this week</span></div>
        <div className="tp-pts">
          <div className="stack">
            <span className="eyebrow">HOW THEY EARNED {p.allTime} POINTS</span>
            <div className="tp-kbar" role="img" aria-label={KINDS.map(([k, l]) => `${l} ${p.kinds[k] || 0}`).join(", ")}>
              {KINDS.map(([k, , c]) => (p.kinds[k] > 0 ? <span key={k} style={{ width: `${(p.kinds[k] / total) * 100}%`, background: c }} /> : null))}
            </div>
            <div className="tp-klegend">{KINDS.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l} <b className="mono">{p.kinds[k] || 0}</b></span>)}</div>
            <span className="eyebrow" style={{ marginTop: 8 }}>LAST 8 WEEKS</span>
            <Spark weeks={p.weeks} />
          </div>
          <div className="stack" style={{ gap: 0 }}>
            <span className="eyebrow" style={{ marginBottom: 6 }}>LAST ATTENDED</span>
            {p.attended.map((a, i) => <div key={i} className="tp-att"><span>{a.title}</span><span className="mono">{nice(a.on).slice(0, 6)} · {KIND_TAG[a.kind] || "—"}</span></div>)}
            {p.attended.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>No logs yet.</p>}
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="tp-r">
        <div className="tp-head"><h2 className="h2" id="tp-r">SERVICE RECORD</h2><span className="mono tp-note">Newest first. Promotions, moves, qualifications and certifications.</span></div>
        <ol className="tp-timeline">
          {d.record.map((r, i) => (
            <li key={i} className={`k-${r.kind}`}>
              <div className="when">{nice(r.on).toUpperCase()}</div>
              <div className="what">{r.text}</div>
              {r.by && <div className="by">{/^(from|automatic)/.test(r.by) ? r.by : `by ${r.by}`}</div>}
            </li>
          ))}
          {d.record.length === 0 && <li><div className="what">Nothing yet.</div></li>}
        </ol>
      </section>

      {dialog?.add && <AddDialog kind={dialog.add} trooper={t} data={d} cat={cat} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.revoke && <RevokeDialog item={dialog.revoke} trooper={t} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function Spark({ weeks }) {
  const W = 320, H = 96, bw = 26, gap = (W - 20) / weeks.length;
  const max = Math.max(4, ...weeks);
  return (
    <div className="tp-spark">
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={`Points per week, last 8 weeks: ${weeks.join(", ")}`}>
        {[0, max / 2, max].map((v) => { const y = H - (v / max) * (H - 16); return <line key={v} x1="10" x2={W - 10} y1={y} y2={y} stroke={v ? "#12291b" : "#2b5a40"} />; })}
        {weeks.map((v, i) => {
          const x = 10 + i * gap + (gap - bw) / 2, h = (v / max) * (H - 16), last = i === weeks.length - 1;
          return (
            <g key={i}>
              <rect x={x} y={H - h} width={bw} height={h} fill={last ? "#a8f0c8" : "#5fd38a"} fillOpacity={last ? 1 : 0.7} />
              {v ? <text x={x + bw / 2} y={H - h - 4} textAnchor="middle" fontSize="11" fill={last ? "#a8f0c8" : "#84a893"} fontFamily="Share Tech Mono, monospace">{v}</text> : null}
              <text x={x + bw / 2} y={H + 15} textAnchor="middle" fontSize="10" fill="#84a893" fontFamily="Share Tech Mono, monospace">{last ? "NOW" : `-${weeks.length - 1 - i}W`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AddDialog({ kind, trooper, data, cat, onClose, onDone }) {
  const list = kind === "qual" ? cat.quals : cat.certs;
  const levelOf = useMemo(() => Object.fromEntries((kind === "qual" ? data.quals : data.certs).map((x) => [x.key, x.level])), [data, kind]);
  // what can still be added: anything not held, or a ladder with a higher step left
  const open = list.filter((x) => levelOf[x.key] === undefined || (x.steps && levelOf[x.key] < x.steps.length - 1));
  const [key, setKey] = useState(open[0]?.key || "");
  const cur = list.find((x) => x.key === key);
  const nextStep = cur?.steps ? (levelOf[key] === undefined ? 0 : levelOf[key] + 1) : 0;
  const [level, setLevel] = useState(nextStep);
  useEffect(() => { setLevel(nextStep); }, [key]);
  const [date, setDate] = useState(today());
  const [instructor, setInstructor] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const label = (x) => (x.steps ? (x.code ? `${x.name} (${x.code})` : x.name) + (levelOf[x.key] !== undefined ? ": move up a step" : "") : x.code ? `${x.name} (${x.code})` : x.name);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await pb.send(`/api/orbat/troopers/${trooper.id}/awards`, { method: "POST", body: { kind, key, level, date, instructor } });
      onDone(`${r.award} added to ${r.name}.`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  const title = kind === "qual" ? "ADD QUALIFICATION" : "ADD CERTIFICATION";
  if (!open.length) return <Dialog title={title} onClose={onClose}><p style={{ margin: 0 }}>{trooper.callsign} already holds every {kind === "qual" ? "qualification" : "certification"}.</p></Dialog>;
  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <p style={{ margin: 0 }}>To <b style={{ color: "var(--text-strong)" }}>{trooper.name}</b></p>
        <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Most arrive by themselves when a training log is approved. Use this for training run before the site, or outside Discord.</p>
        {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <label className="field">{kind === "qual" ? "QUALIFICATION" : "CERTIFICATION"}
          <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>{open.map((x) => <option key={x.key} value={x.key}>{label(x)}</option>)}</select>
        </label>
        {cur?.steps && (
          <label className="field">STEP
            <select className="input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {cur.steps.map((s, j) => <option key={s} value={j} disabled={levelOf[key] !== undefined && j <= levelOf[key]}>{s}</option>)}
            </select>
          </label>
        )}
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 160px" }}>DATE<input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="field" style={{ flex: "2 1 200px" }}>INSTRUCTOR (OPTIONAL)<input className="input" value={instructor} maxLength={100} onChange={(e) => setInstructor(e.target.value)} placeholder="Callsign" /></label>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>CANCEL</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !key}>ADD</button>
        </div>
      </form>
    </Dialog>
  );
}

function RevokeDialog({ item, trooper, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cert = item.kind === "cert";
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await pb.send(`/api/orbat/troopers/${trooper.id}/awards/revoke`, { method: "POST", body: { kind: item.kind, key: item.key, note } });
      onDone(`${r.award} ${cert ? "withdrawn" : "revoked"}. It no longer shows on ${r.name}'s profile.`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return (
    <Dialog title={cert ? "WITHDRAW CERTIFICATION" : "REVOKE QUALIFICATION"} onClose={onClose}>
      <p style={{ margin: 0 }}><b style={{ color: "var(--text-strong)" }}>{item.title}</b> · {trooper.name}</p>
      <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>It disappears from their profile and service record, with nothing shown in its place{item.key && cert && item.level > 0 ? ", including the earlier steps" : ""}. Adding it again later brings it back. Your note is kept only in the staff Site Log.</p>
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <label className="field">NOTE FOR THE SITE LOG (OPTIONAL)
        <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added to the wrong trooper" />
      </label>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>CANCEL</button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={go}>{cert ? "WITHDRAW" : "REVOKE"}</button>
      </div>
    </Dialog>
  );
}
