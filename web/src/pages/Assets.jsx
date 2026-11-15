import { Fragment, useEffect, useMemo, useState } from "react";
import { pb, errorMessage } from "../pb.js";
import Dialog from "./Dialog.jsx";

// Assets: what each unit holds in a campaign and how it changed. Open to
// everyone; the Assets permission logs changes, the Unit Leader approves new types.

const CATS = [["Vehicle", "VEHICLES"], ["Weapon", "WEAPONS"], ["Supply", "SUPPLIES"]];
const ICON = {
  Vehicle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 14l3-6h12l3 6v3H3z" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /></svg>,
  Weapon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 12h13l3-2v4l-3-2" /><path d="M7 12v4M11 12v3" /></svg>,
  Supply: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></svg>,
};
const DAY = 86400000;
const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const monday = (s) => addDays(s, -((new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7));
const nice = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const sign = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");
const short = (name) => name.replace(/ (Platoon|Command)$/, "");
const imgUrl = (t) => (t.image ? `/api/files/asset_types/${t.id}/${t.image}?thumb=128x128f` : "");

function remember(key, value) {
  try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch { /* private window */ }
  return null;
}

function Icon({ t }) {
  return <span className="as-ic" title={t.image ? undefined : "No image yet"}>{t.image ? <img src={imgUrl(t)} alt="" /> : ICON[t.category]}</span>;
}

export default function Assets({ me }) {
  const [campaignId, setCampaignId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [view, setViewState] = useState(() => remember("assets-view") || "overview");
  const setView = (v) => { setViewState(v); remember("assets-view", v); };
  const [unit, setUnit] = useState(() => remember("assets-unit") || "");
  const pickUnit = (k) => { setUnit(k); remember("assets-unit", k); };
  const [dialog, setDialog] = useState(null);

  const load = async (cid = campaignId) => {
    try {
      setData(await pb.send(`/api/orbat/assets${cid ? `?campaign=${encodeURIComponent(cid)}` : ""}`, { method: "GET" }));
      setError("");
    } catch (err) { setError(errorMessage(err)); }
  };
  useEffect(() => { load(); }, []);
  const done = (msg) => { setDialog(null); if (msg) setFlash(msg); load(); };

  const calc = useMemo(() => (data ? compute(data) : null), [data]);
  if (!data || !calc) return error ? <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p> : <p className="eyebrow" role="status">Loading assets…</p>;

  const camp = data.campaign;
  const u = data.units.find((x) => x.key === unit) || data.units[1] || data.units[0];
  const staff = data.canLog && camp.current;
  const pending = data.types.filter((t) => t.status === "pending");
  const noStart = camp.current && !camp.assetStart && !data.entries.some((e) => e.isStart && !e.retracted);

  return (
    <div className="assets">
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">VEHICLES, WEAPONS AND SUPPLIES BY UNIT</span>
          <h1 className="h1">ASSETS</h1>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ minWidth: 220 }}>CAMPAIGN
            <select className="input" value={camp.id} onChange={(e) => { setCampaignId(e.target.value); load(e.target.value); }}>
              {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.current ? " (current)" : ""}</option>)}
            </select>
          </label>
          <div className="row" style={{ gap: 6 }} role="group" aria-label="Assets view">
            {[["overview", "OVERVIEW"], ["unit", "UNIT VIEW"], ["log", "LOG"]].map(([v, l]) => (
              <button key={v} type="button" className={`btn btn-sm${view === v ? " btn-primary" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      {flash && (
        <div className="notice notice-ok row" role="status" style={{ margin: 0, justifyContent: "space-between" }}>
          <span>{flash}</span><button type="button" className="btn btn-sm" onClick={() => setFlash("")}>DISMISS</button>
        </div>
      )}

      {(staff || (data.canApprove && pending.length > 0)) && (
        <section className="panel admin-zone row" style={{ justifyContent: "space-between" }}>
          <span className="row"><span className="admin-tag">ASSETS</span><span className="eyebrow">QUARTERMASTER TOOLS</span></span>
          <span className="row">
            {staff && <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "log" })}>LOG CHANGES</button>}
            <button type="button" className="btn btn-admin" onClick={() => setDialog({ kind: "types" })}>ASSET TYPES{pending.length ? ` · ${pending.length} WAITING` : ""}</button>
            {staff && <button type="button" className="btn btn-admin" onClick={() => setDialog({ kind: "supply" })}>STARTING SUPPLY</button>}
          </span>
        </section>
      )}
      {staff && noStart && (
        <p className="notice notice-warn" style={{ margin: 0 }}>
          {camp.name} has no starting supply yet. Use STARTING SUPPLY to apply a preset, carry over the last campaign's counts, or start from zero.
        </p>
      )}

      <section className="as-summary" aria-label="Campaign totals">
        <div className="stat"><span className="eyebrow">HELD NOW</span><span className="stat-num">{calc.heldTotal}</span><span className="s">across {data.units.length} units</span></div>
        <div className="stat"><span className="eyebrow">STARTING SUPPLY</span><span className="stat-num">{calc.startTotal}</span><span className="s">{camp.assetStart || "Not set"}</span></div>
        <div className="stat gain"><span className="eyebrow">GAINED</span><span className="stat-num">{sign(calc.gained)}</span><span className="s">since {nice(camp.startsOn)}</span></div>
        <div className="stat loss"><span className="eyebrow">LOST</span><span className="stat-num">{calc.lost ? sign(-calc.lost) : 0}</span><span className="s">since {nice(camp.startsOn)}</span></div>
      </section>

      {calc.alerts.length > 0 && (
        <section className="as-alerts" aria-label="Alerts">
          {calc.alerts.map((a) => (
            <span key={a.u.key + a.t.id} className={`as-alert${a.n < 0 ? " neg" : ""}`}>
              <span className="mono">{a.n < 0 ? "BELOW ZERO" : "RUN OUT"}</span>{short(a.u.name)} · {a.t.name} · {a.n}
            </span>
          ))}
        </section>
      )}

      {view === "overview" && <Overview data={data} calc={calc} onUnit={(k) => { pickUnit(k); setView("unit"); window.scrollTo({ top: 0 }); }} />}
      {view === "unit" && <UnitView data={data} calc={calc} unit={u} onUnit={pickUnit} />}
      {view === "log" && <LogView data={data} canRetract={data.canLog} onRetract={(e) => setDialog({ kind: "retract", entry: e })} />}

      {dialog?.kind === "log" && <LogDialog data={data} calc={calc} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "retract" && <RetractDialog data={data} entry={dialog.entry} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "types" && <TypesDialog data={data} onClose={() => setDialog(null)} onChanged={() => load()} />}
      {dialog?.kind === "supply" && <SupplyDialog data={data} onClose={() => setDialog(null)} onChanged={() => load()} onDone={done} />}
    </div>
  );
}

// held counts, this week's change, totals and alerts for one campaign
function compute(data) {
  const live = data.entries.filter((e) => !e.retracted);
  const camp = data.campaign;
  const end = camp.endsOn || data.today;
  const thisWeek = monday(end > data.today ? data.today : end);
  const held = {}, week = {}, had = {};
  live.forEach((e) => {
    const k = e.unit + "|" + e.type;
    held[k] = (held[k] || 0) + e.delta;
    if (e.delta > 0) had[k] = true;
    if (!e.isStart && e.date >= thisWeek) week[k] = (week[k] || 0) + e.delta;
  });
  const types = data.types.filter((t) => t.status === "approved");
  const alerts = [];
  types.filter((t) => !t.retired).forEach((t) => t.units.forEach((uk) => {
    const n = held[uk + "|" + t.id] || 0;
    const unit = data.units.find((x) => x.key === uk);
    if (unit && (n < 0 || (n === 0 && had[uk + "|" + t.id]))) alerts.push({ u: unit, t, n });
  }));
  const moves = live.filter((e) => !e.isStart);
  return {
    live, held, week, had, types, alerts, thisWeek,
    heldTotal: live.reduce((s, e) => s + e.delta, 0),
    startTotal: live.filter((e) => e.isStart).reduce((s, e) => s + e.delta, 0),
    gained: moves.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0),
    lost: moves.filter((e) => e.delta < 0).reduce((s, e) => s - e.delta, 0),
  };
}

function Overview({ data, calc, onUnit }) {
  const [cat, setCat] = useState("all");
  const [phoneUnit, setPhoneUnit] = useState(data.units[1]?.key || data.units[0]?.key);
  const cats = CATS.filter(([k]) => cat === "all" || cat === k);
  const shown = (t) => !t.retired || data.units.some((u) => calc.held[u.key + "|" + t.id]);
  const cell = (uk, t) => {
    if (!t.units.includes(uk) && !calc.held[uk + "|" + t.id]) return <td key={uk} className="na" aria-label="Not held by this unit">·</td>;
    const k = uk + "|" + t.id, n = calc.held[k] || 0, d = calc.week[k] || 0;
    const cls = n < 0 ? "neg" : n === 0 && calc.had[k] ? "zero" : n === 0 ? "none" : "";
    return <td key={uk} className={cls}><span className="as-cell"><b>{n}</b><span className={`d ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d ? sign(d) : " "}</span></span></td>;
  };

  const csv = () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Asset", "Category", ...data.units.map((u) => u.name), "Total"].map(q).join(",")];
    calc.types.filter(shown).forEach((t) => {
      const ns = data.units.map((u) => calc.held[u.key + "|" + t.id] || 0);
      lines.push([q(t.name), q(t.category), ...ns, ns.reduce((a, b) => a + b, 0)].join(","));
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
    a.download = `assets-${data.campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="panel stack" aria-label="Assets by unit">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Category">
          {[["all", "ALL"], ...CATS].map(([k, l]) => (
            <button key={k} type="button" className={`btn btn-sm${cat === k ? " btn-primary" : ""}`} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn btn-sm" onClick={csv}>EXPORT CSV</button>
      </div>
      <p className="note as-desk">Small figures are this week's change. Click a unit for its own view. A dot means the unit doesn't hold that asset.</p>
      <div className="table-wrap as-desk">
        <table className="as-matrix">
          <thead>
            <tr>
              <th scope="col" className="asset" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 400, color: "var(--label)", letterSpacing: ".12em" }}>ASSET</th>
              {data.units.map((u) => <th key={u.key} scope="col"><button type="button" style={{ "--uc": u.color || undefined }} onClick={() => onUnit(u.key)}>{short(u.name).toUpperCase()}</button></th>)}
              <th scope="col" className="total">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(([k, label]) => {
              const ts = calc.types.filter((t) => t.category === k && shown(t));
              return (
                <Fragment key={k}>
                  <tr className="cat"><td colSpan={data.units.length + 2}>{label} · {ts.length}</td></tr>
                  {ts.map((t) => {
                    const tot = data.units.reduce((s, u) => s + (calc.held[u.key + "|" + t.id] || 0), 0);
                    const tw = data.units.reduce((s, u) => s + (calc.week[u.key + "|" + t.id] || 0), 0);
                    return (
                      <tr key={t.id}>
                        <th scope="row" className="asset">{t.name}{t.retired ? <span className="dim mono" style={{ fontSize: 11 }}> · RETIRED</span> : ""}</th>
                        {data.units.map((u) => cell(u.key, t))}
                        <td className="total"><span className="as-cell"><b>{tot}</b><span className={`d ${tw > 0 ? "up" : tw < 0 ? "down" : ""}`}>{tw ? sign(tw) : " "}</span></span></td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="as-phone">
        <label className="field">UNIT
          <select className="input" value={phoneUnit} onChange={(e) => setPhoneUnit(e.target.value)}>
            {data.units.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
          </select>
        </label>
        {cats.map(([k, label]) => {
          const ts = calc.types.filter((t) => t.category === k && shown(t) && (t.units.includes(phoneUnit) || calc.held[phoneUnit + "|" + t.id]));
          if (!ts.length) return null;
          return (
            <Fragment key={k}>
              <div className="pl-cat">{label}</div>
              {ts.map((t) => {
                const key = phoneUnit + "|" + t.id, n = calc.held[key] || 0, d = calc.week[key] || 0;
                return (
                  <div key={t.id} className="pl-row">
                    <span className="n">{t.name}</span>
                    <span className="as-cell"><b style={n < 0 ? { color: "var(--red-text)" } : n === 0 && calc.had[key] ? { color: "var(--warn)" } : undefined}>{n}</b><span className={`d ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d ? `${sign(d)} this week` : ""}</span></span>
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function UnitView({ data, calc, unit, onUnit }) {
  const ts = calc.types.filter((t) => (t.units.includes(unit.key) && !t.retired) || calc.held[unit.key + "|" + t.id]);
  const mine = calc.live.filter((e) => e.unit === unit.key && !e.isStart);
  const camp = data.campaign;
  // up to the last 8 weeks of the campaign
  const lastWeek = monday((camp.endsOn && camp.endsOn < data.today) ? camp.endsOn : data.today);
  const firstWeek = monday(camp.startsOn);
  const weeks = [];
  for (let w = lastWeek; w >= firstWeek && weeks.length < 8; w = addDays(w, -7)) weeks.unshift(w);
  const weekNo = (w) => Math.round((Date.parse(w) - Date.parse(firstWeek)) / (7 * DAY)) + 1;
  const inWeek = (e, w) => e.date >= w && e.date < addDays(w, 7);
  const per = weeks.map((w) => ({
    w, g: mine.filter((e) => inWeek(e, w) && e.delta > 0).reduce((s, e) => s + e.delta, 0),
    l: mine.filter((e) => inWeek(e, w) && e.delta < 0).reduce((s, e) => s - e.delta, 0),
  }));
  const top = Math.max(4, ...per.map((p) => Math.max(p.g, p.l)));
  const max = Math.ceil((top * 1.35) / 2) * 2;
  const W = 420, H = 200, mid = 95, bw = 46, gap = (W - 60) / Math.max(1, weeks.length);
  const y = (v) => mid - (v / max) * 75;
  const ticks = [max, Math.round(max / 2), 0, -Math.round(max / 2), -max];
  const label = (w) => { const n = weekNo(w); return n <= 99 ? `WEEK ${n}` : nice(w).toUpperCase(); };

  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const pick = hover || pinned;
  const toggle = (b) => setPinned((p) => (p && p.w === b.w && p.k === b.k ? null : b));
  useEffect(() => { setHover(null); setPinned(null); }, [unit.key]);

  const rows = ts.map((t) => {
    const es = mine.filter((e) => e.type === t.id);
    if (!pick) return { t, g: es.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0), l: es.filter((e) => e.delta < 0).reduce((s, e) => s - e.delta, 0), hit: false };
    const n = es.filter((e) => inWeek(e, pick.w) && (pick.k === "g" ? e.delta > 0 : e.delta < 0)).reduce((s, e) => s + Math.abs(e.delta), 0);
    return { t, g: pick.k === "g" ? n : 0, l: pick.k === "l" ? n : 0, hit: n > 0 };
  });
  const pickTotal = rows.reduce((s, r) => s + r.g + r.l, 0), pickTypes = rows.filter((r) => r.hit).length;

  const bar = (p, i, k) => {
    const n = k === "g" ? p.g : p.l;
    if (!n) return null;
    const x = 50 + i * gap + (gap - bw) / 2 + (k === "l" ? bw / 2 : 0);
    const on = pick && pick.w === p.w && pick.k === k;
    const b = { w: p.w, k };
    return (
      <rect key={k} className={`bar${on ? " on" : ""}`} tabIndex={0} role="button" aria-pressed={!!(pinned && pinned.w === p.w && pinned.k === k)}
        aria-label={`${label(p.w)}: ${n} ${k === "g" ? "gained" : "lost"}. Show which assets.`}
        x={x} y={k === "g" ? y(p.g) : mid} width={bw / 2 - 2} height={k === "g" ? mid - y(p.g) : y(-p.l) - mid} fill={k === "g" ? "#5fd38a" : "#ff9a5c"}
        onMouseEnter={() => setHover(b)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(b)} onBlur={() => setHover(null)}
        onClick={() => toggle(b)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(b); } if (e.key === "Escape") { setPinned(null); e.currentTarget.blur(); } }} />
    );
  };

  return (
    <>
      <section className="panel stack" aria-labelledby="uv">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h2" id="uv">{unit.name.toUpperCase()} · {ts.length} ASSET TYPES</h2>
          <label className="field" style={{ minWidth: 200 }}>UNIT
            <select className="input" value={unit.key} onChange={(e) => onUnit(e.target.value)}>
              {data.units.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </label>
        </div>
        {ts.length ? (
          <div className="as-cards">
            {ts.map((t) => {
              const k = unit.key + "|" + t.id, n = calc.held[k] || 0, d = calc.week[k] || 0;
              return (
                <div key={t.id} className={`as-card${n < 0 ? " neg" : n === 0 && calc.had[k] ? " zero" : ""}`}>
                  <Icon t={t} />
                  <span className="t"><b>{t.name}</b><span>{t.category.toUpperCase()}{d ? <> · <span className={d > 0 ? "up" : "down"}>{sign(d)} this week</span></> : ""}</span></span>
                  <span className="num">{n}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="note">No asset types are assigned to this unit yet.</p>}
      </section>
      <div className="as-split">
        <section className="panel as-chart" aria-labelledby="wc">
          <h2 className="h2" id="wc" style={{ marginBottom: 10 }}>GAINS AND LOSSES BY WEEK</h2>
          {mine.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} className={pick ? "picking" : ""} role="group" aria-label={`Gains and losses by week for ${unit.name}`}>
              {ticks.map((t, i) => (
                <g key={i}>
                  <line x1="40" x2={W - 10} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#2b5a40" : "#12291b"} />
                  <text x="34" y={y(t) + 4} textAnchor="end" fontSize="11" fill="#84a893" fontFamily="Share Tech Mono, monospace">{t > 0 ? "+" + t : t}</text>
                </g>
              ))}
              {per.map((p, i) => {
                const x = 50 + i * gap + (gap - bw) / 2;
                return (
                  <g key={p.w}>
                    {bar(p, i, "g")}{bar(p, i, "l")}
                    {p.g > 0 && <text x={x + bw / 4 - 1} y={y(p.g) - 4} textAnchor="middle" fontSize="11" fill="#5fd38a" fontFamily="Share Tech Mono, monospace">+{p.g}</text>}
                    {p.l > 0 && <text x={x + (3 * bw) / 4 - 1} y={y(-p.l) + 13} textAnchor="middle" fontSize="11" fill="#ff9a5c" fontFamily="Share Tech Mono, monospace">−{p.l}</text>}
                    <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize={weeks.length > 6 ? 9 : 11} fill="#84a893" fontFamily="Share Tech Mono, monospace">{label(p.w)}</text>
                  </g>
                );
              })}
            </svg>
          ) : <p className="note">Nothing logged for this unit yet.</p>}
          <p className="note" style={{ marginTop: 6 }}>Starting supply isn't counted as a gain.</p>
        </section>
        <section className={`panel${pick ? " picking-on" : ""}`} aria-labelledby="wb" style={pick ? { "--hl": pick.k === "g" ? "var(--gain)" : "var(--loss)" } : undefined}>
          <h2 className="h2" id="wb" style={{ marginBottom: 2 }}>WHAT CHANGED</h2>
          <p className="note" aria-live="polite">
            {pick ? `${label(pick.w)} ${pick.k === "g" ? "gains" : "losses"}: ${pickTotal} across ${pickTypes} asset type${pickTypes === 1 ? "" : "s"}.` : "Whole campaign so far. Point at or tap a bar to see that week."}
          </p>
          <div className="bd-head"><span>ASSET</span><span>GAINED</span><span>LOST</span></div>
          {rows.map((r) => (
            <div key={r.t.id} className={`bd-row${r.hit ? " hit" : ""}`}>
              <span className="n">{r.t.name}</span><span className="up">{r.g ? "+" + r.g : "·"}</span><span className="down">{r.l ? "−" + r.l : "·"}</span>
            </div>
          ))}
        </section>
      </div>
      <section className="panel" aria-labelledby="re">
        <h2 className="h2" id="re" style={{ marginBottom: 6 }}>RECENT ENTRIES</h2>
        {data.entries.filter((e) => e.unit === unit.key && !e.isStart).slice(-6).reverse().map((e) => {
          const t = data.types.find((x) => x.id === e.type);
          return (
            <div key={e.id} className="pl-row" style={e.retracted ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
              <span><span className="n">{t ? t.name : "Unknown asset"}</span><br /><span className="note">{nice(e.date)} · {e.reason}</span></span>
              <span className={`mono ${e.delta > 0 ? "up" : "down"}`}>{sign(e.delta)}</span>
            </div>
          );
        })}
        {!data.entries.some((e) => e.unit === unit.key && !e.isStart) && <p className="note">Nothing logged yet.</p>}
      </section>
    </>
  );
}

function LogView({ data, canRetract, onRetract }) {
  const [fu, setFu] = useState("");
  const [ft, setFt] = useState("");
  const [fk, setFk] = useState("");
  const typeName = (id) => data.types.find((t) => t.id === id)?.name || "Unknown asset";
  const unitName = (k) => data.units.find((u) => u.key === k)?.name || k;
  const list = data.entries.filter((e) => (!fu || e.unit === fu) && (!ft || e.type === ft) &&
    (!fk || (fk === "gain" ? e.delta > 0 && !e.isStart : fk === "loss" ? e.delta < 0 : fk === "start" ? e.isStart : e.retracted))).slice().reverse();
  return (
    <section className="panel stack" aria-labelledby="lg">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h2 className="h2" id="lg">EVERY ENTRY · {data.campaign.name.toUpperCase()}</h2>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field">UNIT<select className="input input-sm" value={fu} onChange={(e) => setFu(e.target.value)}><option value="">All units</option>{data.units.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}</select></label>
          <label className="field">ASSET<select className="input input-sm" value={ft} onChange={(e) => setFt(e.target.value)}><option value="">All assets</option>{data.types.filter((t) => t.status === "approved").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="field">SHOW<select className="input input-sm" value={fk} onChange={(e) => setFk(e.target.value)}><option value="">Everything</option><option value="gain">Gains</option><option value="loss">Losses</option><option value="start">Starting supply</option><option value="retracted">Retracted</option></select></label>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 760 }}>
          <thead><tr><th>DATE</th><th>UNIT</th><th>ASSET</th><th>CHANGE</th><th>REASON</th><th>OPERATION</th><th>LOGGED BY</th>{canRetract && <th><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className={e.retracted ? "as-retracted" : ""}>
                <td className="mono">{nice(e.date)}</td>
                <td>{short(unitName(e.unit))}</td>
                <td className="what">{typeName(e.type)}{e.isStart && <span className="dim mono" style={{ fontSize: 11 }}> · START</span>}</td>
                <td className={`ch ${e.delta > 0 ? "up" : "down"}`}>{sign(e.delta)}</td>
                <td>{e.reason}{e.retracted && <div className="as-why">Retracted by {e.retractedBy}: {e.retractReason}</div>}</td>
                <td className="dim">{e.eventLabel || "—"}</td>
                <td className="dim">{e.by}</td>
                {canRetract && <td>{!e.retracted && <button type="button" className="btn btn-sm btn-danger" onClick={() => onRetract(e)}>RETRACT</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="note" style={{ padding: "10px 8px" }}>No entries match.</p>}
      </div>
    </section>
  );
}

// ── staff dialogs ─────────────────────────────────────────────────────────
function LogDialog({ data, calc, onClose, onDone }) {
  const blank = () => ({ unit: "", type: "", kind: "loss", qty: "1" });
  const [lines, setLines] = useState([blank()]);
  const [date, setDate] = useState(data.today);
  const [eventId, setEventId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [below, setBelow] = useState(null);
  const usable = calc.types.filter((t) => !t.retired);
  const set = (i, k, v) => { setBelow(null); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === "unit" && !usable.find((t) => t.id === l.type)?.units.includes(v) ? { type: "" } : {}) } : l))); };

  const send = async (allowNegative) => {
    setErr("");
    const bad = lines.findIndex((l) => !l.unit || !l.type || !(Number(l.qty) >= 1));
    if (bad !== -1) { setErr(`Line ${bad + 1}: pick a unit, an asset and a quantity.`); return; }
    if (reason.trim().length < 3) { setErr("Say why, for example \"Shot down over the LZ\"."); return; }
    setBusy(true);
    try {
      const r = await pb.send("/api/orbat/assets/log", { method: "POST", body: {
        date, eventId, reason, allowNegative,
        lines: lines.map((l) => ({ unit: l.unit, type: l.type, delta: (l.kind === "gain" ? 1 : -1) * Math.floor(Number(l.qty)) })),
      } });
      if (r.needsConfirm) { setBelow(r.below); return; }
      onDone(`Logged ${r.saved} change${r.saved === 1 ? "" : "s"}.`);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog title="LOG CHANGES" onClose={onClose} wide>
      <p className="note">One line per unit and asset. The date, reason and operation apply to every line, so a whole operation's losses go in together.</p>
      {lines.map((l, i) => {
        const opts = usable.filter((t) => !l.unit || t.units.includes(l.unit));
        const now = l.unit && l.type ? calc.held[l.unit + "|" + l.type] || 0 : null;
        return (
          <div key={i} className="as-line">
            <label className="field">UNIT<select className="input" value={l.unit} onChange={(e) => set(i, "unit", e.target.value)} aria-label={`Line ${i + 1} unit`}><option value="">Pick…</option>{data.units.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}</select></label>
            <label className="field">ASSET{now !== null && <span className="dim"> · HOLDS {now}</span>}
              <select className="input" value={l.type} onChange={(e) => set(i, "type", e.target.value)} aria-label={`Line ${i + 1} asset`}>
                <option value="">Pick…</option>
                {CATS.map(([k, lab]) => { const ts = opts.filter((t) => t.category === k); return ts.length ? <optgroup key={k} label={lab}>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup> : null; })}
              </select>
            </label>
            <label className="field">CHANGE<select className="input" value={l.kind} onChange={(e) => set(i, "kind", e.target.value)} aria-label={`Line ${i + 1} gain or loss`}><option value="loss">Loss</option><option value="gain">Gain</option></select></label>
            <label className="field">QTY<input className="input" type="number" min="1" max="9999" inputMode="numeric" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} aria-label={`Line ${i + 1} quantity`} /></label>
            <button type="button" className="btn btn-sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} title="Remove line" style={{ minHeight: 40 }}>✕</button>
          </div>
        );
      })}
      <div><button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { ...blank(), unit: ls[ls.length - 1].unit, kind: ls[ls.length - 1].kind }])} disabled={lines.length >= 40}>+ ADD LINE</button></div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "0 1 170px" }}>DATE<input className="input" type="date" value={date} min={data.campaign.startsOn} max={data.today} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field" style={{ flex: "1 1 260px" }}>OPERATION (OPTIONAL)
          <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">None</option>
            {(data.events || []).map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
          </select>
        </label>
      </div>
      <label className="field">REASON<input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shot down over the LZ" /></label>
      {err && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{err}</p>}
      {below && (
        <div className="notice notice-warn stack" role="alert" style={{ margin: 0, gap: 6 }}>
          <span>This takes {below.length === 1 ? "a count" : "some counts"} below zero:</span>
          {below.map((b, i) => <span key={i}>· {short(b.unit)} {b.type}: would be {b.after}</span>)}
          <span>Check the numbers, or log it anyway. It will show red until it's back to zero or above.</span>
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>CANCEL</button>
        {below ? <button type="button" className="btn btn-danger" disabled={busy} onClick={() => send(true)}>LOG ANYWAY</button>
          : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send(false)}>{busy ? "SAVING…" : `LOG ${lines.length} LINE${lines.length === 1 ? "" : "S"}`}</button>}
      </div>
    </Dialog>
  );
}

function RetractDialog({ data, entry, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const t = data.types.find((x) => x.id === entry.type);
  const u = data.units.find((x) => x.key === entry.unit);
  const go = async () => {
    setBusy(true); setErr("");
    try { await pb.send(`/api/orbat/assets/entries/${entry.id}/retract`, { method: "POST", body: { reason } }); onDone("Entry retracted. It stays in the log, struck through."); }
    catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog title="RETRACT ENTRY" onClose={onClose}>
      <p style={{ margin: 0 }}>{u ? u.name : entry.unit} · {t ? t.name : "Unknown asset"} · <span className={entry.delta > 0 ? "up mono" : "down mono"}>{sign(entry.delta)}</span> · {nice(entry.date)}</p>
      <p className="note">The count goes back by {Math.abs(entry.delta)}. The entry stays in the log, struck through, with your reason. Nothing is deleted.</p>
      <label className="field">REASON FOR RETRACTING<input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Logged twice" /></label>
      {err && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>CANCEL</button>
        <button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={go}>RETRACT</button>
      </div>
    </Dialog>
  );
}

function UnitChips({ units, value, onChange, disabled }) {
  return (
    <span className="chips" role="group" aria-label="Units that hold it">
      {units.map((u) => {
        const on = value.includes(u.key);
        return <button key={u.key} type="button" className="chip" aria-pressed={on} disabled={disabled}
          onClick={() => onChange(on ? value.filter((k) => k !== u.key) : [...value, u.key])}>{short(u.name).toUpperCase()}</button>;
      })}
    </span>
  );
}

function TypesDialog({ data, onClose, onChanged }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("Vehicle");
  const [units, setUnits] = useState([]);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [denying, setDenying] = useState(null);
  const [note, setNote] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");
  const say = (kind, text) => setMsg({ kind, text });
  const call = async (path, body, ok) => {
    try { await pb.send(path, { method: "POST", body }); if (ok) say("ok", ok); onChanged(); return true; }
    catch (e) { say("error", errorMessage(e)); return false; }
  };
  const pending = data.types.filter((t) => t.status === "pending");
  const denied = data.types.filter((t) => t.status === "denied").slice(-5).reverse();
  const approved = data.types.filter((t) => t.status === "approved");
  const canLog = data.canLog;

  const submit = async (ev) => {
    ev.preventDefault();
    if (await call("/api/orbat/assets/types", { name, category: cat, units }, `${name.trim()} submitted. It waits for the Unit Leader to approve it.`)) { setName(""); setUnits([]); }
  };
  const upload = async (t, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    await call(`/api/orbat/assets/types/${t.id}/image`, fd, `New image for ${t.name}.`);
  };

  return (
    <Dialog title={`ASSET TYPES · ${approved.length}`} onClose={onClose} wide>
      {canLog && (
        <form className="stack" onSubmit={submit} style={{ gap: 8 }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "1 1 220px" }}>NEW ASSET TYPE<input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BARC Speeder" /></label>
            <label className="field" style={{ flex: "0 1 150px" }}>CATEGORY<select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map(([k]) => <option key={k}>{k}</option>)}</select></label>
            <button type="submit" className="btn btn-admin" disabled={name.trim().length < 2}>SUBMIT FOR APPROVAL</button>
          </div>
          <UnitChips units={data.units} value={units} onChange={setUnits} />
          <p className="note">A new type waits for the Unit Leader to approve or deny it, and can't be logged until it's approved.</p>
        </form>
      )}
      {msg.text && <p className={`notice ${msg.kind === "error" ? "notice-error" : "notice-ok"}`} role={msg.kind === "error" ? "alert" : "status"} style={{ margin: 0 }}>{msg.text}</p>}

      <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
        {(pending.length > 0 || denied.length > 0) && <div className="pl-cat">WAITING FOR APPROVAL · {pending.length}</div>}
        {pending.map((t) => (
          <div key={t.id} className="as-typerow">
            <Icon t={t} />
            <span style={{ minWidth: 0 }}><b style={{ color: "var(--text-strong)" }}>{t.name}</b> <span className="tag tag-pending">PENDING</span><br />
              <span className="note">{t.category} for {t.units.map((k) => short(data.units.find((u) => u.key === k)?.name || k)).join(", ") || "no units yet"} · submitted by {t.submittedBy}</span></span>
            {data.canApprove ? (denying === t.id ? (
              <span className="row" style={{ justifyContent: "flex-end" }}>
                <input className="input input-sm" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for denying" aria-label={`Reason for denying ${t.name}`} style={{ minWidth: 180 }} />
                <button type="button" className="btn btn-sm btn-danger" disabled={note.trim().length < 3} onClick={async () => { if (await call(`/api/orbat/assets/types/${t.id}/review`, { decision: "deny", note }, `${t.name} denied.`)) { setDenying(null); setNote(""); } }}>DENY</button>
                <button type="button" className="btn btn-sm" onClick={() => setDenying(null)}>BACK</button>
              </span>
            ) : (
              <span className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => call(`/api/orbat/assets/types/${t.id}/review`, { decision: "approve" }, `${t.name} approved. It can be logged now.`)}>APPROVE</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => { setDenying(t.id); setNote(""); }}>DENY</button>
              </span>
            )) : <span className="note">Waiting for the Unit Leader</span>}
          </div>
        ))}
        {denied.map((t) => (
          <div key={t.id} className="as-typerow retired">
            <Icon t={t} />
            <span style={{ minWidth: 0 }}><b>{t.name}</b> <span className="tag tag-denied">DENIED</span><br /><span className="note">by {t.reviewedBy}: {t.reviewNote}</span></span>
            <span />
          </div>
        ))}

        {CATS.map(([k, label]) => (
          <Fragment key={k}>
            <div className="pl-cat">{label}</div>
            {approved.filter((t) => t.category === k).map((t) => (
              <div key={t.id} className={`as-typerow${t.retired ? " retired" : ""}`}>
                <Icon t={t} />
                <span style={{ minWidth: 0 }} className="stack">
                  {renaming === t.id ? (
                    <span className="row">
                      <input className="input input-sm" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label={`New name for ${t.name}`} style={{ maxWidth: 240 }} />
                      <button type="button" className="btn btn-sm btn-primary" onClick={async () => { if (await call(`/api/orbat/assets/types/${t.id}/update`, { name: newName }, `Renamed to ${newName.trim()}.`)) setRenaming(null); }}>SAVE</button>
                      <button type="button" className="btn btn-sm" onClick={() => setRenaming(null)}>CANCEL</button>
                    </span>
                  ) : <span><b style={{ color: "var(--text-strong)" }}>{t.name}</b>{t.retired && <span className="tag tag-withdrawn" style={{ marginLeft: 6 }}>RETIRED</span>}</span>}
                  <UnitChips units={data.units} value={t.units} disabled={!canLog} onChange={(v) => call(`/api/orbat/assets/types/${t.id}/update`, { units: v })} />
                </span>
                {canLog && (
                  <span className="row" style={{ justifyContent: "flex-end" }}>
                    <label className="btn btn-sm btn-admin" style={{ cursor: "pointer" }}>
                      {t.image ? "CHANGE IMAGE" : "+ IMAGE"}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={`Upload an image for ${t.name}`} onChange={(e) => { upload(t, e.target.files[0]); e.target.value = ""; }} />
                    </label>
                    {t.image && <button type="button" className="btn btn-sm" onClick={() => call(`/api/orbat/assets/types/${t.id}/image`, { remove: true }, `Image removed from ${t.name}.`)}>REMOVE IMAGE</button>}
                    <button type="button" className="btn btn-sm" onClick={() => { setRenaming(t.id); setNewName(t.name); }}>RENAME</button>
                    <button type="button" className="btn btn-sm" onClick={() => call(`/api/orbat/assets/types/${t.id}/update`, { retired: !t.retired }, t.retired ? `${t.name} restored.` : `${t.name} retired. It keeps its history.`)}>{t.retired ? "RESTORE" : "RETIRE"}</button>
                  </span>
                )}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <p className="note">Tap a unit to say whether it holds that asset. A retired type keeps its history but can't be logged. Images show at 128×128; the original is also saved in the pocketbase\asset_images folder.</p>
    </Dialog>
  );
}

function SupplyDialog({ data, onClose, onChanged, onDone }) {
  const [editing, setEditing] = useState(null); // {id?, name, rows}
  const [mode, setMode] = useState(data.presets?.length ? "preset" : "zero");
  const [presetId, setPresetId] = useState(data.presets?.[0]?.id || "");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);
  const approved = data.types.filter((t) => t.status === "approved" && !t.retired);
  const typeName = (id) => data.types.find((t) => t.id === id)?.name || "Unknown asset";
  const unitName = (k) => short(data.units.find((u) => u.key === k)?.name || k);
  const hasStart = data.entries.some((e) => e.isStart && !e.retracted);
  const prev = data.campaigns.filter((c) => c.startsOn < data.campaign.startsOn)[0];

  const save = async () => {
    setBusy(true);
    try {
      await pb.send("/api/orbat/assets/presets", { method: "POST", body: { id: editing.id, name: editing.name, rows: editing.rows.map((r) => ({ ...r, qty: Number(r.qty) })) } });
      setMsg({ kind: "ok", text: `Preset ${editing.name.trim()} saved.` }); setEditing(null); onChanged();
    } catch (e) { setMsg({ kind: "error", text: errorMessage(e) }); }
    finally { setBusy(false); }
  };
  const del = async (p) => {
    if (!window.confirm(`Delete the preset ${p.name}? Campaigns that already used it keep their starting supply.`)) return;
    try { await pb.send(`/api/orbat/assets/presets/${p.id}/delete`, { method: "POST" }); setMsg({ kind: "ok", text: `Preset ${p.name} deleted.` }); onChanged(); }
    catch (e) { setMsg({ kind: "error", text: errorMessage(e) }); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const r = await pb.send("/api/orbat/assets/starting-supply", { method: "POST", body: { mode, presetId } });
      onDone(`Starting supply set: ${r.label} (${r.lines} line${r.lines === 1 ? "" : "s"}).`);
    } catch (e) { setMsg({ kind: "error", text: errorMessage(e) }); }
    finally { setBusy(false); }
  };
  const setRow = (i, k, v) => setEditing((ed) => ({ ...ed, rows: ed.rows.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === "unit" ? { type: "" } : {}) } : r)) }));

  if (editing) {
    return (
      <Dialog title={editing.id ? "EDIT PRESET" : "NEW PRESET"} onClose={() => setEditing(null)} wide>
        <label className="field">PRESET NAME<input className="input" maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Standard issue" /></label>
        {editing.rows.map((r, i) => (
          <div key={i} className="as-line" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.6fr) 90px 36px" }}>
            <label className="field">UNIT<select className="input" value={r.unit} onChange={(e) => setRow(i, "unit", e.target.value)} aria-label={`Row ${i + 1} unit`}><option value="">Pick…</option>{data.units.map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}</select></label>
            <label className="field">ASSET<select className="input" value={r.type} onChange={(e) => setRow(i, "type", e.target.value)} aria-label={`Row ${i + 1} asset`}><option value="">Pick…</option>{approved.filter((t) => !r.unit || t.units.includes(r.unit)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="field">QTY<input className="input" type="number" min="1" max="9999" value={r.qty} onChange={(e) => setRow(i, "qty", e.target.value)} aria-label={`Row ${i + 1} quantity`} /></label>
            <button type="button" className="btn btn-sm" style={{ minHeight: 40 }} aria-label={`Remove row ${i + 1}`} onClick={() => setEditing({ ...editing, rows: editing.rows.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div><button type="button" className="btn btn-sm" onClick={() => setEditing({ ...editing, rows: [...editing.rows, { unit: editing.rows[editing.rows.length - 1]?.unit || "", type: "", qty: 1 }] })}>+ ADD ROW</button></div>
        <p className="note">Editing a preset doesn't change a campaign that already used it.</p>
        {msg.kind === "error" && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{msg.text}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => setEditing(null)}>BACK</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>SAVE PRESET</button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="STARTING SUPPLY" onClose={onClose} wide>
      <section className="stack" style={{ gap: 8 }}>
        <h3 className="h2" style={{ fontSize: 12 }}>{data.campaign.name.toUpperCase()}: {data.campaign.assetStart ? data.campaign.assetStart.toUpperCase() : "NOT SET YET"}</h3>
        <div className="stack" role="radiogroup" aria-label="How this campaign starts" style={{ gap: 6 }}>
          <label className="row"><input type="radio" name="mode" checked={mode === "preset"} disabled={!data.presets?.length} onChange={() => setMode("preset")} /> Apply a preset
            <select className="input input-sm" style={{ width: "auto" }} value={presetId} disabled={mode !== "preset"} onChange={(e) => setPresetId(e.target.value)} aria-label="Preset">
              {(data.presets || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="row"><input type="radio" name="mode" checked={mode === "carry"} disabled={!prev} onChange={() => setMode("carry")} /> Carry over what each unit held at the end of {prev ? prev.name : "the last campaign"}</label>
          <label className="row"><input type="radio" name="mode" checked={mode === "zero"} onChange={() => setMode("zero")} /> Start from zero</label>
        </div>
        {hasStart && <p className="note" style={{ color: "var(--warn)" }}>This replaces the starting supply already set. The old lines stay in the log as retracted.</p>}
        <div><button type="button" className="btn btn-primary" disabled={busy || (mode === "preset" && !presetId)} onClick={apply}>{hasStart ? "REPLACE STARTING SUPPLY" : "SET STARTING SUPPLY"}</button></div>
      </section>

      <section className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h2" style={{ fontSize: 12 }}>PRESETS</h3>
          <button type="button" className="btn btn-sm btn-admin" onClick={() => setEditing({ name: "", rows: [{ unit: "", type: "", qty: 1 }] })}>+ NEW PRESET</button>
        </div>
        {msg.text && <p className={`notice ${msg.kind === "error" ? "notice-error" : "notice-ok"}`} style={{ margin: 0 }}>{msg.text}</p>}
        {!(data.presets || []).length && <p className="note">No presets yet. A preset lists what each unit starts a campaign with.</p>}
        {(data.presets || []).map((p) => (
          <div key={p.id} className="panel" style={{ background: "var(--panel-deep)", padding: "10px 12px" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b style={{ color: "var(--text-strong)" }}>{p.name}</b>
              <span className="row"><span className="tag" style={{ color: "var(--holo-bright)" }}>{p.rows.length} LINES</span>
                <button type="button" className="btn btn-sm btn-admin" onClick={() => setEditing({ id: p.id, name: p.name, rows: p.rows.map((r) => ({ ...r })) })}>EDIT</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => del(p)}>DELETE</button></span>
            </div>
            <p className="note" style={{ marginTop: 6 }}>
              {[...new Set(p.rows.map((r) => r.unit))].map((uk) => `${unitName(uk)}: ${p.rows.filter((r) => r.unit === uk).map((r) => `${typeName(r.type)} ${r.qty}`).join(", ")}`).join(" · ")}
            </p>
          </div>
        ))}
      </section>
    </Dialog>
  );
}
