import { useEffect, useState } from "react";
import { pb, errorMessage } from "../pb.js";

const EVENTS = {
  login: ["SIGNED IN", "#8cc4a2"],
  failed_password: ["WRONG PASSWORD", "#f4e2b0"],
  ip_changed: ["IP CHANGED · SESSION ENDED", "#ff8a80"],
  denied_password_required: ["DISCORD BLOCKED · PASSWORD NEEDED", "#ff8a80"],
  denied_not_in_server: ["DENIED · NOT IN DISCORD", "#ff8a80"],
  credentials_set: ["CREDENTIALS SET", "#a8e6c0"],
  password_changed: ["PASSWORD CHANGED", "#a8e6c0"],
  password_reset_by_admin: ["PASSWORD RESET BY ADMIN", "#ffd8a8"],
  access_removed_left_server: ["ACCESS REMOVED · LEFT DISCORD", "#ff8a80"],
};
const fmt = (iso) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function SecurityLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totalPages: 1 });
  const [only, setOnly] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    pb.collection("security_log")
      .getList(page, 50, { sort: "-created", expand: "user", filter: only ? pb.filter("event = {:e}", { e: only }) : "" })
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [page, only]);

  return (
    <>
      <section className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="row" style={{ gap: 8 }}><span className="admin-tag">ADMIN</span><span className="eyebrow">AUDIT</span></span>
          <h1 className="h1">SECURITY LOG</h1>
        </div>
        <label className="field" style={{ flex: "0 1 300px" }}>SHOW
          <select className="input" value={only} onChange={(e) => { setOnly(e.target.value); setPage(1); }}>
            <option value="">All events</option>
            {Object.entries(EVENTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </section>
      {error && <p className="notice notice-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <section className="panel admin-zone">
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 820 }}>
            <thead><tr><th>TIME</th><th>ACCOUNT</th><th>EVENT</th><th>METHOD</th><th>IP</th><th>PREVIOUS IP</th><th>DETAIL</th></tr></thead>
            <tbody>
              {data.items.map((r) => {
                const [label, color] = EVENTS[r.event] || [r.event.toUpperCase(), "var(--text)"];
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmt(r.created)}</td>
                    <td style={{ fontWeight: 700 }}>{r.expand?.user?.username || "—"}</td>
                    <td className="mono" style={{ fontSize: 12, color }}>{label}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.method || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.ip || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.prev_ip || "—"}</td>
                    <td style={{ fontSize: 14, color: "var(--text-dim)" }}>{r.detail}</td>
                  </tr>
                );
              })}
              {data.items.length === 0 && <tr><td colSpan={7} className="mono" style={{ color: "var(--text-dim)" }}>No events.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>NEWER</button>
          <span className="mono" style={{ fontSize: 12 }}>PAGE {page} / {Math.max(1, data.totalPages)}</span>
          <button type="button" className="btn btn-sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>OLDER</button>
        </div>
      </section>
    </>
  );
}
