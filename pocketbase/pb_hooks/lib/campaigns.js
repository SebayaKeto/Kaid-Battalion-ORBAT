// Campaigns (date ranges for points) and the rolling points calendar.

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + "T00:00:00Z");
const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
// Monday of the week a date falls in
function monday(s) {
  const d = parse(s);
  return addDays(s, -((d.getUTCDay() + 6) % 7));
}
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;

function canManage(auth) {
  return !!auth && (auth.getBool("is_full") || auth.getBool("can_points"));
}
function list(app) {
  return app.findRecordsByFilter("campaigns", "id != ''", "-starts_on", 0, 0).map((c) => ({
    id: c.id, name: c.getString("name"), startsOn: c.getString("starts_on"), endsOn: c.getString("ends_on"),
    current: !c.getString("ends_on"),
  }));
}

function current(app) {
  try { return app.findFirstRecordByFilter("campaigns", "ends_on = ''"); } catch (_) { return null; }
}

function cleanName(v) {
  const name = String(v || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) throw new BadRequestError("Give the campaign a name of 2 to 80 characters.");
  return name;
}

// Ends the current campaign the day before startsOn and opens a new one.
function start(app, body, auth) {
  if (!canManage(auth)) throw new ForbiddenError("Points access needed.");
  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  const name = cleanName(body.name);
  const startsOn = String(body.startsOn || "").trim();
  if (!validDate(startsOn)) throw new BadRequestError("Pick the date the new campaign starts.");
  let out = {};
  app.runInTransaction((tx) => {
    const cur = current(tx);
    if (cur && startsOn <= cur.getString("starts_on")) {
      throw new BadRequestError(`The new campaign has to start after ${cur.getString("name")} started (${cur.getString("starts_on")}).`);
    }
    if (cur) {
      cur.set("ends_on", addDays(startsOn, -1));
      tx.save(cur);
    }
    const r = new Record(tx.findCollectionByNameOrId("campaigns"));
    r.load({ name, starts_on: startsOn, ends_on: "" });
    tx.save(r);
    audit.write(tx, {
      eventTitle: name, action: "campaign_started", actor: auth, actorName: pts.actorLabel(auth),
      detail: `${name} starts ${startsOn}.` + (cur ? ` ${cur.getString("name")} ends ${cur.getString("ends_on")}.` : ""),
    });
    out = { id: r.id, name };
  });
  return out;
}

function rename(app, id, body, auth) {
  if (!canManage(auth)) throw new ForbiddenError("Points access needed.");
  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  const c = app.findRecordById("campaigns", id);
  const name = cleanName(body.name);
  const before = c.getString("name");
  if (before === name) return { changed: false };
  c.set("name", name);
  app.save(c);
  audit.write(app, { eventTitle: name, action: "campaign_renamed", actor: auth, actorName: pts.actorLabel(auth), detail: `Renamed from ${before} to ${name}.` });
  return { changed: true };
}

// date range of a campaign as [from, toExclusive] ("" = open-ended)
function range(app, id) {
  const c = id ? app.findRecordById("campaigns", id) : current(app);
  if (!c) return { campaign: null, from: "1970-01-01", to: "" };
  const end = c.getString("ends_on");
  return { campaign: c, from: c.getString("starts_on"), to: end ? addDays(end, 1) : "" };
}

// ── the calendar ───────────────────────────────────────────────────────────
// Battalion Command, Company Command, then the platoons in this order.
const GROUPS = ["Battalion Command", "Company Command", "Acklay", "Banshee", "Chimaera", "Drexl", "Rangers", "Air Wing", "Navy", "Unassigned"];

function groupOf(m, unit) {
  if (unit && unit.key === "battalion") return "Battalion Command";
  if (unit && unit.kind === "command") return "Company Command";
  // Ranger, Air Wing and Navy slots count there even if their platoon field says otherwise
  if (unit && unit.kind === "ranger") return "Rangers";
  if (unit && unit.key === "airwing") return "Air Wing";
  if (unit && unit.key === "navy") return "Navy";
  const p = m.platoon;
  if (p === "Battalion Command") return "Battalion Command";
  if (p === "Katarn Company" || p === "Tusken Company") return "Company Command";
  if (p === "Ranger") return "Rangers";
  return GROUPS.indexOf(p) > 1 ? p : "Unassigned";
}

// weeks: 1 before this week, this week, 6 after
function calendar(app, today) {
  const { RANKS } = require(`${__hooks}/lib/roster.js`);
  const thisWeek = monday(today || iso(new Date()));
  const weeks = [];
  for (let i = -1; i <= 6; i++) weeks.push(addDays(thisWeek, i * 7));
  const from = weeks[0];
  const to = addDays(weeks[weeks.length - 1], 7);

  // where each trooper sits on the ORBAT
  const units = {};
  app.findAllRecords("orbat_units").forEach((u) => { units[u.id] = { key: u.getString("key"), kind: u.getString("kind") }; });
  const sectionUnit = {};
  app.findAllRecords("orbat_sections").forEach((s) => { sectionUnit[s.id] = units[s.getString("unit")]; });
  const slotUnit = {};
  app.findRecordsByFilter("orbat_slots", "member != ''", "", 0, 0).forEach((s) => { slotUnit[s.getString("member")] = sectionUnit[s.getString("section")]; });

  const people = app.findRecordsByFilter("members", "registered = true && status != 'discharged'", "", 0, 0).map((m) => {
    const row = {
      id: m.id, rank: m.getString("rank"), number: m.getString("service_number"), callsign: m.getString("callsign"),
      platoon: m.getString("platoon"), status: m.getString("status"), billet: m.getString("billet"), weeks: {},
    };
    row.group = groupOf(row, slotUnit[m.id]);
    return row;
  });
  const byId = {};
  people.forEach((p) => { byId[p.id] = p; });

  const pts = arrayOf(new DynamicModel({ member: "", day: "", kind: "", amount: 0 }));
  app.db().newQuery(
    "SELECT member, substr(COALESCE(NULLIF(earned_at, ''), created), 1, 10) AS day, COALESCE(kind, '') AS kind, SUM(amount) AS amount FROM points " +
    "WHERE COALESCE(carried_over, FALSE) = FALSE AND COALESCE(NULLIF(earned_at, ''), created) >= {:from} AND COALESCE(NULLIF(earned_at, ''), created) < {:to} GROUP BY member, day, kind"
  ).bind({ from: from + " 00:00:00.000Z", to: to + " 00:00:00.000Z" }).all(pts);
  pts.forEach((r) => {
    const p = byId[r.member];
    if (!p) return;
    const w = monday(r.day);
    const cell = p.weeks[w] = p.weeks[w] || { total: 0, billeted: 0, fillIn: 0, training: 0, adjustment: 0 };
    const k = { billeted: "billeted", fill_in: "fillIn", training: "training" }[r.kind] || "adjustment";
    cell[k] += r.amount;
    cell.total += r.amount;
  });
  const rankIx = (r) => RANKS.indexOf(r);
  people.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || rankIx(b.rank) - rankIx(a.rank) || a.number.localeCompare(b.number));
  return { weeks, thisWeek, groups: GROUPS, people };
}

module.exports = { list, current, start, rename, range, calendar, monday, addDays, canManage };
