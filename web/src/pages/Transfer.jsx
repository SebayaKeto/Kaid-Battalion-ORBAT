import { useEffect, useState } from "react";
import { pb, errorMessage } from "../pb.js";
import Dialog from "./Dialog.jsx";
import { ORBAT_PLATOONS, TEAMS } from "./Orbat.jsx";

const teamName = (t) => (TEAMS.find(([k]) => k === t) || [, ""])[1];

// Move a trooper to any vacant slot on the ORBAT, or out of their slot into a unit's holding.
export default function TransferDialog({ member, onClose, onDone }) {
  const [layout, setLayout] = useState(null);
  const [unit, setUnit] = useState(member.platoon || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    pb.send("/api/orbat/public/orbat", { method: "GET" }).then(setLayout).catch((err) => setError(errorMessage(err)));
  }, []);

  const where = (sl) => {
    const sec = layout.sections.find((s) => s.id === sl.section);
    const u = sec && layout.units.find((x) => x.id === sec.unit);
    return [u?.name, sec?.name, sl.billet + (sl.team ? ` (${teamName(sl.team)})` : "")].filter(Boolean).join(" · ");
  };
  const current = layout?.slots.find((sl) => sl.member === member.id);

  const go = async (body, label) => {
    setBusy(true);
    setError("");
    try {
      const r = await pb.send(`/api/orbat/members/${member.id}/transfer`, { method: "POST", body });
      onDone(r.changed === false ? "Nothing changed." : `${member.display_name} moved to ${label}.`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  const units = layout ? layout.units.filter((u) => u.platoon === unit) : [];
  const sections = layout ? layout.sections.filter((s) => units.some((u) => u.id === s.unit)).sort((a, b) => a.sort - b.sort) : [];

  return (
    <Dialog title={`TRANSFER · ${member.display_name}`} onClose={onClose}>
      {!layout && !error && <p className="mono" style={{ margin: 0, fontSize: 12 }}>Loading the ORBAT…</p>}
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      {layout && (
        <>
          <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
            NOW: {current ? where(current).toUpperCase() : `${(member.platoon || "NO UNIT").toUpperCase()} · NOT IN A SLOT`}
          </p>
          <label className="field">MOVE TO UNIT
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">No unit</option>
              <optgroup label="Command">{ORBAT_PLATOONS.slice(0, 3).map((p) => <option key={p}>{p}</option>)}</optgroup>
              <optgroup label="Platoons">{ORBAT_PLATOONS.slice(3, 7).map((p) => <option key={p}>{p}</option>)}</optgroup>
              <optgroup label="Special units">{ORBAT_PLATOONS.slice(7).map((p) => <option key={p}>{p}</option>)}</optgroup>
            </select>
          </label>
          <div className="pick-list">
            <button type="button" className="pick" disabled={busy} onClick={() => go({ platoon: unit }, `${unit || "no unit"} holding`)}>
              <span className="slot-text">
                <span className="slot-name">{unit || "No unit"} holding</span>
                <span className="slot-billet">NO SLOT · RECRUITS, UNASSIGNED AND RESERVES</span>
              </span>
            </button>
            {sections.map((s) => {
              const open = layout.slots.filter((sl) => sl.section === s.id && !sl.member).sort((a, b) => a.sort - b.sort);
              if (!open.length) return null;
              return (
                <div key={s.id} className="stack" style={{ gap: 4 }}>
                  <span className="eyebrow" style={{ marginTop: 6 }}>{s.name.toUpperCase()}</span>
                  {open.map((sl) => (
                    <button key={sl.id} type="button" className={`pick${sl.team ? ` slot team-${sl.team}` : ""}`} disabled={busy} onClick={() => go({ slotId: sl.id }, where(sl))}>
                      <span className="slot-text">
                        <span className="slot-name">{sl.billet}{sl.team && <span className="sr-only"> ({teamName(sl.team)} fireteam)</span>}</span>
                        <span className="slot-billet">VACANT</span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
            {unit && sections.every((s) => !layout.slots.some((sl) => sl.section === s.id && !sl.member)) && (
              <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>No vacant slots in {unit}.</p>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
