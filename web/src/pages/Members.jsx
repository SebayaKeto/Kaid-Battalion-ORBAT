import { useEffect, useState } from "react";
import { pb, errorMessage } from "../pb.js";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never");

// Staff view of every account and its access. Unit Leaders can reset passwords.
export default function Members({ me }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = async () => {
    try { setRows(await pb.collection("users").getFullList({ sort: "username" })); }
    catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };
  useEffect(() => { load(); }, []);

  const reset = async (u) => {
    if (!window.confirm(`Reset ${u.username}'s password? They'll have to sign in with Discord and choose a new one.`)) return;
    try {
      await pb.send("/api/orbat/admin/reset-password", { method: "POST", body: { userId: u.id } });
      setMsg({ kind: "ok", text: `${u.username} must now sign in with Discord and set a new password.` });
      load();
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
  };

  const shown = rows.filter((u) => !q || `${u.username} ${u.discord_name} ${u.access_label}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 8 }}><span className="admin-tag">ADMIN</span><span className="eyebrow">ACCOUNTS</span></span>
          <h1 className="h1">MEMBERS</h1>
        </div>
        <label className="field" style={{ flex: "0 1 320px" }}>SEARCH
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username, Discord name or access…" />
        </label>
      </section>
      {msg.text && <p className={`notice notice-${msg.kind === "error" ? "error" : "ok"}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
      <section className="panel admin-zone">
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 760 }}>
            <thead><tr><th>USERNAME</th><th>DISCORD</th><th>ACCESS</th><th>STATUS</th><th>LAST SIGN-IN</th>{me.perms.is_full && <th />}</tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700, color: "var(--text-strong)" }}>{u.username}</td>
                  <td>{u.discord_name || (u.discord_id ? "Linked" : "—")}</td>
                  <td><span className={`badge ${u.is_full ? "badge-full" : ""}`}>{(u.access_label || "Member").toUpperCase()}</span></td>
                  <td className="mono" style={{ fontSize: 12, color: !u.has_password ? "#f4e2b0" : u.reauth_required ? "var(--red-text)" : "#8cc4a2" }}>
                    {!u.has_password ? "AWAITING SETUP" : u.reauth_required ? "MUST RE-ENTER PASSWORD" : "ACTIVE"}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmt(u.last_login_at)}</td>
                  {me.perms.is_full && <td>{u.id !== me.id && <button type="button" className="btn btn-sm btn-admin" onClick={() => reset(u)}>RESET PASSWORD</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
