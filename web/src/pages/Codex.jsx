import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import logo from "../assets/41st_logo.png";
import DEFAULT_DATA from "../codex/codex-data.json";
import SPINS from "../codex/spins.json";
import { Rich, plain, ImgCtx } from "../codex/richtext.jsx";
import { Blocks, blocksText } from "../codex/blocks.jsx";
import { loadCodex } from "../codex/api.js";
import "../codex/codex.css";

// The Codex: the unit's reference library. The original content comes word for
// word from the 41st Kaid Bn. Unit Codex sheet (src/codex/codex-data.json, made by
// tools/codex-extract.py). Members with the Edit Codex permission can change any
// page, add new ones and reorder them on the site (edit mode, src/codex/editor.jsx);
// those changes live in the database and show instead of the original.
const Editor = lazy(() => import("../codex/editor-shell.jsx"));

const IMAGES = Object.fromEntries(
  Object.entries(import.meta.glob("../assets/codex/*", { eager: true, import: "default" }))
    .map(([path, url]) => [path.split("/").pop(), url])
);
// a picture that ships with the site (by file name) or one uploaded in the editor (by address)
const pic = (name) => (name ? IMAGES[name] || (/^(\/|https?:)/.test(name) ? name : undefined) : undefined);

export const CODEX_PAGES = [
  { key: "points", code: "PTS", label: "Points", blurb: "How points are earned, what counts, and the milestones they unlock.", heading: DEFAULT_DATA.points.title, intro: "" },
  { key: "activity", code: "ACT", label: "Activity Requirements", blurb: "What each duty status has to attend, and how long you can be away.", heading: DEFAULT_DATA.activity.title.toUpperCase(), intro: "Pick your duty status to see what it asks of you." },
  { key: "discharge", code: "DIS", label: "Discharge Policy", blurb: "The four discharge types and the six steps to retire or come back.", heading: DEFAULT_DATA.discharge.typesTitle.toUpperCase(), intro: "" },
  { key: "ranks", code: "RNK", label: "Unit Ranks", blurb: "Every Infantry, Fynock and Navy rank with insignia and requirements.", heading: "UNIT RANKS", intro: "Tap a rank on the ladder, or use the ← → keys to walk up and down it." },
  { key: "leadership", code: "CMD", label: "Unit Leadership", blurb: "Who holds each command billet, and their callsigns.", heading: DEFAULT_DATA.leadership.title, intro: "" },
  { key: "quals", code: "QUL", label: "Quals & Certs", blurb: "Every qualification and certification and its abbreviation.", heading: DEFAULT_DATA.quals.title.toUpperCase(), intro: "" },
  { key: "billets", code: "BLT", label: "Billet Regulations", blurb: "The armoury. Flick through each billet's kit, caps and rules.", heading: "BILLET REGULATIONS", intro: "Walk the armoury. Pick a section, then flick through its billets with the arrows or ← → keys." },
  { key: "kits", code: "KIT", label: "Billet Kit Contents", blurb: "Full starting kit for every billet, resupply rules, side-by-side compare.", heading: "BILLET KIT CONTENTS", intro: "Pick a kit to see its full contents. Add a second kit to compare: items the other kit doesn't carry are marked." },
  { key: "uniform", code: "UNI", label: "Uniform Regulations", blurb: "Who can wear what, and the custom helmet, armour and NVG rules.", heading: DEFAULT_DATA.uniform.title.toUpperCase(), intro: "" },
  { key: "equivalence", code: "EQV", label: "Rank Equivalence", blurb: "Infantry ranks against their Fynock equivalents.", heading: DEFAULT_DATA.equivalence.title.toUpperCase(), intro: "Tap a rank to open its entry in Unit Ranks." },
];

// The content being shown: the original, or the saved (or being edited) version
// of each page. Set by <Codex> before every render; the page components read it.
let DATA = DEFAULT_DATA;
let KITS = {};
let ALL_BILLETS = [];
function useContent(data) {
  DATA = data;
  KITS = Object.fromEntries(((data.kits && data.kits.kits) || []).map((k) => [k.id, k]));
  ALL_BILLETS = ((data.billets && data.billets.groups) || []).flatMap((g, gi) => (g.billets || []).map((b) => ({ ...b, group: gi })));
}
useContent(DEFAULT_DATA);

// built-in pages merged with what's saved: name, order, hidden, extra sections
function mergePages(records) {
  const byKey = Object.fromEntries(records.map((r) => [r.key, r]));
  const keep = (r, d) => {
    const out = { ...d };
    ["label", "code", "blurb", "heading", "intro"].forEach((f) => { if (r[f]) out[f] = r[f]; });
    if (r.sort) out.sort = r.sort;
    return { ...out, hidden: !!r.hidden, blocks: r.blocks || [], updatedBy: r.updatedBy, updatedAt: r.updatedAt, edited: true, savedData: r.data };
  };
  const out = CODEX_PAGES.map((d, i) => {
    const base = { ...d, kind: "builtin", sort: (i + 1) * 10, hidden: false, blocks: [], edited: false, savedData: null };
    return byKey[d.key] ? keep(byKey[d.key], base) : base;
  });
  records.filter((r) => !CODEX_PAGES.some((d) => d.key === r.key)).forEach((r) => out.push({ ...r, kind: "custom", edited: true, intro: r.intro || "", blurb: r.blurb || "" }));
  return out.sort((a, b) => a.sort - b.sort);
}

// Which kit(s) in Billet Kit Contents belong to which billet.
const BILLET_KITS = {
  rifleman: ["rifleman-15a-c", "rifleman-15s"],
  autorifleman: ["lmg-gunner-dc-15l", "heavy-gunner-z-6"],
  "cqb-specialist": ["cqb-specialist"],
  grenadier: ["grenadier"],
  "anti-tank": ["plx-1-rps-6-rps-6-sr", "rifle-at-t-15"],
  marksman: ["dc-15-le-dmr"],
  medic: ["combat-medic"],
  "radio-operator": ["radio-operator"],
  "combat-engineer": ["combat-engineer"],
  "platoon-medic": ["combat-medic"],
  "platoon-radio-operator": ["radio-operator"],
  "armor-mechanized-crew": ["armor-crew", "mechanized-crew"],
  "light-cavalry-crew": ["light-cavalry-crew"],
};

// 360° spins (tools/spin). One spin per weapon a kit can carry.
const KIT_WEAPONS = {
  "rifleman-15a-c": [["rifleman-dc-15a", "DC-15A"], ["rifleman-dc-15c", "DC-15C"]],
  "rifleman-15s": [["rifleman-dc-15s", "DC-15S"]],
  "lmg-gunner-dc-15l": [["lmg-gunner-dc-15l", "DC-15L"]],
  "heavy-gunner-z-6": [["heavy-gunner-z-6", "Z-6"]],
  "cqb-specialist": [["cqb-dp-23", "DP-23"], ["rifleman-dc-15s", "DC-15S"]],
  "dc-15-le-dmr": [["dc-15-le-dmr", "DC-15 LE DMR"]],
  "plx-1-rps-6-rps-6-sr": [["at-plx-1", "PLX-1"], ["at-rps-6", "RPS-6"], ["at-rps-6-sr", "RPS-6 (SR)"]],
  "rifle-at-t-15": [["rifle-at-t-15", "T-15"]],
};
// Authorized weapons with no kit of their own in the sheet.
const BILLET_WEAPONS = {
  autorifleman: [["autorifleman-38x", "38X (Rangers)"]],
  marksman: [["marksman-15x", "15X (Rangers)"]],
};
// Extra spins that belong with a kit.
const KIT_VARIANTS = {
  "rifleman-15a-c": [["ammo-bearer-rifle", "Ammo Bearer"]],
  "rifleman-15s": [["ammo-bearer-rifle", "Ammo Bearer"]],
  "cqb-specialist": [["ammo-bearer-rifle", "Ammo Bearer"]],
  "dc-15-le-dmr": [["ammo-bearer-rifle", "Ammo Bearer"]],
  "lmg-gunner-dc-15l": [["ammo-bearer-15l", "Ammo Bearer (15L)"]],
  "heavy-gunner-z-6": [["ammo-bearer-z6", "Ammo Bearer (Z-6)"]],
  "plx-1-rps-6-rps-6-sr": [["ammo-bearer-plx-rps", "Ammo Bearer (PLX/RPS)"]],
  "rifle-at-t-15": [["ammo-bearer-t-15", "Ammo Bearer (T-15)"]],
  "radio-operator": [["radio-operator-scatter", "Scatter Blaster"]],
  "combat-engineer": [["combat-engineer-scatter", "Scatter Blaster"]],
  "combat-medic": [["combat-medic-scatter", "Scatter Blaster"]],
};
// every spin that fits a billet: [spin id, full label, kit id or "", short label]
function spinsFor(billet, kits) {
  const name = billet.name.replace("\n", " ");
  const list = [[billet.id, name, "", name]];
  kits.forEach((k) => {
    list.push([k.id, k.name, k.id, k.name]);
    (KIT_WEAPONS[k.id] || []).forEach(([id, w]) => list.push([id, `${k.name} · ${w}`, k.id, w]));
  });
  (BILLET_WEAPONS[billet.id] || []).forEach(([id, w]) => list.push([id, `${name} · ${w}`, "", w]));
  kits.forEach((k) => (KIT_VARIANTS[k.id] || []).forEach(([id, label]) => list.push([id, `${k.name} · ${label}`, k.id, label])));
  const seen = new Set();
  return list.filter(([id]) => SPINS[id] && !seen.has(id) && seen.add(id));
}
const prefersStill = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Spins are cropped to the trooper, so a kneeling one would fill the frame like a
// standing one. srcHeight (crop height in the 1440p screenshot) keeps them to scale.
const STANDING_SRC = 822;
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5];
let lastZoom = 2;

function SpinViewer({ id, label }) {
  const n = SPINS[id].frames;
  const [zoomI, setZoomI] = useState(lastZoom);
  const zoomTo = (i) => { const z = Math.max(0, Math.min(ZOOMS.length - 1, i)); lastZoom = z; setZoomI(z); };
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    const onWheel = (e) => { e.preventDefault(); setZoomI((i) => { const z = Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1))); lastZoom = z; return z; }); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const h = 80 * ((SPINS[id].srcHeight || STANDING_SRC) / STANDING_SRC) * ZOOMS[zoomI];
  const imgStyle = { height: `${h}%`, bottom: `${Math.min(8, 48 - h / 2)}%` };
  const urls = useMemo(() => Array.from({ length: n }, (_, i) => `${import.meta.env.BASE_URL}codex/spin/${id}/${String(i).padStart(2, "0")}.webp`), [id, n]);
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [touched, setTouched] = useState(false);
  const drag = useRef(null);
  useEffect(() => {
    let alive = true;
    setFrame(0); setLoaded(0); setTouched(false);
    urls.forEach((u) => { const im = new Image(); im.onload = im.onerror = () => alive && setLoaded((x) => x + 1); im.src = u; });
    return () => { alive = false; };
  }, [urls]);
  const ready = loaded >= n;
  useEffect(() => {
    if (!ready || touched || prefersStill()) return undefined;
    const t = setInterval(() => setFrame((f) => (f + 1) % n), 90);
    return () => clearInterval(t);
  }, [ready, touched, n]);
  const turn = (f) => setFrame(((f % n) + n) % n);
  return (
    <div className="cx-spin" ref={box} tabIndex={0} role="img" aria-label={`${label}, 360 degree view. Drag or use the arrow keys to turn, plus and minus to zoom.`}
      onPointerDown={(e) => { setTouched(true); drag.current = { x: e.clientX, f: frame, w: e.currentTarget.clientWidth }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (d) turn(d.f + Math.round(((e.clientX - d.x) * n) / d.w)); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); setTouched(true); turn(frame + (e.key === "ArrowRight" ? 1 : -1)); }
        else if (e.key === "+" || e.key === "=" || e.key === "-") { e.preventDefault(); zoomTo(zoomI + (e.key === "-" ? -1 : 1)); } }}>
      <img className="cx-spin-img" src={urls[frame]} alt="" draggable={false} style={imgStyle} />
      <div className="cx-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom out" disabled={zoomI === 0} onClick={() => zoomTo(zoomI - 1)}>−</button>
        <button type="button" aria-label="Reset zoom" className="cx-zoom-pct" onClick={() => zoomTo(2)}>{Math.round(ZOOMS[zoomI] * 100)}%</button>
        <button type="button" aria-label="Zoom in" disabled={zoomI === ZOOMS.length - 1} onClick={() => zoomTo(zoomI + 1)}>+</button>
      </div>
      {!ready && <div className="cx-spin-load"><span style={{ width: `${(loaded / n) * 100}%` }} /></div>}
      <div className="cx-spin-hint">{ready ? "◂ DRAG TO TURN ▸" : `LOADING ${Math.round((loaded / n) * 100)}%`}</div>
    </div>
  );
}

// ── routing: #codex, #codex/<page>, #codex/<page>/<item> ─────────────────────
function readHash() {
  const [, page = "", item = ""] = window.location.hash.replace(/^#/, "").split("/");
  return { page, item: decodeURIComponent(item) };
}
export function codexHref(page, item) {
  return "#codex" + (page ? `/${page}` : "") + (item ? `/${encodeURIComponent(item)}` : "");
}
function go(page, item) {
  const h = codexHref(page, item);
  if (window.location.hash !== h) window.location.hash = h;
}

// Text exactly as written in the sheet (keeping its line breaks), or formatted text from the editor.
function T({ children, as = "span", className = "" }) {
  return <Rich value={children} as={as} className={className} />;
}
// "Bacta Bandage x20" -> name + count badge (the full text stays readable in order)
function splitQty(s) {
  const m = s.match(/^(.*\S)\s+(x\s?\d+(?:-\d+)?)$/i);
  return m ? [m[1], m[2]] : [s, ""];
}
const isBlank = (s) => !s || /^(n\/a|none)$/i.test(plain(s).trim());

// ── search ──────────────────────────────────────────────────────────────────
function buildIndex(pages) {
  const out = [];
  const add = (page, item, title, ...texts) => out.push({ page, item, title: plain(title), text: texts.filter(Boolean).map(plain).join(" · ") });
  const p = DATA.points;
  add("points", "", p.rules.heading, p.rules.text);
  add("points", "", p.gain.heading, p.gain.text, p.gain.maxHeading, p.gain.maxNote);
  p.qualifies.items.forEach((t) => (typeof t === "string" ? add("points", "", p.qualifies.heading, t, (p.qualifies.notes || {})[t]) : add("points", "", p.qualifies.heading, t.text, t.note)));
  p.notQualify.items.forEach((t) => add("points", "", p.notQualify.heading, t));
  p.milestones.rows.forEach((r) => add("points", "", p.milestones.heading, r.pts?.text, r.inf?.text, r.av?.text));
  p.key.items.forEach(([a, b]) => add("points", "", p.key.heading, `${a} ${b}`));
  DATA.activity.statuses.forEach((s) => add("activity", s.name, s.name, ...s.requirements, s.timeout));
  DATA.discharge.types.forEach((t) => add("discharge", t.name, `${t.name} discharge`, ...t.points));
  DATA.discharge.steps.forEach((s) => add("discharge", s.label, s.label, s.text));
  ["infantry", "fynock", "navy"].forEach((track) => DATA.ranks[track].forEach((r) => add("ranks", `${track}:${r.abbr}`, `${r.name} (${r.abbr})`, r.requirements, r.description, r.notes)));
  DATA.leadership.groups.forEach((g) => g.leaders.forEach((l) => add("leadership", "", l.billet, l.holder, l.callsign)));
  ["qualifications", "certifications"].forEach((k) => DATA.quals[k].items.forEach((q) => add("quals", "", DATA.quals[k].heading, q.text)));
  ALL_BILLETS.forEach((b) => add("billets", b.id, b.name, ...b.fields.map(([l, v]) => `${l}: ${v}`)));
  add("billets", "", DATA.billets.qa.heading, DATA.billets.qa.intro, ...DATA.billets.qa.items);
  DATA.kits.kits.forEach((k) => add("kits", k.id, k.name, ...k.starting, k.extraName, ...(k.extra || [])));
  DATA.kits.resupply.items.forEach((t) => add("kits", "", DATA.kits.resupply.heading, t));
  DATA.uniform.accessories.forEach((a) => add("uniform", "", a.name, ...a.rules));
  DATA.uniform.custom.forEach((c) => c.rules.forEach((r) => add("uniform", c.name, c.name, r)));
  add("uniform", "", DATA.uniform.exceptions.heading, DATA.uniform.exceptions.text, ...DATA.uniform.general);
  DATA.equivalence.rows.forEach(([a, b]) => add("equivalence", "", DATA.equivalence.title, a, b));
  // extra sections and pages built in the editor
  pages.forEach((pg) => { if (pg.blocks && pg.blocks.length) add(pg.key, "", pg.label, blocksText(pg.blocks)); });
  return out.filter((e) => pages.some((pg) => pg.key === e.page));
}

function Highlight({ text, q }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return text.slice(0, 160);
  const from = Math.max(0, i - 60);
  return (
    <>
      {from > 0 && "…"}{text.slice(from, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length, i + q.length + 100)}
      {i + q.length + 100 < text.length && "…"}
    </>
  );
}

function SearchResults({ q, onPick, pages }) {
  const index = useMemo(() => buildIndex(pages), [pages]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = index.filter((e) => words.every((w) => `${e.title} ${e.text}`.toLowerCase().includes(w))).slice(0, 40);
  return (
    <section className="cx-panel" aria-live="polite">
      <div className="cx-head"><h2 className="cx-h2">SEARCH</h2><span className="cx-meta">{hits.length === 40 ? "40+" : hits.length} RESULTS FOR “{q}”</span></div>
      {hits.length === 0 && <p className="cx-dim">Nothing in the Codex matches that. Try a shorter word, a rank abbreviation like CLC, or an item like “bacta”.</p>}
      <ul className="cx-results">
        {hits.map((h, i) => {
          const page = pages.find((p) => p.key === h.page);
          return (
            <li key={i}>
              <a href={codexHref(h.page, h.item)} onClick={onPick}>
                <span className="cx-code">{page.code}</span>
                <span><b>{h.title}</b><span className="cx-snip"><Highlight text={h.text} q={words[0] || ""} /></span></span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────
// the page's name, title and intro (editable in edit mode)
const MetaCtx = createContext(null);
function PageHead({ code, title, children }) {
  const m = useContext(MetaCtx);
  const intro = m ? m.intro : children;
  return (
    <header className="cx-pagehead holo">
      <div className="eyebrow">{m ? m.code : code} · CODEX ENTRY</div>
      <h1 className="cx-h1">{m ? m.heading : title}</h1>
      {intro && <p className="cx-lede cx-pre">{intro}</p>}
      {m && m.hidden && <p className="cx-hidden-note">HIDDEN PAGE · only Codex editors can see it</p>}
    </header>
  );
}
function Stepper({ children, onStep, label }) {
  return (
    <div className="cx-stepper" role="group" aria-label={label}>
      <button type="button" className="cx-arrow" aria-label="Previous" onClick={() => onStep(-1)}>‹</button>
      <div className="cx-chips">{children}</div>
      <button type="button" className="cx-arrow" aria-label="Next" onClick={() => onStep(1)}>›</button>
    </div>
  );
}
function useArrowKeys(onStep, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const h = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") onStep(-1);
      if (e.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onStep, enabled]);
}

// ── Overview ────────────────────────────────────────────────────────────────
function Overview({ pages }) {
  return (
    <>
      <PageHead code="IDX" title="UNIT CODEX">The 41st Kaid Battalion's regulations and reference, in one place. Pick a section, or search for anything: a rank, a qual, a billet or a piece of kit.</PageHead>
      <div className="cx-tiles">
        {pages.map((p) => (
          <a key={p.key} className={`cx-tile ${p.hidden ? "is-hidden" : ""}`} href={codexHref(p.key)}>
            <span className="cx-code">{p.code}{p.hidden ? " · HIDDEN" : ""}</span>
            <b>{p.label.toUpperCase()}</b>
            <span>{p.blurb}</span>
          </a>
        ))}
      </div>
    </>
  );
}
function CustomPage({ meta }) {
  return <PageHead code={meta.code} title={meta.heading || meta.label.toUpperCase()} />;
}

// ── Points ──────────────────────────────────────────────────────────────────
const leadNum = (s) => { const m = String(s || "").match(/^\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : 0; };

function PointsPage() {
  const p = DATA.points;
  const [mine, setMine] = useState("");
  const val = mine === "" ? null : Number(mine);
  // the points threshold for each sheet row (a cell spanning rows covers them all)
  const rowPts = useMemo(() => {
    const out = {}; let cur = 0;
    p.milestones.rows.forEach((r, i) => { if (r.pts) cur = leadNum(plain(r.pts.text)); out[i] = cur; });
    return out;
  }, [p]);
  const reached = (row) => val !== null && val >= rowPts[row];
  const cell = (r, i, key, cls) => r[key] && (
    <td rowSpan={r[key].rows || 1} className={`${cls} ${reached(i + (r[key].rows || 1) - 1) ? "on" : ""}`}><T>{r[key].text}</T></td>
  );
  return (
    <>
      <PageHead code="PTS" title={p.title} />
      <div className="cx-grid2">
        <section className="cx-panel"><h2 className="cx-h2">{p.rules.heading.toUpperCase()}</h2><T as="p" className="cx-body">{p.rules.text}</T></section>
        <section className="cx-panel">
          <h2 className="cx-h2">{p.gain.heading.toUpperCase()}</h2>
          <T as="p" className="cx-body">{p.gain.text}</T>
          <div className="cx-bigstat">
            <span className="cx-bignum">{p.gain.maxValue}</span>
            <span><b>{p.gain.maxHeading}</b><T className="cx-dim">{p.gain.maxNote}</T></span>
          </div>
        </section>
      </div>
      <div className="cx-grid2">
        <section className="cx-panel cx-good">
          <h2 className="cx-h2">{p.qualifies.heading.toUpperCase()}</h2>
          <ul className="cx-list cx-yes">
            {p.qualifies.items.map((t, i) => {
              const it = typeof t === "string" ? { text: t, note: (p.qualifies.notes || {})[t] } : t;
              return <li key={i}><T>{it.text}</T>{it.note && <T as="small" className="cx-note">{it.note}</T>}</li>;
            })}
          </ul>
        </section>
        <section className="cx-panel cx-bad">
          <h2 className="cx-h2">{p.notQualify.heading.toUpperCase()}</h2>
          <ul className="cx-list cx-no">{p.notQualify.items.map((t, i) => <li key={i}><T>{t}</T></li>)}</ul>
        </section>
      </div>
      <div className="cx-callout"><b>{p.note.heading.toUpperCase()}</b><T>{p.note.text}</T></div>
      <section className="cx-panel">
        <div className="cx-head">
          <h2 className="cx-h2">{p.milestones.heading.toUpperCase()}</h2>
          <label className="cx-calc">
            <span>YOUR POINTS</span>
            <input className="input input-sm" id="cx-mypoints" type="number" min="0" inputMode="decimal" placeholder="e.g. 42" value={mine} onChange={(e) => setMine(e.target.value)} />
          </label>
        </div>
        {val !== null && <p className="cx-dim cx-calc-hint">Rows you've reached on points alone are lit. Milestones marked with a billet or course (for example “+ PS” or “SL SULC”) need that as well.</p>}
        <div className="cx-scroll">
          <table className="cx-table cx-milestones">
            <thead><tr>{p.milestones.cols.map((c, i) => <th key={i}><T>{c}</T></th>)}</tr></thead>
            <tbody>
              {p.milestones.rows.map((r, i) => (
                <tr key={i}>{cell(r, i, "pts", "cx-pts")}{cell(r, i, "inf", "")}{cell(r, i, "av", "")}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="cx-panel">
        <h2 className="cx-h2">{p.key.heading.toUpperCase()}</h2>
        <dl className="cx-key">{p.key.items.map(([a, b], i) => <div key={i}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
      </section>
    </>
  );
}

// ── Activity ────────────────────────────────────────────────────────────────
function ActivityPage({ item }) {
  const a = DATA.activity;
  const [sel, setSel] = useState(() => Math.max(0, a.statuses.findIndex((s) => s.name === item)));
  const s = a.statuses[Math.min(sel, a.statuses.length - 1)];
  if (!s) return <PageHead code="ACT" title={a.title.toUpperCase()} />;
  return (
    <>
      <PageHead code="ACT" title={a.title.toUpperCase()}>Pick your duty status to see what it asks of you.</PageHead>
      <div className="cx-seg" role="tablist" aria-label="Duty status">
        {a.statuses.map((x, i) => (
          <button key={x.name} role="tab" type="button" aria-selected={i === sel} onClick={() => setSel(i)}>
            <span className="cx-code">0{i + 1}</span>{x.name}
          </button>
        ))}
      </div>
      <div className="cx-grid2 cx-status" key={sel}>
        <section className="cx-panel holo">
          <h2 className="cx-h2">REQUIREMENTS · {s.name.toUpperCase()}</h2>
          <ul className="cx-list cx-req">{s.requirements.map((t, i) => <li key={i}><T>{t}</T></li>)}</ul>
        </section>
        <section className="cx-panel holo cx-warnbox">
          <h2 className="cx-h2">TIME ALLOWED WITHOUT ATTENDANCE</h2>
          <T as="p" className="cx-body">{s.timeout}</T>
        </section>
      </div>
      <section className="cx-panel">
        <h2 className="cx-h2">ALL STATUSES AT A GLANCE</h2>
        <div className="cx-scroll">
          <table className="cx-table cx-compare">
            <thead><tr>{a.statuses.map((x, i) => <th key={x.name} className={i === sel ? "sel" : ""}>{x.name}</th>)}</tr></thead>
            <tbody>
              <tr>{a.statuses.map((x, i) => <td key={x.name} className={i === sel ? "sel" : ""}>{x.requirements.map((t, k) => <T as="p" key={k}>{t}</T>)}</td>)}</tr>
              <tr className="cx-timeout">{a.statuses.map((x, i) => <td key={x.name} className={i === sel ? "sel" : ""}><T>{x.timeout}</T></td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ── Discharge ───────────────────────────────────────────────────────────────
const TONES = ["good", "holo", "warn", "bad"];
function DischargePage({ item }) {
  const d = DATA.discharge;
  const [type, setType] = useState(() => Math.max(0, d.types.findIndex((t) => t.name === item)));
  const [step, setStep] = useState(() => Math.max(0, d.steps.findIndex((s) => s.label === item)));
  const t = d.types[Math.min(type, d.types.length - 1)] || { name: "", points: [] };
  const st = d.steps[Math.min(step, d.steps.length - 1)] || { label: "", text: "" };
  return (
    <>
      <PageHead code="DIS" title={d.typesTitle.toUpperCase()} />
      <div className="cx-dtypes" role="tablist" aria-label={d.typesTitle}>
        {d.types.map((x, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === type} className={`cx-dtype tone-${TONES[i % TONES.length]}`} onClick={() => setType(i)}>
            <b>{x.name.toUpperCase()}</b><span className="cx-dim">{plain(x.points[0] || "")}</span>
          </button>
        ))}
      </div>
      <section className={`cx-panel holo tone-${TONES[type % TONES.length]} cx-dpanel`} key={type}>
        <h2 className="cx-h2">{t.name.toUpperCase()} DISCHARGE</h2>
        <ol className="cx-list cx-num">{t.points.map((x, i) => <li key={i}><T>{x}</T></li>)}</ol>
      </section>
      <section className="cx-panel">
        <h2 className="cx-h2">{String(d.stepsTitle || "").replace("\n", " ").toUpperCase()}</h2>
        <ol className="cx-steps">
          {d.steps.map((s, i) => (
            <li key={i}>
              <button type="button" aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""} onClick={() => setStep(i)}>
                <span className="cx-stepdot">{i + 1}</span><span>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="cx-stepbody holo" key={step}>
          <div className="eyebrow">{st.label}</div>
          <T as="p" className="cx-body">{st.text}</T>
          <div className="row">
            <button type="button" className="btn btn-sm" disabled={step === 0} onClick={() => setStep(step - 1)}>‹ BACK</button>
            <button type="button" className="btn btn-sm" disabled={step === d.steps.length - 1} onClick={() => setStep(step + 1)}>NEXT STEP ›</button>
          </div>
        </div>
      </section>
    </>
  );
}

// ── Ranks ───────────────────────────────────────────────────────────────────
const TRACKS = [["infantry", "INFANTRY"], ["fynock", "FYNOCK AIR WING"], ["navy", "NAVY · ZEUS"]];
function RanksPage({ item }) {
  const [it, ia] = (item || "").split(":");
  const [track, setTrack] = useState(TRACKS.some(([k]) => k === it) ? it : "infantry");
  const list = DATA.ranks[track] || [];
  const [sel, setSel] = useState(() => Math.max(0, list.findIndex((r) => r.abbr === ia)));
  useEffect(() => { const i = (DATA.ranks[track] || []).findIndex((r) => r.abbr === ia); setSel(i < 0 ? 0 : i); }, [track, ia]);
  const step = (d) => setSel((s) => (list.length ? (s + d + list.length) % list.length : 0));
  useArrowKeys(step);
  const r = list[Math.min(sel, list.length - 1)] || { name: "No ranks yet", abbr: "", description: "" };
  return (
    <>
      <PageHead code="RNK" title="UNIT RANKS">Tap a rank on the ladder, or use the ← → keys to walk up and down it.</PageHead>
      <div className="cx-seg" role="tablist" aria-label="Rank track">
        {TRACKS.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={track === k} onClick={() => setTrack(k)}>{l}</button>)}
      </div>
      <div className="cx-ladder" role="listbox" aria-label="Ranks">
        {list.map((x, i) => (
          <button key={i} type="button" role="option" aria-selected={i === sel} onClick={() => setSel(i)} title={x.name}>
            <span className="cx-insig">{pic(x.insignia) ? <img src={pic(x.insignia)} alt="" /> : null}</span>
            <span className="cx-abbr">{x.abbr}</span>
          </button>
        ))}
      </div>
      <section className="cx-panel holo cx-rank" key={track + sel}>
        <div className="cx-rank-badge">{pic(r.insignia) && <img src={pic(r.insignia)} alt={`${r.name} insignia`} />}</div>
        <div className="cx-rank-body">
          <div className="eyebrow">{TRACKS.find(([k]) => k === track)[1]} · {sel + 1} OF {list.length}</div>
          <h2 className="cx-rank-name">{r.name} <span>({r.abbr})</span></h2>
          {r.requirements && <div className="cx-reqbox"><T>{r.requirements}</T></div>}
          <T as="p" className="cx-body">{r.description}</T>
          {r.notes && <div className="cx-pills">{plain(r.notes).split("\n").filter(Boolean).map((n, i) => <span key={i} className="cx-pill">{n}</span>)}</div>}
        </div>
      </section>
    </>
  );
}

// ── Leadership ──────────────────────────────────────────────────────────────
// How the detachment leaders are grouped on the page (by billet name in the sheet).
const DETACHMENTS = [
  { heading: "NAVY COMMAND", billets: [["Navy Command XO"]] },
  { heading: "FYNOCK", billets: [["Fynock Commander"], ["Fynock SNCO"], ["Fynock 1st Squadron Leader"], ["Fynock 2nd Squadron Leader"]] },
  { heading: "PLATOON DETACHMENTS", billets: [["Wyrwulf Section Leader", "Acklay"], ["Rancor Section Leader", "Banshee"], ["Howler Section Leader", "Chimaera"], ["Varactyl Section Leader", "Drexl"], ["Gundark Section Leader", "Rangers"]] },
];

function LeaderCard({ l, big, tag }) {
  const vacant = isBlank(l.holder);
  return (
    <article className={`cx-leader ${big ? "big" : ""} ${vacant ? "vacant" : ""}`}>
      {big && (
        <div className="cx-portrait">
          {pic(l.photo) ? <img src={pic(l.photo)} alt={vacant ? "" : `${l.holder} in game`} loading="lazy" /> : null}
          <div className="cx-scanlines" aria-hidden="true" />
        </div>
      )}
      <div className="cx-leader-body">
        {tag && <div className="cx-leader-tag">{tag.toUpperCase()}</div>}
        <div className="cx-billet">{l.billet}</div>
        <div className="cx-holder">{l.holder || " "}</div>
        {l.callsign && <div className="cx-callsign"><span>{l.callsignLabel.toUpperCase()}</span>{l.callsign}</div>}
      </div>
    </article>
  );
}
function LeadershipPage() {
  const L = DATA.leadership;
  return (
    <>
      <PageHead code="CMD" title={L.title} />
      {L.groups.map((g, i) => (
        <section key={i} className="cx-panel">
          {g.heading ? <h2 className="cx-h2">{g.heading}</h2> : <h2 className="cx-h2">BATTALION COMMAND</h2>}
          {i === 3 ? <Detachments leaders={g.leaders} /> : (
            <div className={`cx-leaders ${i < 2 ? "big" : ""}`}>
              {g.leaders.map((l, j) => <LeaderCard key={j} l={l} big={i < 2} />)}
            </div>
          )}
        </section>
      ))}
    </>
  );
}

function Detachments({ leaders }) {
  const byBillet = Object.fromEntries(leaders.map((l) => [l.billet, l]));
  const used = new Set(DETACHMENTS.flatMap((d) => d.billets.map(([b]) => b)));
  const rest = leaders.filter((l) => !used.has(l.billet)); // anything new in the sheet still shows
  const groups = rest.length ? [...DETACHMENTS, { heading: "OTHER", billets: rest.map((l) => [l.billet]) }] : DETACHMENTS;
  return (
    <div className="cx-detach">
      {groups.map((d) => (
        <div key={d.heading} className="cx-detach-group">
          <h3 className="cx-detach-h">{d.heading}</h3>
          <div className="cx-leaders">
            {d.billets.filter(([b]) => byBillet[b]).map(([b, tag]) => <LeaderCard key={b} l={byBillet[b]} tag={tag} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Quals & Certs ───────────────────────────────────────────────────────────
function QualsPage() {
  const Q = DATA.quals;
  const [f, setF] = useState("");
  const match = (q) => !f || q.text.toLowerCase().includes(f.toLowerCase());
  const col = (k) => {
    const c = Q[k];
    const items = c.items.filter(match);
    return (
      <section className="cx-panel">
        <h2 className="cx-h2">{c.heading.toUpperCase()} <span className="cx-meta">{c.items.length}</span></h2>
        <T as="p" className="cx-dim cx-about">{c.about}</T>
        <div className="cx-badges">
          {items.map((q, i) => {
            const [name, ...rest] = q.text.split("\n");
            return (
              <div key={i} className="cx-badge">
                <span className="cx-badge-ab">{q.abbr || "—"}</span>
                <span className="cx-badge-name"><T>{[name, ...rest].join("\n")}</T></span>
              </div>
            );
          })}
          {items.length === 0 && <p className="cx-dim">None match “{f}”.</p>}
        </div>
      </section>
    );
  };
  return (
    <>
      <PageHead code="QUL" title={Q.title.toUpperCase()} />
      <label className="cx-filter"><span className="eyebrow">FILTER</span><input className="input" id="cx-qfilter" type="search" placeholder="Name or abbreviation, e.g. MM, Ranger, RTO" value={f} onChange={(e) => setF(e.target.value)} /></label>
      <div className="cx-grid2">{col("qualifications")}{col("certifications")}</div>
    </>
  );
}

// ── Kit inventory (used by the armoury and the kit page) ─────────────────────
function Inventory({ kit, other }) {
  const otherSet = other ? new Set([...other.starting, ...(other.extra || [])]) : null;
  const tile = (s, i) => {
    const [n, q] = splitQty(s);
    const diff = otherSet && !otherSet.has(s);
    return (
      <li key={`${i}-${s}`} className={`cx-item ${diff ? "diff" : ""}`} title={s}>
        <span className="cx-item-name">{n}</span>{q && <span className="cx-qty">{q}</span>}
      </li>
    );
  };
  return (
    <div className="cx-inv">
      <div className="cx-inv-head"><b>{String(kit.startHeading || "Starting Kit").toUpperCase()}</b><span>{kit.starting.length} LINES</span></div>
      <ul className="cx-items">{kit.starting.map(tile)}</ul>
      {kit.extraName && (
        <>
          <div className="cx-inv-head sub"><b>{kit.extraName.replace("\n", " ").toUpperCase()}</b>{kit.extraHeading && <span>{kit.extraHeading.toUpperCase()}</span>}</div>
          {(kit.extra || []).length > 0 && <ul className="cx-items">{kit.extra.map(tile)}</ul>}
        </>
      )}
    </div>
  );
}

// ── Billet Regulations: the armoury ─────────────────────────────────────────
function BilletsPage({ item }) {
  const B = DATA.billets;
  const start = Math.max(0, ALL_BILLETS.findIndex((b) => b.id === item));
  const [idx, setIdx] = useState(start);
  useEffect(() => { const i = ALL_BILLETS.findIndex((b) => b.id === item); if (i >= 0) setIdx(i); }, [item]);
  const b = ALL_BILLETS[Math.min(idx, ALL_BILLETS.length - 1)] || { id: "", name: "No billets yet", fields: [], group: 0 };
  const group = B.groups[b.group] || { heading: "" };
  const inGroup = ALL_BILLETS.filter((x) => x.group === b.group);
  const kits = (BILLET_KITS[b.id] || []).map((k) => KITS[k]).filter(Boolean);
  const [kitSel, setKitSel] = useState(0);
  useEffect(() => setKitSel(0), [idx]);
  const choose = (i) => { if (!ALL_BILLETS[i]) return; setIdx(i); history.replaceState(null, "", codexHref("billets", ALL_BILLETS[i].id)); };
  const step = (d) => ALL_BILLETS.length && choose((idx + d + ALL_BILLETS.length) % ALL_BILLETS.length);
  useArrowKeys(step);
  const image = pic(b.image);
  const spins = spinsFor(b, kits);
  const [spinSel, setSpinSel] = useState("");
  const [mode, setMode] = useState("spin");
  useEffect(() => { setSpinSel(""); }, [idx]);
  // follow the kit tab: show that kit's spin when there is one
  const kitSpin = kits[kitSel] ? (spins.find(([, , k]) => k === kits[kitSel].id) || [""])[0] : "";
  const spinId = spins.some(([id]) => id === spinSel) ? spinSel : kitSpin || (spins[0] || [])[0] || "";
  const showSpin = spinId && (mode === "spin" || !image);
  const posInGroup = inGroup.findIndex((x) => x.id === b.id);
  return (
    <>
      <PageHead code="BLT" title="BILLET REGULATIONS">Walk the armoury. Pick a section, then flick through its billets with the arrows or ← → keys.</PageHead>
      <div className="cx-seg" role="tablist" aria-label="Billet sections">
        {B.groups.map((g, gi) => (
          <button key={gi} role="tab" type="button" aria-selected={gi === b.group} onClick={() => choose(ALL_BILLETS.findIndex((x) => x.group === gi))}>{g.heading}</button>
        ))}
      </div>
      <Stepper label="Billets" onStep={step}>
        {inGroup.map((x) => {
          const i = ALL_BILLETS.indexOf(x);
          return <button key={x.id} type="button" className="cx-bchip" aria-pressed={i === idx} onClick={() => choose(i)}>{x.name.replace("\n", " ")}</button>;
        })}
      </Stepper>
      <div className="cx-bay" key={b.id}>
        <div className="cx-viewer holo">
          <div className="cx-viewer-hud">
            <div><div className="cx-viewer-title">{b.name.replace("\n", " ").toUpperCase()}</div><div className="cx-viewer-sub">{group.heading.toUpperCase()}</div></div>
            <div className="cx-viewer-sub">{posInGroup + 1} / {inGroup.length}</div>
          </div>
          {showSpin ? <SpinViewer key={spinId} id={spinId} label={(spins.find(([id]) => id === spinId) || [, b.name])[1]} /> : image
            ? <img className="cx-viewer-img" src={image} alt={`${b.name} loadout`} />
            : (
              <div className="cx-viewer-empty">
                <img src={logo} alt="" />
                <span>{(b.fields.find(([l]) => /Authorized Weapons/i.test(l)) || [, ""])[1] ? <T>{b.fields.find(([l]) => /Authorized Weapons/i.test(l))[1]}</T> : "NO IMAGE ON FILE"}</span>
              </div>
            )}
          <div className="cx-pedestal" aria-hidden="true" />
          <div className="cx-scanlines" aria-hidden="true" />
          {(spins.length > 1 || (spins.length > 0 && image)) && (
            <div className="cx-viewer-modes">
              {spins.length > 0 && image && (
                <>
                  <button type="button" aria-pressed={mode === "spin"} onClick={() => setMode("spin")}>360°</button>
                  <button type="button" aria-pressed={mode === "photo"} onClick={() => setMode("photo")}>PHOTO</button>
                </>
              )}
              {showSpin && spins.length > 1 && image && <span className="cx-modes-sep" aria-hidden="true" />}
              {showSpin && spins.length > 1 && spins.map(([id, label, kit, short]) => (
                <button key={id} type="button" aria-pressed={id === spinId} title={label}
                  onClick={() => { setSpinSel(id); const k = kits.findIndex((x) => x.id === kit); if (k >= 0) setKitSel(k); }}>{short.toUpperCase()}</button>
              ))}
            </div>
          )}
          <div className="cx-viewer-nav">
            <button type="button" className="cx-arrow" aria-label="Previous billet" onClick={() => step(-1)}>‹</button>
            <button type="button" className="cx-arrow" aria-label="Next billet" onClick={() => step(1)}>›</button>
          </div>
        </div>
        <div className="cx-spec">
          <div className="cx-slots">
            {b.fields.map(([l, v], i) => (
              <div key={i} className={`cx-slot ${isBlank(v) ? "empty" : ""} ${/restriction|cap/i.test(l) ? "limit" : ""}`}>
                <span className="cx-slot-k">{l.toUpperCase()}</span>
                <T className="cx-slot-v">{v || "—"}</T>
              </div>
            ))}
          </div>
          {kits.length > 0 && (
            <div className="cx-kitbox">
              <div className="cx-head">
                <h3 className="cx-h2">KIT CONTENTS</h3>
                <div className="row" role="tablist" aria-label="Kits">
                  {kits.map((k, i) => <button key={k.id} type="button" role="tab" className="chip" aria-selected={i === kitSel} aria-pressed={i === kitSel} onClick={() => { setKitSel(i); setSpinSel(""); }}>{k.name}</button>)}
                </div>
              </div>
              <Inventory kit={kits[Math.min(kitSel, kits.length - 1)]} />
              <a className="cx-link" href={codexHref("kits", kits[Math.min(kitSel, kits.length - 1)].id)}>Resupply rules and compare kits ›</a>
            </div>
          )}
        </div>
      </div>
      <QA qa={B.qa} />
    </>
  );
}
function QA({ qa }) {
  const items = qa.items;
  const retrain = items.filter((t) => /^Retrain|^Platoon Leadership, or S6/i.test(plain(t)));
  const removal = items.filter((t) => /^Removal|^Approval|^\d:|^If approved/i.test(plain(t)));
  const rest = items.filter((t) => !retrain.includes(t) && !removal.includes(t));
  return (
    <section className="cx-panel cx-qa">
      <h2 className="cx-h2">{qa.heading.toUpperCase()}</h2>
      <T as="p" className="cx-body">{qa.intro}</T>
      <div className="cx-grid2">
        <div className="cx-qa-path tone-warn">{retrain.map((t, i) => <T as="p" key={i}>{t}</T>)}</div>
        <div className="cx-qa-path tone-bad">{removal.map((t, i) => <T as="p" key={i}>{t}</T>)}</div>
      </div>
      {rest.map((t, i) => <T as="p" key={i} className="cx-dim">{t}</T>)}
    </section>
  );
}

// ── Kit contents ────────────────────────────────────────────────────────────
function KitsPage({ item }) {
  const K = DATA.kits;
  const [a, setA] = useState(KITS[item] ? item : (K.kits[0] || {}).id);
  const [b, setB] = useState("");
  useEffect(() => { if (KITS[item]) setA(item); }, [item]);
  const kitA = KITS[a] || K.kits[0], kitB = KITS[b];
  return (
    <>
      <PageHead code="KIT" title="BILLET KIT CONTENTS">Pick a kit to see its full contents. Add a second kit to compare: items the other kit doesn't carry are marked.</PageHead>
      <div className="cx-grid-kits">
        <aside className="cx-panel cx-resupply">
          <h2 className="cx-h2">{K.resupply.heading.toUpperCase()}</h2>
          {K.resupply.items.map((t, i) => <T as="p" key={i} className={/^Example/.test(plain(t)) ? "cx-example" : i === K.resupply.items.length - 1 ? "cx-motto" : "cx-body"}>{t}</T>)}
        </aside>
        <div className="stack">
          <div className="cx-kitpick">
            <label className="field">KIT<select id="cx-kit-a" className="input" value={a} onChange={(e) => { setA(e.target.value); history.replaceState(null, "", codexHref("kits", e.target.value)); }}>{K.kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
            <label className="field">COMPARE WITH<select id="cx-kit-b" className="input" value={b} onChange={(e) => setB(e.target.value)}><option value="">No comparison</option>{K.kits.filter((k) => k.id !== a).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          </div>
          <div className={kitB ? "cx-grid2" : ""}>
            {kitA && <section className="cx-panel"><h2 className="cx-h2">{kitA.name.toUpperCase()}</h2><Inventory kit={kitA} other={kitB} /></section>}
            {kitB && <section className="cx-panel"><h2 className="cx-h2">{kitB.name.toUpperCase()}</h2><Inventory kit={kitB} other={kitA} /></section>}
          </div>
          {kitB && <p className="cx-dim"><span className="cx-diffkey" /> Not in the other kit, or a different amount.</p>}
        </div>
      </div>
    </>
  );
}

// ── Uniform ─────────────────────────────────────────────────────────────────
function UniformPage({ item }) {
  const U = DATA.uniform;
  const [tab, setTab] = useState(() => Math.max(0, U.custom.findIndex((c) => c.name === item)));
  const c = U.custom[Math.min(tab, U.custom.length - 1)] || { name: "", rules: [] };
  return (
    <>
      <PageHead code="UNI" title={U.title.toUpperCase()} />
      <div className="cx-grid2">{U.general.map((g, i) => <div key={i} className="cx-callout"><T>{g}</T></div>)}</div>
      <section className="cx-panel">
        <h2 className="cx-h2">ACCESSORIES</h2>
        <div className="cx-acc">
          {U.accessories.map((a, i) => (
            <div key={i} className="cx-acc-card">
              <b>{a.name.toUpperCase()}</b>
              {a.rules.filter(Boolean).map((r, k) => <T as="p" key={k}>{r}</T>)}
            </div>
          ))}
        </div>
      </section>
      <div className="cx-callout warn"><b>{U.exceptions.heading}</b><T>{U.exceptions.text}</T></div>
      <section className="cx-panel">
        <div className="cx-seg" role="tablist" aria-label="Custom rules">
          {U.custom.map((x, i) => <button key={i} role="tab" type="button" aria-selected={i === tab} onClick={() => setTab(i)}>{x.name}</button>)}
        </div>
        <ol className="cx-list cx-rules" key={tab}>{c.rules.map((r, i) => <li key={i}><T>{String(r).replace(/^\s*-\s*/, "").replace(/^(<p[^>]*>)\s*-\s*/, "$1")}</T></li>)}</ol>
      </section>
    </>
  );
}

// ── Rank equivalence ────────────────────────────────────────────────────────
function rankLink(cellText) {
  const m = plain(cellText).match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const abbr = m[1].split("/")[0];
  for (const track of ["infantry", "fynock"]) if ((DATA.ranks[track] || []).some((r) => r.abbr === abbr)) return codexHref("ranks", `${track}:${abbr}`);
  return null;
}
function EquivalencePage() {
  const E = DATA.equivalence;
  const [hover, setHover] = useState(-1);
  const cell = (t) => {
    if (!t) return <span className="cx-dim">—</span>;
    const href = rankLink(t);
    return href ? <a href={href}><T>{t}</T></a> : <T>{t}</T>;
  };
  return (
    <>
      <PageHead code="EQV" title={E.title.toUpperCase()}>Tap a rank to open its entry in Unit Ranks.</PageHead>
      <section className="cx-panel">
        <div className="cx-equiv" role="table" aria-label={E.title}>
          <div className="cx-equiv-row head" role="row"><span role="columnheader">{E.cols[0]}</span><span aria-hidden="true" /><span role="columnheader">{E.cols[1]}</span></div>
          {E.rows.map(([a, b], i) => (
            <div key={i} role="row" className={`cx-equiv-row ${hover === i ? "on" : ""}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
              <span role="cell">{cell(a)}</span><span className="cx-equiv-link" aria-hidden="true">{b ? "⇄" : ""}</span><span role="cell">{cell(b)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────
const PAGES = { points: PointsPage, activity: ActivityPage, discharge: DischargePage, ranks: RanksPage, leadership: LeadershipPage, quals: QualsPage, billets: BilletsPage, kits: KitsPage, uniform: UniformPage, equivalence: EquivalencePage };

const readFlag = (k) => { try { return sessionStorage.getItem(k) === "1"; } catch { return false; } };
const writeFlag = (k, v) => { try { sessionStorage.setItem(k, v ? "1" : "0"); } catch { /* private window */ } };

export default function Codex() {
  const [route, setRoute] = useState(readHash);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState({ canEdit: false, pages: [] });
  const [editMode, setEditModeState] = useState(() => readFlag("cx-edit"));
  const [editing, setEditing] = useState(null); // { key, draft }
  const [dialog, setDialog] = useState("");
  const dirtyRef = useRef(false);
  const reload = useCallback(async () => { setRemote({ ...(await loadCodex()), loaded: true }); }, []);
  useEffect(() => { reload(); }, [reload]);
  const setEditMode = (v) => {
    if (!v && dirtyRef.current && !window.confirm("You have changes that aren't saved. Leave edit mode and throw them away?")) return;
    if (!v) dirtyRef.current = false;
    setEditModeState(v); writeFlag("cx-edit", v); if (!v) setEditing(null); };
  const canEdit = remote.canEdit;
  const inEdit = canEdit && editMode;

  const all = useMemo(() => mergePages(remote.pages || []), [remote]);
  // what's on screen: the saved pages, with the one being edited swapped for its draft
  const shown = useMemo(() => all.map((p) => {
    if (!editing || editing.key !== p.key || !editing.draft) return p;
    const d = editing.draft;
    return { ...p, label: d.label, code: d.code, heading: d.heading, intro: d.intro, blurb: d.blurb, hidden: d.hidden, blocks: d.blocks, draftData: d.data };
  }), [all, editing]);
  const visible = shown.filter((p) => inEdit || !p.hidden);
  const content = useMemo(() => {
    const d = { ...DEFAULT_DATA };
    shown.forEach((p) => { if (p.kind !== "builtin") return; if (p.draftData) d[p.key] = p.draftData; else if (p.savedData) d[p.key] = p.savedData; });
    return d;
  }, [shown]);
  useContent(content);

  useEffect(() => {
    const h = () => {
      const next = readHash();
      if (editing && dirtyRef.current && next.page !== editing.key && !window.confirm("You have changes on this page that aren't saved. Leave and throw them away?")) {
        history.replaceState(null, "", codexHref(editing.key));
        return;
      }
      if (editing && next.page !== editing.key) setEditing(null);
      setRoute(next);
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, [editing]);

  const current = visible.find((p) => p.key === route.page);
  const Page = current && current.kind === "builtin" ? PAGES[current.key] : current ? CustomPage : null;
  useEffect(() => { document.title = current ? `${current.label} · 41st Codex` : "41st Codex"; }, [current]);
  const editingPage = useMemo(() => {
    const p = editing ? all.find((x) => x.key === editing.key) : null;
    return p ? { ...p, data: p.kind === "builtin" ? p.savedData || DEFAULT_DATA[p.key] : null } : null;
  }, [all, editing]);
  return (
    <ImgCtx.Provider value={pic}>
      <div className={`cx ${editing ? "cx-editing" : ""}`}>
        <header className="topbar">
          <div className="topbar-inner">
            <a className="portal-link" href="#portal" title="Back to the unit portal">
              <img src={logo} alt="41st emblem" width="40" height="40" style={{ objectFit: "contain" }} />
              <div className="stack" style={{ gap: 0 }}>
                <span className="cx-brand">41ST ELITE CORPS</span>
                <span className="cx-brand-sub">CODEX · UNIT ARCHIVES</span>
              </div>
            </a>
            <div className="cx-search">
              <span aria-hidden="true">⌕</span>
              <input id="cx-search" type="search" placeholder="Search the Codex: rank, qual, billet, kit item…" aria-label="Search the Codex" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {canEdit && (
              <button type="button" className={`btn btn-sm cx-editbtn ${inEdit ? "on" : ""}`} aria-pressed={inEdit} onClick={() => setEditMode(!inEdit)}>
                {inEdit ? "✎ EDIT MODE ON" : "✎ EDIT"}
              </button>
            )}
            <a className="btn btn-sm" href="#portal">‹ PORTAL</a>
            <a className="btn btn-sm" href="#orbat">ORBAT</a>
          </div>
        </header>
        {inEdit && (
          <div className="cx-editbar" role="region" aria-label="Edit mode">
            <span className="cx-editbar-tag">EDIT MODE</span>
            {current && !editing && <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing({ key: current.key, draft: null })}>✎ EDIT THIS PAGE</button>}
            {!current && !q.trim() && <span className="fx-hint">Open a page to edit it, or:</span>}
            <button type="button" className="btn btn-sm" onClick={() => setDialog("new")}>+ NEW PAGE</button>
            <button type="button" className="btn btn-sm" onClick={() => setDialog("arrange")}>ARRANGE PAGES</button>
            <button type="button" className="btn btn-sm cx-editbar-end" onClick={() => setEditMode(false)}>EXIT EDIT MODE</button>
          </div>
        )}
        <div className="cx-layout">
          <nav className="cx-rail" aria-label="Codex sections">
            <a href={codexHref()} aria-current={!route.page ? "page" : undefined}><span className="cx-code">IDX</span><span>Overview</span></a>
            {visible.map((p) => (
              <a key={p.key} href={codexHref(p.key)} className={p.hidden ? "is-hidden" : ""} aria-current={route.page === p.key ? "page" : undefined} onClick={() => setQ("")}>
                <span className="cx-code">{p.code}</span><span>{p.label}{p.hidden ? " (hidden)" : ""}</span>
              </a>
            ))}
          </nav>
          <main className="cx-main" key={route.page}>
            {q.trim()
              ? <SearchResults q={q.trim()} onPick={() => setQ("")} pages={visible} />
              : Page ? (
                <MetaCtx.Provider value={current}>
                  <Page item={route.item} meta={current} />
                  <Blocks blocks={current.blocks} />
                  {current.kind !== "builtin" && !(current.blocks || []).length && <p className="cx-dim">This page is empty.{inEdit ? " Press EDIT THIS PAGE to add sections." : ""}</p>}
                </MetaCtx.Provider>
              )
                : route.page && remote.loaded && !current
                  ? <section className="cx-panel"><h2 className="cx-h2">PAGE NOT FOUND</h2><p className="cx-dim">That page has moved or been removed. <a href={codexHref()}>Back to the Codex front page</a>.</p></section>
                  : <Overview pages={visible} />}
          </main>
        </div>
        <footer className="cx-foot">41ST ELITE CORPS · KAID BATTALION · THE CODEX KAIDES DEMANDS IT</footer>
        {canEdit && (editing || dialog) && (
          <Suspense fallback={<div className="ed-loading" role="status">Opening the editor…</div>}>
            <Editor
              page={editingPage}
              editing={editing}
              setDraft={(draft) => setEditing((e) => (e ? { ...e, draft } : e))}
              onDirty={(d) => { dirtyRef.current = d; }}
              pages={all}
              dialog={dialog}
              closeDialog={() => setDialog("")}
              closeEditor={() => { dirtyRef.current = false; setEditing(null); }}
              reload={reload}
              openPage={(key) => { setDialog(""); window.location.hash = codexHref(key).slice(1); setEditing({ key, draft: null }); }}
            />
          </Suspense>
        )}
      </div>
    </ImgCtx.Provider>
  );
}

// for go() users elsewhere
export { go as openCodex };
