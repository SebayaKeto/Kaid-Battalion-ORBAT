// Trooper profiles: the 41st's qualifications and certifications, awarding
// them (from an approved training log, or by hand), revoking them, and the
// public profile page.
//
// Zeus and SULC are ladders: one certification with steps. A trooper holds
// one step; each step up is its own row, so the service record keeps it.
// A revoked award simply stops showing. The note on why stays in the Site Log.

const QUALS = [
  { key: "RFL", code: "RFL", name: "Rifleman", aka: ["gentac", "general tactics", "riflemen"] },
  { key: "MM", code: "MM", name: "Marksman", aka: ["marksmen", "designated marksman"] },
  { key: "CQB", code: "CQB", name: "Close Quarters Battle", aka: ["close quarters combat", "close quarter battle"] },
  { key: "AT", code: "AT", name: "Anti-Tank", aka: ["anti tank", "antitank"] },
  { key: "AR", code: "AR", name: "Auto-Rifleman", aka: ["auto rifleman", "automatic rifleman", "autorifleman"] },
  { key: "GREN", code: "GREN", name: "Grenadier", aka: [] },
  { key: "FU", code: "FU", name: "Force User", aka: [] },
];
const CERTS = [
  { key: "RGR", code: "RGR", name: "Ranger Tab", aka: ["ranger"] },
  { key: "SULC", code: "SULC", name: "Leadership Course", ladder: [
    { name: "Fireteam Leadership", aka: ["ftlc", "fireteam leadership course", "fireteam leader", "fireteam leader course", "sulc fireteam", "sulc 1", "sulc step 1"] },
    { name: "Squad Leadership", aka: ["sulc", "squad leadership course", "squad leader", "squad leader course", "sulc squad", "sulc 2", "sulc step 2"] },
  ] },
  { key: "DO", code: "DO", name: "Clone Drone Operator", aka: ["drone operator"] },
  { key: "RRC", code: "RRC", name: "Ranger Reconnaissance Course", aka: ["ranger recon course", "ranger reconnaissance", "ranger recon"] },
  { key: "EWS", code: "EWS", name: "Electronics Warfare Specialist", aka: ["electronic warfare specialist", "electronic warfare", "electronics warfare"] },
  { key: "ZEUS", code: "", name: "Zeus", ladder: [
    { name: "Apprentice Zeus", aka: ["zeus", "zeus apprentice"] },
    { name: "Journeyman Zeus", aka: ["zeus journeyman"] },
    { name: "Expert Zeus", aka: ["zeus expert"] },
    { name: "Master Zeus", aka: ["zeus master"] },
  ] },
  { key: "FWA", code: "", name: "Fixed Wing Aviation", aka: ["fixed wing"] },
  { key: "ROT", code: "", name: "Rotary Aviation", aka: ["rotary wing aviation"] },
  { key: "BROT", code: "", name: "Basic Rotary", aka: ["basic rotary aviation", "basic rotary wing"] },
  { key: "ARMOR", code: "", name: "Armor Crew", aka: ["armour crew", "armor", "armour"] },
  { key: "MECH", code: "", name: "Mechanized Crew", aka: ["mechanised crew", "mechanized", "mechanised"] },
  { key: "CREW", code: "", name: "Crew Chief", aka: [] },
  { key: "AIRB", code: "", name: "Airborne School", aka: ["airborne"] },
  { key: "LCAV", code: "", name: "Light Cavalry Crewman", aka: ["light cavalry", "light cav crewman", "light cav"] },
  { key: "EMPL", code: "", name: "Emplaced Weapons", aka: ["emplaced weapon", "emplacements"] },
  { key: "ENG", code: "ENG", name: "Clone Combat Engineer", aka: ["combat engineer", "engineer"] },
  { key: "MED", code: "MED", name: "Clone Combat Medic", aka: ["combat medic", "medic"] },
  { key: "RTO", code: "RTO", name: "Clone Field Radio Operator", aka: ["field radio operator", "radio operator"] },
  { key: "DIPLO", code: "", name: "Diplomatic Relations", aka: ["diplomacy"] },
];

function entry(kind, key) {
  return (kind === "qual" ? QUALS : CERTS).filter((x) => x.key === key)[0] || null;
}
// "Marksman (MM)", "Journeyman Zeus", "Squad Leadership (SULC step 2)"
function title(kind, key, level) {
  const e = entry(kind, key);
  if (!e) return key;
  if (e.ladder) {
    const s = e.ladder[Math.max(0, Math.min(level || 0, e.ladder.length - 1))];
    return e.code ? `${s.name} (${e.code} step ${(level || 0) + 1})` : s.name;
  }
  return e.code ? `${e.name} (${e.code})` : e.name;
}
// "Zeus", "Leadership Course (SULC)", "Marksman (MM)"
function baseTitle(kind, key) {
  const e = entry(kind, key);
  if (!e) return key;
  return e.code ? `${e.name} (${e.code})` : e.name;
}
function stepName(key, level) {
  const e = entry("cert", key);
  return e && e.ladder ? e.ladder[level].name.replace(/ Zeus$/, "").replace(/ Leadership$/, "") : "";
}

function catalog() {
  const strip = (e) => ({ key: e.key, code: e.code, name: e.name, steps: e.ladder ? e.ladder.map((s) => s.name) : undefined });
  return { quals: QUALS.map(strip), certs: CERTS.map(strip) };
}

// ── matching a training log's Qualification field ──────────────────────────
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const FILLER = /\b(course|certification|certificate|cert|qualification|qual|training|school|class|awarded|tab)\b/g;
function names() {
  const out = [];
  const push = (kind, key, level, text) => {
    const w = words(text);
    if (!w) return;
    out.push({ kind, key, level, w });
    const bare = w.replace(FILLER, " ").replace(/\s+/g, " ").trim();
    if (bare && bare !== w) out.push({ kind, key, level, w: bare });
  };
  QUALS.forEach((q) => { push("qual", q.key, 0, q.name); push("qual", q.key, 0, q.code); q.aka.forEach((a) => push("qual", q.key, 0, a)); });
  CERTS.forEach((c) => {
    if (c.ladder) c.ladder.forEach((s, i) => { push("cert", c.key, i, s.name); s.aka.forEach((a) => push("cert", c.key, i, a)); });
    else { push("cert", c.key, 0, c.name); if (c.code) push("cert", c.key, 0, c.code); c.aka.forEach((a) => push("cert", c.key, 0, a)); }
  });
  return out;
}
// "Training: Marksman" -> { kind: "qual", key: "MM", level: 0 }, or null
function match(text) {
  const t = words(text);
  if (!t) return null;
  const all = names();
  const tb = t.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  const exact = all.filter((n) => n.w === t || n.w === tb)[0];
  if (exact) return { kind: exact.kind, key: exact.key, level: exact.level };
  // the longest name found as whole words inside the text
  const padded = " " + t + " ";
  let best = null;
  all.forEach((n) => {
    if (padded.indexOf(" " + n.w + " ") !== -1 && (!best || n.w.length > best.w.length)) best = n;
  });
  return best ? { kind: best.kind, key: best.key, level: best.level } : null;
}

// ── who can do what ────────────────────────────────────────────────────────
// Unit Administration (recruitment) adds and revokes by hand. Awarding from a
// log is done by whoever approves the log (points access).
function canManage(auth) {
  return !!auth && (auth.getBool("can_recruitment") || auth.getBool("is_full"));
}

function findOne(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}
const nowText = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const validDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());

function liveRows(app, memberId, kind, key) {
  return app.findRecordsByFilter("trooper_awards", "member = {:m} && kind = {:k} && code = {:c} && revoked = false", "-level,-awarded_on", 0, 0, { m: memberId, k: kind, c: key });
}
// what they hold now: { level } or null
function holding(app, memberId, kind, key) {
  const rows = liveRows(app, memberId, kind, key);
  return rows.length ? { level: rows[0].getInt("level"), row: rows[0] } : null;
}

// Adds one award. Returns "added", "stepped" (moved up a ladder) or "held"
// (already held at this step or higher, nothing written).
function grant(tx, o) {
  const e = entry(o.kind, o.key);
  if (!e) throw new BadRequestError("Pick a qualification or certification from the list.");
  const level = e.ladder ? Math.max(0, Math.min(parseInt(o.level, 10) || 0, e.ladder.length - 1)) : 0;
  const have = holding(tx, o.member.id, o.kind, o.key);
  if (have && (!e.ladder || have.level >= level)) return { status: "held", level: have.level };
  const r = new Record(tx.findCollectionByNameOrId("trooper_awards"));
  r.set("member", o.member.id);
  r.set("kind", o.kind);
  r.set("code", o.key);
  r.set("level", level);
  r.set("awarded_on", o.date);
  r.set("instructor", String(o.instructor || "").slice(0, 300));
  r.set("source", o.event ? "log" : "manual");
  if (o.event) { r.set("event", o.event.id); r.set("event_label", require(`${__hooks}/lib/audit.js`).eventLabel(o.event)); }
  r.set("added_by", o.auth ? o.auth.id : "");
  r.set("added_name", o.actorName || "");
  r.set("revoked", false);
  tx.save(r);
  return { status: have ? "stepped" : "added", level, from: have ? have.level : -1 };
}

function describe(kind, key, res) {
  if (res.status === "stepped") return `${baseTitle(kind, key)}: ${stepName(key, res.from)} → ${stepName(key, res.level)}`;
  return title(kind, key, res.level);
}

// Approving a training log: award the picked qualification or certification
// to the ticked troopers. Rifleman (GENTAC) also promotes a CR to CT.
// award: { kind, key, level, members: [memberId] }. Runs inside the approval.
function awardFromLog(tx, ev, award, auth, actorName) {
  if (!award || !award.key) return { awarded: [], promoted: [] };
  const e = entry(award.kind, award.key);
  if (!e) throw new BadRequestError("Pick a qualification or certification from the list, or Nothing to award.");
  const ids = Array.isArray(award.members) ? award.members.map(String) : [];
  const onLog = {};
  tx.findRecordsByFilter("attendance", "event = {:e}", "", 0, 0, { e: ev.id }).forEach((r) => { if (r.getString("member")) onLog[r.getString("member")] = r; });
  const bad = ids.filter((id) => !onLog[id]);
  if (bad.length) throw new BadRequestError("Only people on this log can be awarded.");
  const instructors = Object.keys(onLog).map((k) => onLog[k]).filter((r) => r.getString("role") === "instructor").map((r) => {
    try { return tx.findRecordById("members", r.getString("member")).getString("display_name"); } catch (_) { return r.getString("name"); }
  }).join(", ");
  const date = ev.getString("event_date").slice(0, 10);
  const audit = require(`${__hooks}/lib/audit.js`);
  const awarded = [];
  const promoted = [];
  const seen = {};
  ids.forEach((id) => {
    if (seen[id]) return;
    seen[id] = true;
    const m = tx.findRecordById("members", id);
    const res = grant(tx, { member: m, kind: award.kind, key: award.key, level: award.level, date, instructor: instructors, event: ev, auth, actorName });
    // named in the approval's own Site Log entry, so no row each here
    if (res.status !== "held") awarded.push(m.getString("display_name"));
    if (award.kind === "qual" && award.key === "RFL" && m.getBool("registered") && m.getString("rank") === "CR") {
      const old = m.getString("display_name");
      m.set("rank", "CT");
      m.set("display_name", `CT-${m.getString("service_number")} "${m.getString("callsign")}"`);
      tx.save(m);
      promoted.push(m.getString("display_name"));
      audit.write(tx, { eventTitle: m.getString("display_name"), member: m.id, action: "member_updated", actor: auth, actorName, detail: `Rank: CR → CT (automatic, passed GENTAC). Was ${old}.` });
    }
  });
  return { awarded, promoted };
}

// Retracting or reopening a log takes its awards off again (quietly).
// Promotions it made are left alone.
function removeForEvent(tx, ev, auth, actorName) {
  const rows = tx.findRecordsByFilter("trooper_awards", "event = {:e} && revoked = false", "", 0, 0, { e: ev.id });
  const names = [];
  rows.forEach((r) => {
    r.set("revoked", true);
    r.set("revoked_at", nowText());
    r.set("revoked_name", actorName || "");
    r.set("revoke_note", "The training log was retracted or reopened.");
    tx.save(r);
    try { names.push(tx.findRecordById("members", r.getString("member")).getString("display_name")); } catch (_) {}
  });
  return rows.length ? ` Took back ${title(rows[0].getString("kind"), rows[0].getString("code"), rows[0].getInt("level"))} from ${names.join(", ")}.` : "";
}

// ── by hand, from a profile ────────────────────────────────────────────────
function addByHand(app, memberId, body, auth) {
  if (!canManage(auth)) throw new ForbiddenError("Unit Administration access needed.");
  const kind = body.kind === "cert" ? "cert" : "qual";
  const key = String(body.key || "");
  const e = entry(kind, key);
  if (!e) throw new BadRequestError("Pick a qualification or certification from the list.");
  const date = String(body.date || "").trim();
  if (!validDay(date)) throw new BadRequestError("Pick the date it was earned.");
  if (date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new BadRequestError("The date can't be in the future.");
  const pts = require(`${__hooks}/lib/points.js`);
  const audit = require(`${__hooks}/lib/audit.js`);
  const actorName = pts.actorLabel(auth);
  let out = {};
  app.runInTransaction((tx) => {
    const m = tx.findRecordById("members", memberId);
    if (!m.getBool("registered")) throw new BadRequestError("Register this trooper first.");
    const res = grant(tx, { member: m, kind, key, level: body.level, date, instructor: String(body.instructor || "").trim(), auth, actorName });
    if (res.status === "held") throw new BadRequestError(e.ladder ? `${m.getString("display_name")} already holds ${title(kind, key, res.level)}. Pick a higher step.` : `${m.getString("display_name")} already holds ${title(kind, key, 0)}.`);
    audit.write(tx, { eventTitle: m.getString("display_name"), member: m.id, action: "award_added", actor: auth, actorName, detail: `${describe(kind, key, res)}, added by hand. Dated ${date}${body.instructor ? `, instructor ${String(body.instructor).trim().slice(0, 100)}` : ""}.` });
    out = { ok: true, name: m.getString("display_name"), award: describe(kind, key, res) };
  });
  return out;
}

// Takes the whole qualification or certification off (every step of a ladder).
function revoke(app, memberId, body, auth) {
  if (!canManage(auth)) throw new ForbiddenError("Unit Administration access needed.");
  const kind = body.kind === "cert" ? "cert" : "qual";
  const key = String(body.key || "");
  if (!entry(kind, key)) throw new BadRequestError("Unknown qualification or certification.");
  const note = String(body.note || "").trim().slice(0, 300);
  const pts = require(`${__hooks}/lib/points.js`);
  const audit = require(`${__hooks}/lib/audit.js`);
  const actorName = pts.actorLabel(auth);
  let out = {};
  app.runInTransaction((tx) => {
    const m = tx.findRecordById("members", memberId);
    const rows = liveRows(tx, m.id, kind, key);
    if (!rows.length) throw new BadRequestError("They don't hold that.");
    const top = rows[0].getInt("level");
    rows.forEach((r) => {
      r.set("revoked", true);
      r.set("revoked_at", nowText());
      r.set("revoked_name", actorName);
      r.set("revoke_note", note);
      tx.save(r);
    });
    audit.write(tx, { eventTitle: m.getString("display_name"), member: m.id, action: "award_revoked", actor: auth, actorName, detail: `${title(kind, key, top)} taken off. It no longer shows on their profile.${note ? " Note: " + note : ""}` });
    out = { ok: true, name: m.getString("display_name"), award: title(kind, key, top) };
  });
  return out;
}

// ── the public profile ─────────────────────────────────────────────────────
const RANKS = ["CR", "CT", "SCT", "VCT", "CLC", "CPL", "CS", "CSS", "CSM", "1SG", "SGM", "BSM", "CL", "CC", "BC"];
const STATUS = { recruit: "Recruit", active: "Active", active_reserve: "Active reserve", inactive_reserve: "Inactive reserve", discharged: "Discharged" };

// promotions, moves and status changes, read from the audit log
function serviceEvents(app, m) {
  const rows = app.findRecordsByFilter("audit_log", "member = {:m} && (action = 'member_registered' || action = 'member_updated' || action = 'member_assigned' || action = 'member_unassigned')", "created", 0, 0, { m: m.id });
  const out = [];
  rows.forEach((r) => {
    const on = r.getString("created").slice(0, 10);
    const by = r.getString("actor_name");
    const d = r.getString("detail");
    const a = r.getString("action");
    if (a === "member_registered") {
      const unit = d.split(",")[0].trim();
      out.push({ on: m.getString("joined_at").slice(0, 10) || on, kind: "join", text: `Registered as ${r.getString("event_title")}${unit && unit !== "No platoon" ? ", " + unit : ""}`, by });
      return;
    }
    if (a === "member_assigned" || a === "member_unassigned") {
      out.push({ on, kind: "move", text: d.replace(/\.$/, ""), by });
      return;
    }
    const auto = /automatic, passed GENTAC/.test(d);
    d.split(/;\s*/).forEach((part) => {
      const x = part.match(/^(Rank|Status|Platoon|Number|Callsign): (.+?) → (.+?)(?: \(.*)?\.?$/);
      if (!x) return;
      const [, f, from, to] = x;
      const tidy = to.replace(/\.$/, "").replace(/\. Was .*$/, "");
      if (f === "Rank") {
        const up = RANKS.indexOf(tidy) > RANKS.indexOf(from);
        out.push({ on, kind: "rank", text: `${up ? "Promoted" : "Rank changed"} ${from} → ${tidy}${auto ? " after passing GENTAC" : ""}`, by: auto ? "automatic" : by });
      } else if (f === "Status") out.push({ on, kind: "status", text: `Status: ${from} → ${tidy}`, by });
      else if (f === "Platoon") out.push({ on, kind: "move", text: `Moved from ${from === "none" ? "no unit" : from} to ${tidy === "none" ? "no unit" : tidy}`, by });
      else out.push({ on, kind: "rename", text: `${f} changed: ${from} → ${tidy}`, by });
    });
  });
  return out;
}

function profile(app, id, auth) {
  let m;
  try { m = app.findRecordById("members", id); } catch (_) { throw new NotFoundError("That trooper isn't on the roster."); }
  if (!m.getBool("registered")) throw new NotFoundError("That trooper isn't on the roster.");

  // awards
  const rows = app.findRecordsByFilter("trooper_awards", "member = {:m} && revoked = false", "awarded_on,created", 0, 0, { m: m.id });
  const quals = [];
  const certs = {};
  const record = serviceEvents(app, m);
  const lastLevel = {};
  rows.forEach((r) => {
    const kind = r.getString("kind"), key = r.getString("code"), level = r.getInt("level");
    if (!entry(kind, key)) return;
    const item = {
      kind, key, level, title: title(kind, key, level), on: r.getString("awarded_on"),
      instructor: r.getString("instructor"), from: r.getString("source"), event: r.getString("event"), eventLabel: r.getString("event_label"), addedBy: r.getString("added_name"),
    };
    const lk = kind + ":" + key;
    const prev = lastLevel[lk];
    lastLevel[lk] = level;
    const by = item.from === "log" ? "from a training log" : item.addedBy;
    if (kind === "qual") { quals.push(item); record.push({ on: item.on, kind: "qual", text: `Qualified: ${item.title}`, by }); return; }
    certs[key] = item;
    if (prev !== undefined && prev < level) record.push({ on: item.on, kind: "cert", text: `${baseTitle(kind, key)}: ${stepName(key, prev)} → ${stepName(key, level)}`, by });
    else record.push({ on: item.on, kind: "cert", text: `Certified: ${item.title}`, by });
  });
  record.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  const rankSince = (record.filter((x) => x.kind === "rank")[0] || {}).on || m.getString("joined_at").slice(0, 10);

  // points
  const camp = require(`${__hooks}/lib/campaigns.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  const today = new Date().toISOString().slice(0, 10);
  const week = camp.monday(today);
  const range = camp.range(app, "");
  const board = pts.leaderboard(app, week, range.from, range.to).filter((x) => x.registered);
  const me = board.filter((x) => x.id === m.id)[0] || { total: 0, recent: 0, allTime: 0 };
  const place = board.filter((x) => x.total > me.total).length + 1;
  const ledger = app.findRecordsByFilter("points", "member = {:m}", "-earned_at", 0, 0, { m: m.id });
  const kinds = { billeted: 0, fill_in: 0, training: 0, adjustment: 0 };
  const weeks = [0, 0, 0, 0, 0, 0, 0, 0];
  const starts = weeks.map((_, i) => camp.addDays(week, -7 * (7 - i)));
  ledger.forEach((p) => {
    const k = p.getString("kind");
    if (kinds[k] !== undefined) kinds[k] += p.getInt("amount");
    if (p.getBool("carried_over")) return;
    const on = (p.getString("earned_at") || p.getString("created")).slice(0, 10);
    for (let i = 0; i < 8; i++) if (on >= starts[i] && on < camp.addDays(starts[i], 7)) weeks[i] += p.getInt("amount");
  });
  const attended = [];
  ledger.forEach((p) => {
    if (attended.length >= 8 || !p.getString("event")) return;
    try {
      const ev = app.findRecordById("events", p.getString("event"));
      attended.push({ title: require(`${__hooks}/lib/audit.js`).eventLabel(ev), on: ev.getString("event_date").slice(0, 10), kind: p.getString("kind") });
    } catch (_) {}
  });

  const staff = canManage(auth);
  return {
    member: {
      id: m.id, name: m.getString("display_name"), rank: m.getString("rank"), number: m.getString("service_number"), callsign: m.getString("callsign"),
      platoon: m.getString("platoon"), status: m.getString("status"), statusLabel: STATUS[m.getString("status")] || "", billet: m.getString("billet"),
      joined: m.getString("joined_at").slice(0, 10), rankSince,
    },
    quals: quals.map((q) => Object.assign({}, q, { event: staff ? q.event : "" })),
    certs: Object.keys(certs).map((k) => certs[k]).sort((a, b) => (a.on < b.on ? 1 : -1)).map((c) => Object.assign({}, c, { event: staff ? c.event : "" })),
    points: {
      campaign: range.campaign ? range.campaign.getString("name") : "", total: me.total, place, of: board.length,
      week: me.recent, allTime: me.allTime, kinds, weeks, weekStarts: starts, attended,
    },
    record,
    canManage: staff,
  };
}

module.exports = { QUALS, CERTS, catalog, match, title, canManage, grant, awardFromLog, removeForEvent, addByHand, revoke, profile, entry };
