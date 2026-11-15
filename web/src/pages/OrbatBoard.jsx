import { useEffect, useMemo, useRef, useState } from "react";
import { pb, errorMessage } from "../pb.js";
import { openTrooper } from "../nav.js";
import { RosterList, TrooperForm, RANKS, STATUSES, TEAMS, slotName, canEditDetails } from "./Orbat.jsx";
import Dialog from "./Dialog.jsx";
import TransferDialog from "./Transfer.jsx";

const statusLabel = (s) => (STATUSES.find(([v]) => v === s) || [, "—"])[1];
const nice = (iso) => (iso ? new Date(iso.replace(" ", "T")).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const tag = (m) => (m.service_number ? `${m.service_number}-${m.callsign}` : m.callsign);
const short = (m) => `${m.rank} ${tag(m)}`;
const rankOrder = (r) => -RANKS.indexOf(r);
const byRank = (a, b) => rankOrder(a.rank) - rankOrder(b.rank) || String(a.service_number).localeCompare(String(b.service_number));

function remember(key, value) {
  try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch { /* private window */ }
  return null;
}

// The ORBAT: every unit's command, squads and holding pools, as slots.
export default function Orbat({ me }) {
  const p = me?.perms || {};
  const canPlace = p.is_full || p.can_transfers || p.can_recruitment;
  const canRecruit = p.is_full || p.can_recruitment;
  const canLayout = p.is_full;
  const [data, setData] = useState(null);
  const [view, setView] = useState(() => remember("orbat-view") || "acklay");
  const [assignTo, setAssignTo] = useState(null);
  const [panel, setPanel] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editLayout, setEditLayout] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = async () => {
    try {
      // the same public view everyone gets; staff actions go through their own routes
      const [pub, lb] = await Promise.all([
        pb.send("/api/orbat/public/orbat", { method: "GET" }),
        pb.send("/api/orbat/points/leaderboard", { method: "GET" }),
      ]);
      const { units, sections, slots, members } = pub;
      setData({ units, sections, slots, members, points: Object.fromEntries(lb.rows.map((r) => [r.id, r.allTime])) });
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };
  useEffect(() => { load(); }, []);
  const go = (v) => { setView(v); remember("orbat-view", v); setEditLayout(false); load(); };

  const ix = useMemo(() => {
    if (!data) return null;
    const memberById = Object.fromEntries(data.members.map((m) => [m.id, m]));
    const sectionById = Object.fromEntries(data.sections.map((s) => [s.id, s]));
    const unitById = Object.fromEntries(data.units.map((u) => [u.id, u]));
    const slotOf = {};
    data.slots.forEach((s) => { if (s.member) slotOf[s.member] = s; });
    const where = (slot) => {
      const sec = sectionById[slot.section];
      const unit = sec && unitById[sec.unit];
      return unit ? `${unit.name} · ${sec.name} · ${slotName(slot)}` : slotName(slot);
    };
    return { memberById, sectionById, unitById, slotOf, where };
  }, [data]);

  const assign = async (slot, member) => {
    try {
      const r = await pb.send(`/api/orbat/slots/${slot.id}/assign`, { method: "POST", body: { memberId: member ? member.id : "" } });
      setAssignTo(null);
      setPanel(null);
      setMsg({ kind: "ok", text: member ? `${short(member)} is now ${slotName(slot)}.` : r.changed ? "Slot emptied." : "Nothing changed." });
      load();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); setAssignTo(null); }
  };

  if (!data || !ix) return msg.text ? <p className="notice notice-error" style={{ margin: 0 }}>{msg.text}</p> : <p className="mono" style={{ margin: 0 }}>Loading ORBAT…</p>;

  const nav = [];
  data.units.filter((u) => u.kind !== "command").forEach((u) => {
    let g = nav.find((x) => x.label === u.group_label);
    if (!g) { g = { label: u.group_label, units: [] }; nav.push(g); }
    g.units.push(u);
  });
  const unit = data.units.find((u) => u.key === view && u.kind !== "command");

  return (
    <>
      <nav className="orbat-nav" aria-label="Units">
        <div className="orbat-nav-group">
          <button type="button" aria-current={view === "command" ? "page" : undefined} onClick={() => go("command")} style={{ "--unit": "#c8312b" }}>COMMAND</button>
        </div>
        {nav.map((g) => (
          <div key={g.label} className="orbat-nav-group">
            <span className="orbat-nav-label">{(g.label || "").replace(/^\d\w+ Company · /, "").toUpperCase()}</span>
            {g.units.map((u) => (
              <button key={u.key} type="button" aria-current={view === u.key ? "page" : undefined} onClick={() => go(u.key)}
                style={{ "--unit": u.color || "var(--holo)" }}>
                {(u.platoon || u.name).toUpperCase()}
              </button>
            ))}
          </div>
        ))}
        <div className="orbat-nav-group">
          <button type="button" aria-current={view === "all" ? "page" : undefined} onClick={() => go("all")}>ALL TROOPERS{canRecruit ? " · REGISTER" : ""}</button>
        </div>
      </nav>

      {msg.text && (
        <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"} row`} role="status" style={{ margin: 0, justifyContent: "space-between" }}>
          <span>{msg.text}</span>
          <button type="button" className="btn btn-sm" onClick={() => setMsg({ kind: "", text: "" })}>DISMISS</button>
        </p>
      )}

      {editing && <TrooperForm key={editing.id} mode="edit" member={editing} onCancel={() => setEditing(null)} onDone={(t) => { setEditing(null); setMsg({ kind: "ok", text: t }); load(); }} />}

      {view === "all" && (me ? <RosterList me={me} /> : <PublicList data={data} />)}
      {view === "command" && <CommandPage data={data} ix={ix} canPlace={canPlace} canLayout={canLayout} editLayout={editLayout} setEditLayout={setEditLayout}
        onOpen={setPanel} onAssign={setAssignTo} onLayoutChanged={load} onError={(t) => setMsg({ kind: "error", text: t })} />}
      {unit && (unit.kind === "ranger"
        ? <RangerPage unit={unit} data={data} ix={ix} canPlace={canPlace} canLayout={canLayout} editLayout={editLayout} setEditLayout={setEditLayout}
            onOpen={setPanel} onAssign={setAssignTo} onLayoutChanged={load} onError={(t) => setMsg({ kind: "error", text: t })} />
        : <UnitPage unit={unit} data={data} ix={ix} canPlace={canPlace} canLayout={canLayout} editLayout={editLayout} setEditLayout={setEditLayout}
            onOpen={setPanel} onAssign={setAssignTo} onLayoutChanged={load} onError={(t) => setMsg({ kind: "error", text: t })} />)}

      {transferring && <TransferDialog member={transferring} onClose={() => setTransferring(null)}
        onDone={(t) => { setTransferring(null); setMsg({ kind: "ok", text: t }); load(); }} />}
      {assignTo && <AssignDialog slot={assignTo} unit={ix.unitById[ix.sectionById[assignTo.section]?.unit]} data={data} ix={ix}
        onPick={(m) => assign(assignTo, m)} onClose={() => setAssignTo(null)} />}
      {panel && <TrooperPanel member={panel} ix={ix} points={data.points[panel.id] || 0} canPlace={canPlace} canRecruit={canEditDetails(me)}
        canTransfer={!!(p.is_full || p.can_transfers)} onTransfer={() => { setTransferring(panel); setPanel(null); }}
        onClose={() => setPanel(null)} onVacate={(slot) => assign(slot, null)} onEdit={async () => {
          try { setEditing(await pb.collection("members").getOne(panel.id)); setPanel(null); window.scrollTo(0, 0); }
          catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
        }} />}
    </>
  );
}

// ── one platoon (or Air Wing / Navy) ────────────────────────────────────────
function UnitPage({ unit, data, ix, canPlace, canLayout, editLayout, setEditLayout, onOpen, onAssign, onLayoutChanged, onError }) {
  const own = data.sections.filter((s) => s.unit === unit.id);
  const above = unit.kind === "line"
    ? data.units.filter((u) => u.key === "battalion" || (u.kind === "command" && u.company && u.company === unit.company))
    : [];
  const commandBlocks = [
    ...above.flatMap((u) => data.sections.filter((s) => s.unit === u.id).map((s) => ({ s, color: u.color }))),
    ...own.filter((s) => s.kind === "command").map((s) => ({ s, color: unit.color })),
  ];
  const squads = own.filter((s) => s.kind === "squad");

  // troopers of this unit who aren't in a slot
  const mine = data.members.filter((m) => m.platoon === unit.platoon && m.status !== "discharged");
  const filled = own.reduce((n, s) => n + data.slots.filter((sl) => sl.section === s.id && sl.member).length, 0);
  const total = own.reduce((n, s) => n + data.slots.filter((sl) => sl.section === s.id).length, 0);
  const common = { data, ix, canPlace, editLayout, onOpen, onAssign, onLayoutChanged, onError };

  return (
    <div className="stack unit-page" style={{ "--unit": unit.color || "var(--holo)" }}>
      <div className="row unit-head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{unit.group_label}{unit.subtitle ? ` · ${unit.subtitle}` : ""}</span>
          <h1 className="h1">{unit.name.toUpperCase()}</h1>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{filled} OF {total} SLOTS FILLED</span>
        </div>
        {canLayout && <LayoutToggle on={editLayout} set={setEditLayout} />}
      </div>

      {commandBlocks.length > 0 && (
        <div className="cmd-grid">
          {commandBlocks.map(({ s, color }) => <Section key={s.id} section={s} accent={color} command {...common} />)}
        </div>
      )}
      <div className="sq-grid">
        {squads.map((s) => <Section key={s.id} section={s} accent={unit.color} {...common} />)}
        {editLayout && <AddSection unit={unit} sort={own.length} onDone={onLayoutChanged} onError={onError} />}
      </div>
      <Pools members={mine} data={data} ix={ix} onOpen={onOpen} />
    </div>
  );
}

function TeamTag({ team }) {
  const name = (TEAMS.find(([k]) => k === team) || [, ""])[1];
  return <span className="sr-only"> ({name} fireteam)</span>;
}

// people of a unit who aren't in a slot: recruits, unassigned and reserves
function Pools({ members, data, ix, onOpen }) {
  const pools = [
    { title: "RECRUIT HOLDING", color: "#f0b27a", list: members.filter((m) => m.status === "recruit" && !ix.slotOf[m.id]) },
    { title: "UNASSIGNED", color: "#a8e6c0", list: members.filter((m) => m.status === "active" && !ix.slotOf[m.id]) },
    { title: "ACTIVE RESERVES", color: "#8fd9b0", list: members.filter((m) => m.status === "active_reserve") },
    { title: "INACTIVE RESERVES", color: "#a9bcae", list: members.filter((m) => m.status === "inactive_reserve") },
  ].filter((p) => p.list.length || p.title !== "UNASSIGNED");
  return (
    <div className="hold-grid">
      {pools.map((p) => (
        <section key={p.title} className="hold">
          <h2 className="h2" style={{ color: p.color, fontSize: 11 }}>{p.title} · {p.list.length}</h2>
          {p.list.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>None</p>}
          <ul>
            {p.list.sort(byRank).map((m) => (
              <li key={m.id}><button type="button" className="linkish-plain hold-row" onClick={() => onOpen(m)}><span>{short(m)}</span><span className="slot-pts" title="Total points">{data.points[m.id] || 0}</span></button></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ── Battalion Command and both company commands ─────────────────────────────
function CommandPage({ data, ix, canPlace, canLayout, editLayout, setEditLayout, onOpen, onAssign, onLayoutChanged, onError }) {
  const units = data.units.filter((u) => u.kind === "command");
  const platoons = units.map((u) => u.platoon).filter(Boolean);
  const mine = data.members.filter((m) => platoons.includes(m.platoon) && m.status !== "discharged");
  const ids = units.map((u) => u.id);
  const secs = data.sections.filter((s) => ids.includes(s.unit));
  const filled = data.slots.filter((sl) => secs.some((s) => s.id === sl.section) && sl.member).length;
  const total = data.slots.filter((sl) => secs.some((s) => s.id === sl.section)).length;
  const common = { data, ix, canPlace, editLayout, onOpen, onAssign, onLayoutChanged, onError };
  const byUnit = (u) => data.sections.filter((s) => s.unit === u.id);
  return (
    <div className="stack unit-page" style={{ "--unit": "#c8312b" }}>
      <div className="row unit-head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">ABOVE PLATOON LEVEL</span>
          <h1 className="h1">COMMAND</h1>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{filled} OF {total} SLOTS FILLED</span>
        </div>
        {canLayout && <LayoutToggle on={editLayout} set={setEditLayout} />}
      </div>
      {units.filter((u) => u.key === "battalion").map((u) => (
        <div key={u.id} className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">IN CHARGE OF ALL PLATOONS</span>
          <div className="cmd-grid">{byUnit(u).map((s) => <Section key={s.id} section={s} accent={u.color} command {...common} />)}</div>
        </div>
      ))}
      <div className="cmd-grid">
        {units.filter((u) => u.key !== "battalion").map((u) => {
          const under = data.units.filter((x) => x.kind === "line" && x.company === u.company).map((x) => x.platoon);
          return (
            <div key={u.id} className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{(u.group_label || u.name).toUpperCase()}{under.length ? ` · ${under.join(" & ").toUpperCase()}` : ""}</span>
              {byUnit(u).map((s) => <Section key={s.id} section={s} accent={u.color} command {...common} />)}
            </div>
          );
        })}
      </div>
      <Pools members={mine} data={data} ix={ix} onOpen={onOpen} />
    </div>
  );
}

function LayoutToggle({ on, set }) {
  return (
    <div className="row admin-zone" style={{ padding: 2, gap: 8 }}>
      <span className="admin-tag">ADMIN</span>
      <button type="button" className={`btn btn-sm ${on ? "btn-primary" : "btn-admin"}`} aria-pressed={on} onClick={() => set(!on)}>{on ? "DONE EDITING LAYOUT" : "EDIT LAYOUT"}</button>
    </div>
  );
}

// squad logos are shown from a 128x128 thumbnail, so every logo is the same size whatever was uploaded
const logoUrl = (section) => `/api/files/orbat_sections/${section.id}/${encodeURIComponent(section.logo)}?thumb=128x128f`;

function LogoEdit({ section, save }) {
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const body = new FormData();
    body.append("logo", f);
    save(() => pb.collection("orbat_sections").update(section.id, body));
  };
  return (
    <div className="logo-edit">
      {section.logo ? <img className="sq-logo" src={logoUrl(section)} alt={`${section.name} logo`} /> : <span className="sq-logo sq-logo-empty" aria-hidden="true">NO LOGO</span>}
      <label className="btn btn-sm btn-admin">
        {section.logo ? "CHANGE LOGO" : "+ LOGO"}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={pick} aria-label={`Upload a logo for ${section.name}`} />
      </label>
      {section.logo && <button type="button" className="btn btn-sm" onClick={() => save(() => pb.collection("orbat_sections").update(section.id, { logo: null }))}>REMOVE</button>}
      <span className="logo-hint">PNG, JPG, WEBP or GIF, up to 5 MB. Shown at a fixed size.</span>
    </div>
  );
}

// ── a squad or command block, with its slots ────────────────────────────────
function Section({ section, accent, command, data, ix, canPlace, editLayout, onOpen, onAssign, onLayoutChanged, onError, ranger }) {
  const slots = data.slots.filter((s) => s.section === section.id);
  const save = async (fn) => { try { await fn(); onLayoutChanged(); } catch (err) { onError(errorMessage(err)); } };
  // drag a slot's handle (or use the arrows) to change the order
  const [dragId, setDragId] = useState("");
  const [overId, setOverId] = useState("");
  const move = (id, toIndex) => {
    const ids = slots.map((s) => s.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id);
    if (ids.join() === slots.map((s) => s.id).join()) return;
    save(() => pb.send(`/api/orbat/sections/${section.id}/reorder`, { method: "POST", body: { slotIds: ids } }));
  };
  return (
    <section className={`sq${command ? " sq-cmd" : ""}`} style={{ "--accent": accent || "var(--holo)" }}>
      <div className="sq-head">
        {editLayout
          ? <input className="input input-sm" defaultValue={section.name} aria-label="Section name" maxLength={60}
              onBlur={(e) => e.target.value.trim() && e.target.value !== section.name && save(() => pb.collection("orbat_sections").update(section.id, { name: e.target.value.trim() }))} />
          : <h2 className="h2">{section.name.toUpperCase()}</h2>}
        {ranger && !editLayout && section.code && <span className="sq-code">{section.code}</span>}
        {ranger && editLayout && <input className="input input-sm" style={{ maxWidth: 140 }} defaultValue={section.code} placeholder="Callsign" aria-label="Callsign"
          onBlur={(e) => e.target.value !== section.code && save(() => pb.collection("orbat_sections").update(section.id, { code: e.target.value.trim() }))} />}
        {!editLayout && section.logo && <img className="sq-logo" src={logoUrl(section)} alt="" />}
      </div>
      {editLayout && <LogoEdit section={section} save={save} />}
      {slots.map((slot, i) => {
        const m = slot.member && ix.memberById[slot.member];
        if (editLayout) {
          return (
            <div key={slot.id} className={`slot-edit${dragId === slot.id ? " dragging" : ""}${overId === slot.id && dragId !== slot.id ? " drop-here" : ""}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(slot.id); } }}
              onDragLeave={() => setOverId((o) => (o === slot.id ? "" : o))}
              onDrop={(e) => { e.preventDefault(); const from = slots.findIndex((s) => s.id === dragId); if (dragId && from !== -1) move(dragId, i); setDragId(""); setOverId(""); }}>
              <span className="drag-handle" draggable title="Drag to reorder" aria-hidden="true"
                onDragStart={(e) => { setDragId(slot.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", slot.id); const row = e.currentTarget.parentElement; if (row) e.dataTransfer.setDragImage(row, 20, 20); }}
                onDragEnd={() => { setDragId(""); setOverId(""); }}>⠿</span>
              <input className="input input-sm" defaultValue={slot.billet} aria-label="Billet" maxLength={60}
                onBlur={(e) => e.target.value.trim() && e.target.value !== slot.billet && save(() => pb.collection("orbat_slots").update(slot.id, { billet: e.target.value.trim() }))} />
              <span className="row slot-arrows" style={{ gap: 2 }}>
                <button type="button" className="btn btn-sm btn-icon" disabled={i === 0} onClick={() => move(slot.id, i - 1)} aria-label={`Move ${slot.billet} up`}>▲</button>
                <button type="button" className="btn btn-sm btn-icon" disabled={i === slots.length - 1} onClick={() => move(slot.id, i + 1)} aria-label={`Move ${slot.billet} down`}>▼</button>
              </span>
              <select className={`input input-sm team-pick team-${slot.team || "none"}`} value={slot.team || ""} aria-label={`Fireteam colour for ${slot.billet}`}
                onChange={(e) => save(() => pb.collection("orbat_slots").update(slot.id, { team: e.target.value }))}>
                {TEAMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <span className="mono slot-edit-who">{m ? short(m) : "vacant"}</span>
              <button type="button" className="btn btn-sm" disabled={!!m} title={m ? "Move the trooper out first" : undefined}
                onClick={() => save(() => pb.collection("orbat_slots").delete(slot.id))} aria-label={`Delete ${slot.billet} slot`}>DELETE</button>
            </div>
          );
        }
        return m ? (
          <button key={slot.id} type="button" className={`slot${slot.team ? ` team-${slot.team}` : ""}`} onClick={() => onOpen(m)}>
            <span className="rank-chip">{m.rank}</span>
            <span className="slot-text">
              <span className="slot-name">{tag(m)}</span>
              <span className="slot-billet">{slot.billet.toUpperCase()}{slot.team && <TeamTag team={slot.team} />}</span>
            </span>
            <span className="slot-pts" title="Total points">{data.points[m.id] || 0}<small>PTS</small></span>
          </button>
        ) : (
          <div key={slot.id} className={`slot slot-vacant${slot.team ? ` team-${slot.team}` : ""}`}>
            <span>{slot.billet.toUpperCase()}{slot.team && <TeamTag team={slot.team} />} · {ranger ? "UNFILLED" : "VACANT"}</span>
            {canPlace && <button type="button" className="btn btn-sm btn-admin" onClick={() => onAssign(slot)} aria-label={`Assign ${slotName(slot)} in ${section.name}`}>+ ASSIGN</button>}
          </div>
        );
      })}
      {editLayout && (
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-admin" onClick={() => save(() => pb.collection("orbat_slots").create({ section: section.id, billet: ranger ? "Ranger" : "Trooper", sort: slots.length }))}>+ SLOT</button>
          <button type="button" className="btn btn-sm" disabled={slots.some((s) => s.member)} title={slots.some((s) => s.member) ? "Move everyone out first" : undefined}
            onClick={() => window.confirm(`Delete ${section.name} and its empty slots?`) && save(() => pb.collection("orbat_sections").delete(section.id))}>DELETE SECTION</button>
        </div>
      )}
    </section>
  );
}

function AddSection({ unit, sort, onDone, onError }) {
  const [name, setName] = useState("");
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await pb.collection("orbat_sections").create({ unit: unit.id, name: name.trim(), kind: "squad", sort }); setName(""); onDone(); }
    catch (err) { onError(errorMessage(err)); }
  };
  return (
    <form onSubmit={add} className="sq admin-zone stack" style={{ gap: 8 }}>
      <label className="field">NEW SECTION
        <input className="input input-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Delta Squad" />
      </label>
      <button type="submit" className="btn btn-sm btn-admin">+ ADD SECTION</button>
    </form>
  );
}

// ── Ranger: restricted compartment ──────────────────────────────────────────
function RangerPage({ unit, data, ix, canPlace, canLayout, editLayout, setEditLayout, onOpen, onAssign, onLayoutChanged, onError }) {
  const [gate, setGate] = useState(() => remember("ranger-cleared") !== "1");
  useEffect(() => {
    if (!gate) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => { setGate(false); remember("ranger-cleared", "1"); }, reduce ? 0 : 1600);
    return () => clearTimeout(t);
  }, [gate]);
  const squads = data.sections.filter((s) => s.unit === unit.id);
  const common = { data, ix, canPlace, editLayout, onOpen, onAssign, onLayoutChanged, onError, ranger: true };
  return (
    <div className="ranger">
      {gate && (
        <div className="ranger-gate" aria-hidden="true">
          <span style={{ color: "#e0443a" }}>RESTRICTED COMPARTMENT · RANGER</span>
          <span>VERIFYING CLEARANCE …</span>
          <div className="ranger-bar"><div /></div>
        </div>
      )}
      <div className="hazard" aria-hidden="true" />
      <div className="ranger-banner"><span>TOP SECRET // RANGER</span><span>ACCESS IS LOGGED</span></div>
      <div className="ranger-body stack">
        <div className="ranger-head">
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow" style={{ color: "#87957f" }}>FILE 41-R · {(unit.subtitle || "SPECIAL OPERATIONS").toUpperCase()}</span>
            <h1 className="h1" style={{ color: "#e6eedc", letterSpacing: ".18em" }}>{unit.name.toUpperCase()}</h1>
          </div>
          <div className="stamp" aria-label="Classified">CLASSIFIED</div>
          {canLayout && <LayoutToggle on={editLayout} set={setEditLayout} />}
        </div>
        <div className="sq-grid">
          {squads.map((s) => <Section key={s.id} section={s} accent={s.code === "EYES ONLY" ? "#8f1f19" : "#3e5a44"} {...common} />)}
          {editLayout && <AddSection unit={unit} sort={squads.length} onDone={onLayoutChanged} onError={onError} />}
        </div>
        <section className="sq" style={{ borderTop: "2px solid #8f1f19" }}>
          <h2 className="h2" style={{ color: "#e6eedc" }}>RANGER TAB HOLDERS · CLEARED FOR TASKING</h2>
          <p className="mono" style={{ margin: 0, fontSize: 12, color: "#87957f" }}>This list fills itself from the Ranger Tab award once awards are added to service records.</p>
        </section>
      </div>
      <div className="hazard" aria-hidden="true" />
    </div>
  );
}

// ── pick a trooper for a slot ───────────────────────────────────────────────
function AssignDialog({ slot, unit, data, ix, onPick, onClose }) {
  const [q, setQ] = useState("");
  const home = unit?.platoon || "";
  const list = data.members
    .filter((m) => m.status !== "discharged")
    .filter((m) => !q || `${m.display_name} ${m.platoon}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.platoon === home) - (a.platoon === home) || (!!ix.slotOf[a.id]) - (!!ix.slotOf[b.id]) || byRank(a, b))
    .slice(0, 60);
  return (
    <Dialog title={`ASSIGN · ${slotName(slot).toUpperCase()}`} onClose={onClose}>
      <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>{ix.where(slot)}. Picking someone already in a slot moves them here.</p>
      <label className="field">SEARCH
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number or platoon…" />
      </label>
      <div className="pick-list">
        {list.map((m) => {
          const at = ix.slotOf[m.id];
          return (
            <button key={m.id} type="button" className="pick" onClick={() => onPick(m)}>
              <span className="rank-chip">{m.rank}</span>
              <span className="slot-text">
                <span className="slot-name">{tag(m)}</span>
                <span className="slot-billet">{at ? `NOW: ${ix.where(at).toUpperCase()}` : `${(m.platoon || "NO PLATOON").toUpperCase()} · ${statusLabel(m.status).toUpperCase()}`}</span>
              </span>
            </button>
          );
        })}
        {list.length === 0 && <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Nobody matches. Register troopers under ALL TROOPERS first.</p>}
      </div>
    </Dialog>
  );
}

// ── a trooper's card ────────────────────────────────────────────────────────
function TrooperPanel({ member: m, ix, points, canPlace, canRecruit, canTransfer, onTransfer, onClose, onVacate, onEdit }) {
  const at = ix.slotOf[m.id];
  return (
    <Dialog title={m.display_name} onClose={onClose}>
      <dl className="facts">
        <dt>STATUS</dt><dd>{statusLabel(m.status)}</dd>
        <dt>PLATOON</dt><dd>{m.platoon || "None"}</dd>
        <dt>POSITION</dt><dd>{at ? ix.where(at) : "Not in a slot"}</dd>
        <dt>JOINED</dt><dd>{nice(m.joined_at)}</dd>
        <dt>POINTS</dt><dd className="pts">{points}</dd>
      </dl>
      <div className="row"><button type="button" className="btn btn-sm btn-primary" onClick={() => { onClose(); openTrooper(m.id); }}>OPEN PROFILE</button>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>Qualifications, certifications, points and service record.</span></div>
      {(canPlace || canRecruit || canTransfer) && (
        <div className="row admin-zone" style={{ padding: 4 }}>
          <span className="admin-tag">ADMIN</span>
          {canTransfer && m.status !== "discharged" && <button type="button" className="btn btn-sm btn-primary" onClick={onTransfer}>TRANSFER</button>}
          {canPlace && at && <button type="button" className="btn btn-sm btn-admin" onClick={() => onVacate(at)}>REMOVE FROM SLOT</button>}
          {canRecruit && <button type="button" className="btn btn-sm btn-admin" onClick={onEdit}>EDIT DETAILS</button>}
        </div>
      )}
    </Dialog>
  );
}

// Everyone's view of the full roster (no admin tools).
function PublicList({ data }) {
  const [q, setQ] = useState("");
  const rows = data.members
    .filter((m) => m.status !== "discharged")
    .filter((m) => !q || `${m.display_name} ${m.billet} ${m.platoon}`.toLowerCase().includes(q.toLowerCase()))
    .sort(byRank);
  const platoons = [...new Set(data.units.filter((u) => u.platoon).map((u) => u.platoon)), ""];
  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">{rows.length} TROOPERS SERVING</span>
          <h1 className="h1">ALL TROOPERS</h1>
        </div>
        <label className="field" style={{ flex: "0 1 300px" }}>SEARCH
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, number, billet…" />
        </label>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 600 }}>
            <thead><tr><th>RANK</th><th>NUMBER</th><th>CALLSIGN</th><th>STATUS</th><th>BILLET</th><th>JOINED</th><th>POINTS</th></tr></thead>
            <tbody>
              {platoons.map((pl) => {
                const g = rows.filter((m) => (m.platoon || "") === pl);
                if (!g.length) return null;
                return [
                  <tr key={"h" + pl} className="group-row"><td colSpan={7}>{(pl || "No platoon").toUpperCase()} · {g.length}</td></tr>,
                  ...g.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.rank}</td>
                      <td className="mono">{m.service_number}</td>
                      <td><button type="button" className="tp-link" onClick={() => openTrooper(m.id)} aria-label={`Open ${m.display_name}'s profile`}>{m.callsign}</button></td>
                      <td><span className={`tag tag-st-${m.status}`}>{statusLabel(m.status).toUpperCase()}</span></td>
                      <td>{m.billet || "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{nice(m.joined_at)}</td>
                      <td className="pts">{data.points[m.id] || 0}</td>
                    </tr>
                  )),
                ];
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="mono" style={{ color: "var(--text-dim)" }}>Nobody on the roster yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
