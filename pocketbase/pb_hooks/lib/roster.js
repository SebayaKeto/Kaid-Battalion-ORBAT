// Player registration and edits. Names follow the 41st format RANK-1234 "Callsign".

const RANKS = ["CR", "CT", "SCT", "VCT", "CLC", "CPL", "CS", "CSS", "CSM", "1SG", "SGM", "BSM", "CL", "CC", "BC"];
const PLATOONS = ["Battalion Command", "Katarn Company", "Tusken Company", "Acklay", "Chimaera", "Banshee", "Drexl", "Ranger", "Air Wing", "Navy", ""];
const STATUSES = ["recruit", "active", "active_reserve", "inactive_reserve", "discharged"];

function canRecruit(auth) {
  return !!auth && (auth.getBool("can_recruitment") || auth.getBool("is_full"));
}

function displayName(rank, number, callsign) {
  return `${rank}-${number} "${callsign}"`;
}

function findOne(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

// checks the form and returns clean values, or throws with a message for the form
// Another registered trooper (any status, discharged too) already using this
// number or callsign. Names and numbers are never re-used.
function clashes(app, number, callsign, selfId) {
  const out = {};
  if (number) {
    const n = findOne(app, "members", "service_number = {:n} && registered = true && id != {:id}", { n: number, id: selfId || "" });
    if (n) out.number = { id: n.id, name: n.getString("display_name"), status: n.getString("status") };
  }
  if (callsign) {
    const c = findOne(app, "members", "callsign:lower = {:c} && registered = true && id != {:id}", { c: callsign.toLowerCase(), id: selfId || "" });
    if (c) out.callsign = { id: c.id, name: c.getString("display_name"), status: c.getString("status") };
  }
  return out;
}
const was = (st) => (st === "discharged" ? " (discharged)" : "");

function clean(app, body, selfId, before) {
  const rank = String(body.rank || "").trim().toUpperCase();
  if (RANKS.indexOf(rank) === -1) throw new BadRequestError("Pick a rank from the list.");
  const number = String(body.number || "").trim();
  if (!/^\d{4}$/.test(number)) throw new BadRequestError("The service number must be four digits, like 7567.");
  const callsign = String(body.callsign || "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  if (callsign.length < 2 || callsign.length > 40) throw new BadRequestError("The callsign must be 2 to 40 characters.");
  const platoon = String(body.platoon || "");
  if (PLATOONS.indexOf(platoon) === -1) throw new BadRequestError("Pick a platoon from the list.");
  const status = String(body.status || "recruit");
  if (STATUSES.indexOf(status) === -1) throw new BadRequestError("Pick a status from the list.");
  const discordId = String(body.discordId || "").trim();
  if (discordId && !/^\d{1,25}$/.test(discordId)) throw new BadRequestError("That isn't a Discord user ID.");
  const steamId = String(body.steamId || "").trim();
  if (steamId && !/^\d{17}$/.test(steamId)) throw new BadRequestError("A Steam ID is 17 digits (SteamID64), like 76561198000000000.");
  const joined = String(body.joinedAt || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joined)) throw new BadRequestError("Pick the date they joined.");

  // when editing, only a changed number or callsign is checked, so troopers who
  // already shared one before this rule can still be edited
  const c = clashes(app,
    before && before.number === number ? "" : number,
    before && before.callsign.toLowerCase() === callsign.toLowerCase() ? "" : callsign, selfId);
  if (c.number) throw new BadRequestError(`Number ${number} is already used by ${c.number.name}${was(c.number.status)}. Numbers can't be re-used.`);
  if (c.callsign) throw new BadRequestError(`The callsign ${callsign} is already used by ${c.callsign.name}${was(c.callsign.status)}. Callsigns can't be re-used.`);
  if (discordId) {
    const other = findOne(app, "members", "discord_id = {:d} && id != {:id} && registered = true", { d: discordId, id: selfId || "" });
    if (other) throw new BadRequestError(`That Discord account is already registered as ${other.getString("display_name")}.`);
  }
  return {
    rank, number, callsign, platoon, status, discordId, steamId,
    joined: joined + " 12:00:00.000Z",
    billet: String(body.billet || "").trim().slice(0, 100),
  };
}

function apply(m, v) {
  m.set("display_name", displayName(v.rank, v.number, v.callsign));
  m.set("rank", v.rank);
  m.set("service_number", v.number);
  m.set("callsign", v.callsign);
  m.set("platoon", v.platoon);
  m.set("status", v.status);
  m.set("active", v.status !== "discharged" && v.status !== "inactive_reserve");
  m.set("discord_id", v.discordId);
  m.set("steam_id", v.steamId);
  m.set("joined_at", v.joined);
  m.set("billet", v.billet);
}

// New trooper, or completes a record the site made from a training log.
// Optional starting points (default none) go in the points ledger.
function register(app, body, auth) {
  if (!canRecruit(auth)) throw new ForbiddenError("Recruitment access needed.");
  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  const startPoints = body.startingPoints === undefined || body.startingPoints === "" ? 0 : Number(body.startingPoints);
  if (!Number.isInteger(startPoints) || startPoints < 0 || startPoints > 10000) throw new BadRequestError("Starting points must be a whole number from 0 to 10000.");
  const pointsReason = String(body.pointsReason || "").trim().slice(0, 300) || "Starting points on registration";
  // ticked by default; unticked keeps them out of weekly and campaign totals
  const inTotals = body.countInTotals === undefined ? true : !!body.countInTotals;
  let out = {};
  app.runInTransaction((tx) => {
    // an existing unregistered record: picked on the form, or found by Discord ID
    let m = null;
    if (body.memberId) m = tx.findRecordById("members", String(body.memberId));
    const v = clean(tx, body, m ? m.id : "");
    if (!m && v.discordId) m = findOne(tx, "members", "discord_id = {:d}", { d: v.discordId });
    if (m && m.getBool("registered")) throw new BadRequestError(`${m.getString("display_name")} is already registered. Edit them instead.`);
    const existing = !!m;
    if (!m) m = new Record(tx.findCollectionByNameOrId("members"));
    const hadPoints = existing ? tx.findRecordsByFilter("points", "member = {:m}", "", 0, 0, { m: m.id }).reduce((n, p) => n + p.getInt("amount"), 0) : 0;
    apply(m, v);
    m.set("source", "registered");
    m.set("registered", true);
    m.set("registered_by", auth.id);
    m.set("registered_at", new Date().toISOString().replace("T", " "));
    tx.save(m);

    if (startPoints > 0) {
      const p = new Record(tx.findCollectionByNameOrId("points"));
      p.set("member", m.id);
      p.set("amount", startPoints);
      p.set("category", "manual");
      p.set("kind", "adjustment");
      p.set("carried_over", !inTotals);
      p.set("reason", pointsReason);
      p.set("earned_at", new Date().toISOString().replace("T", " "));
      p.set("awarded_by", auth.id);
      tx.save(p);
    }
    const bits = [`${v.platoon || "No platoon"}`, statusLabel(v.status)];
    if (v.billet) bits.push(v.billet);
    bits.push(startPoints > 0 ? `starting with ${startPoints} ${startPoints === 1 ? "point" : "points"} (${pointsReason}${inTotals ? "" : "; all-time only, not in weekly or campaign totals"})` : "no starting points");
    if (hadPoints) bits.push(`keeps ${hadPoints} from earlier logs`);
    audit.write(tx, { eventTitle: m.getString("display_name"), member: m.id, action: "member_registered", actor: auth, actorName: pts.actorLabel(auth), detail: bits.join(", ") + "." });
    out = { id: m.id, name: m.getString("display_name"), points: hadPoints + startPoints, linked: existing };
  });
  return out;
}

const LABELS = { rank: "Rank", service_number: "Number", callsign: "Callsign", platoon: "Platoon", status: "Status", billet: "Billet", discord_id: "Discord", steam_id: "Steam", joined_at: "Joined" };

function update(app, id, body, auth) {
  if (!canRecruit(auth)) throw new ForbiddenError("Recruitment access needed.");
  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  let out = {};
  app.runInTransaction((tx) => {
    const m = tx.findRecordById("members", id);
    if (!m.getBool("registered")) throw new BadRequestError("Register this person first.");
    const v = clean(tx, body, m.id, { number: m.getString("service_number"), callsign: m.getString("callsign") });
    const before = {};
    Object.keys(LABELS).forEach((f) => { before[f] = m.getString(f); });
    apply(m, v);
    // reserves and discharged troopers don't hold a slot
    if (["active_reserve", "inactive_reserve", "discharged"].indexOf(v.status) !== -1) {
      tx.findRecordsByFilter("orbat_slots", "member = {:m}", "", 1, 0, { m: m.id }).forEach((sl) => {
        sl.set("member", "");
        tx.save(sl);
        m.set("billet", "");
      });
    }
    tx.save(m);
    const show = (f, val) => (f === "joined_at" ? String(val).slice(0, 10) : f === "status" ? statusLabel(val) : val) || "none";
    const changes = Object.keys(LABELS).filter((f) => before[f] !== m.getString(f))
      .map((f) => `${LABELS[f]}: ${show(f, before[f])} → ${show(f, m.getString(f))}`);
    if (changes.length) audit.write(tx, { eventTitle: m.getString("display_name"), member: m.id, action: "member_updated", actor: auth, actorName: pts.actorLabel(auth), detail: changes.join("; ") });
    out = { id: m.id, name: m.getString("display_name"), changed: changes.length };
  });
  return out;
}

function canPlace(auth) {
  return !!auth && (auth.getBool("is_full") || auth.getBool("can_transfers") || auth.getBool("can_recruitment"));
}

const TEAMS = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };
// "Medic (Blue)" for a slot on the blue fireteam, "Medic" with no colour
function slotBillet(slot) {
  const t = TEAMS[slot.getString("team")];
  return slot.getString("billet") + (t ? ` (${t})` : "");
}

// "Acklay Platoon · Alpha Squad · Trooper"
function slotLabel(app, slot) {
  const sec = app.findRecordById("orbat_sections", slot.getString("section"));
  const unit = app.findRecordById("orbat_units", sec.getString("unit"));
  return { text: `${unit.getString("name")} · ${sec.getString("name")} · ${slotBillet(slot)}`, unit };
}

// Put a trooper in a slot (moving them out of any other), or empty the slot.
function assignSlot(app, slotId, memberId, auth) {
  if (!canPlace(auth)) throw new ForbiddenError("Transfers or recruitment access needed.");
  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  let out = {};
  app.runInTransaction((tx) => {
    const slot = tx.findRecordById("orbat_slots", slotId);
    const here = slotLabel(tx, slot);
    const who = { actor: auth, actorName: pts.actorLabel(auth) };
    const prevId = slot.getString("member");
    if (!memberId) {
      if (!prevId) { out = { changed: false }; return; }
      const prev = tx.findRecordById("members", prevId);
      slot.set("member", "");
      tx.save(slot);
      prev.set("billet", "");
      tx.save(prev);
      audit.write(tx, Object.assign({ eventTitle: prev.getString("display_name"), member: prev.id, action: "member_unassigned", detail: "Removed from " + here.text + "." }, who));
      out = { changed: true };
      return;
    }
    const m = tx.findRecordById("members", String(memberId));
    if (!m.getBool("registered")) throw new BadRequestError("Register this person before placing them on the ORBAT.");
    if (m.getString("status") === "discharged") throw new BadRequestError(`${m.getString("display_name")} is discharged.`);
    if (prevId === m.id) { out = { changed: false }; return; }
    if (prevId) throw new BadRequestError("That slot is taken. Remove the trooper in it first.");
    // leave their old slot
    let from = "";
    const old = tx.findRecordsByFilter("orbat_slots", "member = {:m}", "", 1, 0, { m: m.id });
    if (old.length) {
      from = slotLabel(tx, old[0]).text;
      old[0].set("member", "");
      tx.save(old[0]);
    }
    slot.set("member", m.id);
    tx.save(slot);
    m.set("billet", slotBillet(slot));
    // a slot in a line platoon, a command element, Air Wing or Navy makes that their platoon
    const unitPlatoon = here.unit.getString("platoon");
    const kind = here.unit.getString("kind");
    if (unitPlatoon && (kind === "line" || kind === "special" || kind === "command")) m.set("platoon", unitPlatoon);
    if (m.getString("status") === "active_reserve" || m.getString("status") === "inactive_reserve") m.set("status", "active");
    tx.save(m);
    audit.write(tx, Object.assign({
      eventTitle: m.getString("display_name"), member: m.id, action: "member_assigned",
      detail: (from ? `Moved from ${from} to ` : "Placed in ") + here.text + ".",
    }, who));
    out = { changed: true, name: m.getString("display_name"), slot: here.text };
  });
  return out;
}

function canTransfer(auth) {
  return !!auth && (auth.getBool("is_full") || auth.getBool("can_transfers"));
}

// Transfer: into a vacant slot (anywhere), or out of their slot into a unit's holding.
function transfer(app, id, body, auth) {
  if (!canTransfer(auth)) throw new ForbiddenError("Transfers access needed.");
  const slotId = String(body.slotId || "");
  if (slotId) return assignSlot(app, slotId, id, auth);
  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  const platoon = String(body.platoon === undefined ? "" : body.platoon);
  if (PLATOONS.indexOf(platoon) === -1) throw new BadRequestError("Pick a unit from the list.");
  let out = {};
  app.runInTransaction((tx) => {
    const m = tx.findRecordById("members", id);
    if (!m.getBool("registered")) throw new BadRequestError("Register this person first.");
    const old = tx.findRecordsByFilter("orbat_slots", "member = {:m}", "", 1, 0, { m: m.id });
    const from = old.length ? slotLabel(tx, old[0]).text : (m.getString("platoon") || "no unit") + " holding";
    if (!old.length && m.getString("platoon") === platoon) { out = { changed: false }; return; }
    if (old.length) { old[0].set("member", ""); tx.save(old[0]); }
    m.set("billet", "");
    m.set("platoon", platoon);
    tx.save(m);
    const to = (platoon || "no unit") + " holding";
    audit.write(tx, { eventTitle: m.getString("display_name"), member: m.id, action: "member_assigned", actor: auth, actorName: pts.actorLabel(auth), detail: `Moved from ${from} to ${to}.` });
    out = { changed: true, name: m.getString("display_name"), slot: to };
  });
  return out;
}

function statusLabel(s) {
  return { recruit: "Recruit", active: "Active", active_reserve: "Active reserve", inactive_reserve: "Inactive reserve", discharged: "Discharged" }[s] || s;
}

module.exports = { clashes, transfer, canTransfer, slotBillet, RANKS, PLATOONS, STATUSES, canRecruit, canPlace, assignSlot, register, update, statusLabel };
