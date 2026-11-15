import { useEffect, useState } from "react";
import { pb, errorMessage } from "../pb.js";

const FLAGS = [
  ["is_full", "Full"],
  ["can_points", "Points"],
  ["can_promotions", "Promotions"],
  ["can_transfers", "Transfers"],
  ["can_recruitment", "Recruitment"],
  ["can_assets", "Assets"],
  ["can_approve_assets", "Approve asset types"],
  ["can_manage_logs", "Edit & retract logs"],
  ["can_edit_codex", "Edit Codex"],
];
const blank = { discord_role_id: "", label: "", priority: 0 };

// Unit Leader only: which Discord roles unlock what on the site.
export default function RoleMap({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(blank);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try { setRows(await pb.collection("role_map").getFullList({ sort: "-priority" })); }
    catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (row, key) => {
    try {
      const updated = await pb.collection("role_map").update(row.id, { [key]: !row[key] });
      setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)));
      onChanged?.();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };

  const add = async (ev) => {
    ev.preventDefault();
    try {
      await pb.collection("role_map").create({ ...draft, priority: Number(draft.priority) || 0 });
      setDraft(blank);
      setMsg({ kind: "ok", text: "Role added. Run a sync to apply it to everyone now." });
      load();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove the "${row.label}" mapping? Members with only this role lose its access at the next sync.`)) return;
    try { await pb.collection("role_map").delete(row.id); load(); }
    catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await pb.send("/api/orbat/admin/sync-roles", { method: "POST" });
      setMsg({ kind: "ok", text: `Synced: ${r.updated} updated, ${r.removed} no longer in the Discord, ${r.unchanged} unchanged.` });
      onChanged?.();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
    setSyncing(false);
  };

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 8 }}><span className="admin-tag">ADMIN</span><span className="eyebrow">UNIT LEADER</span></span>
          <h1 className="h1">DISCORD ACCESS</h1>
        </div>
        <button type="button" className="btn btn-admin" onClick={sync} disabled={syncing}>{syncing ? "SYNCING…" : "SYNC ALL MEMBERS NOW"}</button>
      </section>

      {msg.text && <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}

      <section className="panel admin-zone" aria-labelledby="map-title">
        <h2 id="map-title" className="h2" style={{ marginBottom: 6 }}>ROLE MAPPING</h2>
        <p className="mono" style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-dim)" }}>
          Members get every permission from every mapped role they hold. The highest-priority role names their access level. Anyone in the 41st Discord without a mapped role gets read-only Member access.
        </p>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 760 }}>
            <thead>
              <tr><th>ROLE</th><th>DISCORD ROLE ID</th><th>PRIORITY</th>{FLAGS.map(([, l]) => <th key={l}>{l.toUpperCase()}</th>)}<th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700, color: "var(--text-strong)" }}>{r.label}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.discord_role_id}</td>
                  <td className="mono">{r.priority}</td>
                  {FLAGS.map(([k, l]) => (
                    <td key={k}>
                      <button type="button" className={`badge ${r[k] ? "badge-on" : "badge-off"}`} style={{ cursor: "pointer", background: "none", minHeight: 32 }}
                        aria-pressed={r[k]} aria-label={`${l} for ${r.label}`} onClick={() => toggle(r, k)}>{r[k] ? "ON" : "OFF"}</button>
                    </td>
                  ))}
                  <td><button type="button" className="btn btn-sm" onClick={() => remove(r)}>REMOVE</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={add} className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 180px" }}>LABEL
            <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required maxLength={64} />
          </label>
          <label className="field" style={{ flex: "1 1 220px" }}>DISCORD ROLE ID
            <input className="input" inputMode="numeric" pattern="[0-9]+" value={draft.discord_role_id} onChange={(e) => setDraft({ ...draft, discord_role_id: e.target.value.trim() })} required />
          </label>
          <label className="field" style={{ flex: "0 1 110px" }}>PRIORITY
            <input className="input" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-admin">+ ADD ROLE</button>
        </form>
      </section>
    </>
  );
}
