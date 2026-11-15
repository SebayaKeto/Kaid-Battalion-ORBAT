// Points tracking helpers: turning Discord log posts into pending events,
// approving events into points, and the leaderboard.

function findOne(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function memberByDiscord(app, discordId) {
  return discordId ? findOne(app, "members", "discord_id = {:d}", { d: discordId }) : null;
}

// Case-insensitive exact match on the roster name.
function memberByName(app, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  let rows = [];
  try { rows = app.findRecordsByFilter("members", "display_name ~ {:n}", "", 20, 0, { n }); } catch (_) {}
  for (let i = 0; i < rows.length; i++) if (rows[i].getString("display_name").toLowerCase() === n) return rows[i];
  return null;
}

// number + name from the display name, unless an admin already set them
function setIdentity(m) {
  const { identity } = require(`${__hooks}/lib/logparse.js`);
  const who = identity(m.getString("display_name"));
  if (who.number && !m.getString("service_number")) m.set("service_number", who.number);
  if (who.number && who.name && !m.getString("callsign")) m.set("callsign", who.name);
}

// Someone mentioned in a log who isn't on the roster yet gets a member
// record straight away, marked as added from Discord.
function ensureMember(app, discordId, name) {
  let m = memberByDiscord(app, discordId);
  const clean = String(name || "").trim().slice(0, 100);
  if (m) {
    if (clean && m.getString("source") === "discord" && m.getString("display_name").indexOf("Discord user ") === 0) {
      m.set("display_name", clean);
      setIdentity(m);
      app.save(m);
    }
    return m;
  }
  m = new Record(app.findCollectionByNameOrId("members"));
  m.set("display_name", clean || "Discord user " + discordId);
  setIdentity(m);
  m.set("discord_id", discordId);
  m.set("source", "discord");
  m.set("active", true);
  app.save(m);
  return m;
}

// ── Discord name directory (filled by the bot) ─────────────────────────────
// quote a name in a note, unless it already carries quotes (CPL-7567 "Rex")
function q(name) { return /["“”'‘’]/.test(name) ? name : `"${name}"`; }
function lc(v) { return String(v || "").trim().toLowerCase(); }
function tokens(v) { return lc(v).split(/[^a-z0-9']+/).filter(Boolean); }

// rows: [{ id, displayName, username, globalName }]
function upsertDirectory(app, rows) {
  const col = app.findCollectionByNameOrId("discord_members");
  let saved = 0;
  (Array.isArray(rows) ? rows : []).slice(0, 1000).forEach((r) => {
    const id = String(r.id || "");
    if (!/^\d+$/.test(id)) return;
    let rec = findOne(app, "discord_members", "discord_id = {:d}", { d: id });
    const vals = {
      display_name: String(r.displayName || "").slice(0, 100),
      username: String(r.username || "").slice(0, 100),
      global_name: String(r.globalName || "").slice(0, 100),
    };
    const inServer = r.left ? false : true;
    if (rec && rec.getString("display_name") === vals.display_name && rec.getString("username") === vals.username &&
        rec.getString("global_name") === vals.global_name && rec.getBool("in_server") === inServer) return;
    if (!rec) { rec = new Record(col); rec.set("discord_id", id); }
    if (!r.left || !rec.getString("display_name")) {
      rec.set("display_name", vals.display_name);
      rec.set("username", vals.username);
      rec.set("global_name", vals.global_name);
      rec.set("display_lc", lc(vals.display_name));
      rec.set("username_lc", lc(vals.username));
      rec.set("global_lc", lc(vals.global_name));
    }
    const { identity } = require(`${__hooks}/lib/logparse.js`);
    const who = identity(rec.getString("display_name") || rec.getString("global_name"));
    rec.set("service_number", who.number);
    rec.set("callsign_lc", who.number ? who.name : "");
    rec.set("in_server", inServer);
    app.save(rec);
    saved++;
    // keep auto-added roster names in step with Discord nicknames
    const m = memberByDiscord(app, id);
    if (m && m.getString("source") === "discord" && vals.display_name && m.getString("display_name") !== vals.display_name) {
      m.set("display_name", vals.display_name);
      setIdentity(m);
      app.save(m);
    }
  });
  return saved;
}

// Plain-text name from a log → roster member.
// 41st names look like CPL-7567 "Rex": the four-digit number and the name are
// what count, rank is ignored. Order of checks:
//   1. number + name both match one person (no note)
//   2. only the number, or only the name, matches one person (matched, with a note to check)
//   3. a unique partial match on their Discord name (matched, with a note)
// Returns { member, note } (member null when nobody fits).
function resolveName(app, name, allowPartial) {
  const { identity } = require(`${__hooks}/lib/logparse.js`);
  const who = identity(name);
  const find = (col, filter, params) => { try { return app.findRecordsByFilter(col, filter, "", 20, 0, params); } catch (_) { return []; } };
  const label = (r) => r.getString("display_name") || r.getString("username");
  // people the site knows: roster members without Discord, plus everyone in the Discord
  const people = (memberFilter, dirFilter, params) => {
    const out = [];
    const seen = {};
    find("discord_members", "in_server = true && (" + dirFilter + ")", params).forEach((d) => {
      seen[d.getString("discord_id")] = true;
      out.push({ label: label(d), toMember: () => ensureMember(app, d.getString("discord_id"), d.getString("display_name")) });
    });
    find("members", memberFilter, params).forEach((m) => {
      if (m.getString("discord_id") && seen[m.getString("discord_id")]) return;
      out.push({ label: m.getString("display_name"), toMember: () => m });
    });
    return out;
  };
  const one = (list, note) => (list.length === 1 ? { member: list[0].toMember(), note: note ? note(list[0]) : "" } : null);
  const several = (list) => `${q(name)} could be ${list.slice(0, 4).map((x) => x.label).join(", ")}${list.length > 4 ? "…" : ""}. Pick the right one before approving.`;

  if (who.number) {
    const both = who.name ? people("service_number = {:n} && callsign:lower = {:c}", "service_number = {:n} && callsign_lc = {:c}", { n: who.number, c: who.name }) : [];
    const exactBoth = one(both);
    if (exactBoth) return exactBoth;
    if (both.length > 1) return { member: null, note: several(both) };
    const byNumber = people("service_number = {:n}", "service_number = {:n}", { n: who.number });
    if (byNumber.length > 1) return { member: null, note: several(byNumber) };
    if (byNumber.length === 1) {
      return one(byNumber, (x) => (who.name ? `${q(name)}: ${who.number} belongs to ${x.label}, but the name doesn't match. Check that's right.` : ""));
    }
    if (who.name) {
      const byName = people("callsign:lower = {:c}", "callsign_lc = {:c}", { c: who.name });
      if (byName.length === 1) return one(byName, (x) => `${q(name)}: nobody has the number ${who.number}, so this was matched by name to ${x.label}. Check that's right.`);
      if (byName.length > 1) return { member: null, note: several(byName) };
    }
    return { member: null, note: "" };
  }

  const n = who.name;
  if (!n) return { member: null, note: "" };
  const onRoster = memberByName(app, n);
  if (onRoster) return { member: onRoster, note: "" };
  const exact = people("callsign:lower = {:n}", "callsign_lc = {:n} || display_lc = {:n} || username_lc = {:n} || global_lc = {:n}", { n });
  if (exact.length === 1) return one(exact);
  if (exact.length > 1) return { member: null, note: several(exact) };
  if (!allowPartial) return { member: null, note: "" };
  const want = tokens(n);
  if (!want.length || want.join("").length < 3) return { member: null, note: "" };
  const cands = find("discord_members", "in_server = true && (display_lc ~ {:t} || global_lc ~ {:t} || username_lc ~ {:t})", { t: want[want.length - 1] });
  const hits = cands.filter((c) => {
    const have = tokens(c.getString("display_name")).concat(tokens(c.getString("global_name")), tokens(c.getString("username")));
    return want.every((t) => have.indexOf(t) !== -1);
  });
  if (hits.length === 1) {
    const dn = label(hits[0]);
    return { member: ensureMember(app, hits[0].getString("discord_id"), hits[0].getString("display_name")), note: `Matched ${q(name)} to ${dn}. Check that's right.` };
  }
  if (hits.length > 1) return { member: null, note: several(hits.map((h) => ({ label: label(h) }))) };
  return { member: null, note: "" };
}

// how a site user is named in the audit log: their Discord name, else username
function actorLabel(auth) {
  if (!auth) return "";
  return auth.getString("discord_name") || auth.getString("username");
}

function dayToDate(day) {
  return day + " 12:00:00.000Z";
}

// body: { messageId, channelId, authorId, authorName, content, postedAt, mentions: {id: name} }
function ingestLog(app, body) {
  const o = require(`${__hooks}/lib/orbat.js`);
  const { parseLog } = require(`${__hooks}/lib/logparse.js`);
  const cfg = o.config();
  const messageId = String(body.messageId || "");
  const channelId = String(body.channelId || "");
  if (!/^\d+$/.test(messageId) || !/^\d+$/.test(channelId)) throw new BadRequestError("messageId and channelId are required.");
  // logs are usually posted inside threads, so the parent channel decides
  const parentId = String(body.parentId || "");
  const type = cfg.logChannels[channelId] || (parentId ? cfg.logChannels[parentId] : "");
  if (!type) return { status: "not_watched" };

  const content = String(body.content || "").slice(0, 6000);
  const mentions = body.mentions && typeof body.mentions === "object" ? body.mentions : {};
  const existing = findOne(app, "events", "discord_message_id = {:m}", { m: messageId });
  const parsed = parseLog(content, body.postedAt);

  const audit = require(`${__hooks}/lib/audit.js`);
  const actorName = ("Discord · " + String(body.authorName || "unknown")).slice(0, 100);
  const status = existing ? existing.getString("status") : "";

  // approved or denied: the post can't change anything now, but the edit is kept on record
  if (status === "approved" || status === "denied" || status === "retracted") {
    const last = findOne(app, "audit_log", "event = {:e} && action = 'post_edited_after_review'", { e: existing.id });
    let lastText = existing.getString("raw_text");
    try {
      const rows = app.findRecordsByFilter("audit_log", "event = {:e} && action = 'post_edited_after_review'", "-created", 1, 0, { e: existing.id });
      if (rows.length) lastText = rows[0].getString("after_text");
    } catch (_) {}
    if (content === lastText) return { status: "already_reviewed", eventId: existing.id };
    audit.write(app, {
      event: existing, action: "post_edited_after_review", actorName,
      detail: "Edited after it was " + status + ". Nothing on the site changed.",
      before: lastText, after: content,
    });
    return { status: "already_reviewed", eventId: existing.id, editedAfterReview: true, firstEdit: !last };
  }
  if (!parsed) {
    if (status === "pending") {
      existing.set("status", "withdrawn");
      existing.set("review_note", "The Discord post was edited and is no longer a log.");
      existing.set("bot_notified", false);
      app.save(existing);
      audit.write(app, { event: existing, action: "withdrawn", actorName, detail: "The post was edited and is no longer a log.", before: existing.getString("raw_text"), after: content });
      return { status: "removed", eventId: existing.id };
    }
    return { status: "not_a_log" };
  }
  if (status === "pending" && existing.getString("raw_text") === content) return { status: "unchanged", eventId: existing.id };
  const reopened = status === "withdrawn";

  let eventId = "";
  app.runInTransaction((tx) => {
    const ev = existing ? tx.findRecordById("events", existing.id) : new Record(tx.findCollectionByNameOrId("events"));
    ev.set("type", type);
    ev.set("title", parsed.qualification);
    ev.set("qualification", parsed.qualification);
    ev.set("event_date", dayToDate(parsed.date));
    ev.set("date_needs_check", !!parsed.dateNeedsCheck);
    ev.set("source", "discord");
    ev.set("status", "pending");
    ev.set("discord_message_id", messageId);
    ev.set("discord_channel_id", channelId);
    ev.set("discord_author_id", String(body.authorId || "").slice(0, 32));
    ev.set("discord_author_name", String(body.authorName || "").slice(0, 100));
    ev.set("raw_text", content);
    ev.set("bot_notified", false);

    // who was there, in order: instructors, trainees, then anyone only listed for points
    const notes = parsed.notes.slice();
    const rows = [];
    const byKey = {};
    const noted = {};
    const resolveText = (name) => {
      // "Rex Fives Echo" written without commas: split it if every word is a known person
      const whole = resolveName(tx, name, true);
      if (whole.member || !/\S\s+\S/.test(name) || /\d|["“”'‘’]/.test(name)) return [{ name, r: whole }];
      const parts = name.split(/\s+/);
      const each = parts.map((p) => ({ name: p, r: resolveName(tx, p, true) }));
      return each.every((x) => x.r.member) ? each : [{ name, r: whole }];
    };
    const add = (name, member, discordId, role) => {
      const key = member ? "m:" + member.id : "n:" + lc(name);
      if (byKey[key]) return byKey[key];
      const row = { member: member ? member.id : "", name, discord_id: discordId || (member ? member.getString("discord_id") : ""), role, award: false };
      byKey[key] = row;
      rows.push(row);
      return row;
    };
    const addPeople = (list, role, award) => {
      list.ids.forEach((id) => {
        const member = ensureMember(tx, id, mentions[id]);
        const row = add(mentions[id] || member.getString("display_name"), member, id, role);
        if (award) row.award = true;
      });
      list.names.forEach((raw) => {
        resolveText(raw).forEach(({ name, r }) => {
          // one note per person, however many times they're named
          const noteKey = r.member ? "m:" + r.member.id : "n:" + lc(name);
          if (r.note && !noted[noteKey]) { noted[noteKey] = true; notes.push(r.note); }
          const row = add(name, r.member, "", role);
          if (award) row.award = true;
        });
      });
    };
    addPeople(parsed.instructors, "instructor", false);
    addPeople(parsed.trainees, "trainee", false);
    addPeople(parsed.awarded, "attendee", true);
    rows.filter((r) => r.award && !r.member).forEach((r) => {
      const msg = `${q(r.name)} isn't on the roster or in the Discord. Pick the right member before approving.`;
      if (!noted["n:" + lc(r.name)]) { noted["n:" + lc(r.name)] = true; notes.push(msg); }
    });

    ev.set("parse_notes", notes);
    if (reopened) { ev.set("review_note", ""); ev.set("reviewed_by", ""); ev.set("reviewed_at", ""); }
    tx.save(ev);
    eventId = ev.id;

    const summary = `${rows.length} ${rows.length === 1 ? "person" : "people"} named, ${rows.filter((r) => r.award).length} for points, dated ${audit.day(parsed.date + " 12:00:00Z")}${parsed.dateNeedsCheck ? " (needs checking)" : ""}.`;
    if (!existing) audit.write(tx, { event: ev, action: "logged", actorName, detail: "Logged in Discord. " + summary, after: content });
    else if (reopened) audit.write(tx, { event: ev, action: "reopened", actorName, detail: "The post was edited back into a log. " + summary, before: existing.getString("raw_text"), after: content });
    else audit.write(tx, { event: ev, action: "post_edited", actorName, detail: "The post was edited, so the log was read again. " + summary, before: existing.getString("raw_text"), after: content });

    if (existing) {
      tx.findRecordsByFilter("attendance", "event = {:e}", "", 0, 0, { e: ev.id }).forEach((r) => tx.delete(r));
    }
    const col = tx.findCollectionByNameOrId("attendance");
    rows.forEach((row) => {
      const a = new Record(col);
      a.set("event", ev.id);
      a.set("member", row.member);
      a.set("name", row.name);
      a.set("discord_id", row.discord_id);
      a.set("role", row.role);
      a.set("award_point", row.award);
      tx.save(a);
    });
  });
  return { status: !existing ? "created" : reopened ? "reopened" : "updated", eventId, dateProblem: !!parsed.dateNeedsCheck };
}

// Approve: every ticked attendee gets exactly 1 point. Deny: nothing.
// award (optional): { kind, key, level, members } — a qualification or
// certification for the ticked troopers, see lib/awards.js
function reviewEvent(app, eventId, decision, note, auth, award) {
  if (decision !== "approve" && decision !== "deny") throw new BadRequestError("Choose approve or deny.");
  const why = String(note || "").trim().slice(0, 500);
  if (decision === "deny" && why.length < 3) throw new BadRequestError("Give a reason for the denial. The person who logged it will see it in Discord.");
  const audit = require(`${__hooks}/lib/audit.js`);
  let result = { points: 0, awarded: [], promoted: [] };
  const names = [];
  app.runInTransaction((tx) => {
    const ev = tx.findRecordById("events", eventId);
    if (ev.getString("status") !== "pending") throw new BadRequestError("This event has already been reviewed.");
    const rows = tx.findRecordsByFilter("attendance", "event = {:e}", "", 0, 0, { e: ev.id });
    if (decision === "approve") {
      if (ev.getBool("date_needs_check")) throw new BadRequestError("Check the date and confirm it before approving.");
      const missing = rows.filter((r) => r.getBool("award_point") && !r.getString("member")).map((r) => r.getString("name"));
      if (missing.length) throw new BadRequestError("Pick a roster member for: " + missing.join(", ") + ".");
      const col = tx.findCollectionByNameOrId("points");
      const isOp = ev.getString("type") === "operation";
      const host = ev.getString("host_platoon");
      const given = {};
      rows.forEach((r) => {
        const m = r.getString("member");
        if (!r.getBool("award_point") || given[m]) return;
        given[m] = true;
        const p = new Record(col);
        p.set("member", m);
        p.set("event", ev.id);
        p.set("amount", 1);
        p.set("category", "attendance");
        p.set("kind", pointKind(isOp, host, tx.findRecordById("members", m).getString("platoon")));
        p.set("reason", (ev.getString("type") === "operation" ? "Operation" : "Training") + (ev.getString("title") ? ": " + ev.getString("title") : ""));
        p.set("earned_at", ev.getString("event_date"));
        p.set("awarded_by", auth.id);
        tx.save(p);
        result.points++;
        try { names.push(tx.findRecordById("members", m).getString("display_name")); } catch (_) {}
      });
    }
    let awardText = "";
    if (decision === "approve" && award && award.key) {
      const aw = require(`${__hooks}/lib/awards.js`);
      const got = aw.awardFromLog(tx, ev, award, auth, actorLabel(auth));
      result.awarded = got.awarded;
      result.promoted = got.promoted;
      if (got.awarded.length) awardText = ` ${aw.title(award.kind, award.key, parseInt(award.level, 10) || 0)} to ${got.awarded.join(", ")}.`;
      if (got.promoted.length) awardText += ` Promoted to CT: ${got.promoted.join(", ")}.`;
    }
    ev.set("status", decision === "approve" ? "approved" : "denied");
    ev.set("reviewed_by", auth.id);
    ev.set("reviewed_at", new Date().toISOString().replace("T", " "));
    ev.set("review_note", why);
    ev.set("bot_notified", false);
    tx.save(ev);
    const detail = decision === "approve"
      ? `${result.points} ${result.points === 1 ? "point" : "points"}${names.length ? ": " + names.join(", ") : ""}.${awardText}${why ? " Note: " + why : ""}`
      : "Reason: " + why;
    audit.write(tx, { event: ev, action: decision === "approve" ? "approved" : "denied", actor: auth, actorName: actorLabel(auth), detail });
  });
  return result;
}

// a point from an operation hosted by another platoon is a fill-in;
// one with no host platoon, or the trooper's own, counts as billeted.
// Battalion Command is billeted on every op, company command on their two platoons'.
const COMMAND_OVER = { "Katarn Company": ["Acklay", "Chimaera"], "Tusken Company": ["Banshee", "Drexl"] };
function pointKind(isOperation, hostPlatoon, memberPlatoon) {
  if (!isOperation) return "training";
  if (!hostPlatoon || hostPlatoon === memberPlatoon || memberPlatoon === "Battalion Command") return "billeted";
  return (COMMAND_OVER[memberPlatoon] || []).indexOf(hostPlatoon) !== -1 ? "billeted" : "fill_in";
}

function adjustPoints(app, memberId, amount, reason, auth) {
  const n = parseInt(amount, 10);
  if (!n || Math.abs(n) > 100) throw new BadRequestError("Amount must be a whole number between -100 and 100, not 0.");
  const why = String(reason || "").trim();
  if (why.length < 3) throw new BadRequestError("Give a reason for the adjustment.");
  const member = app.findRecordById("members", String(memberId || ""));
  const p = new Record(app.findCollectionByNameOrId("points"));
  p.set("member", member.id);
  p.set("amount", n);
  p.set("category", "manual");
  p.set("kind", "adjustment");
  p.set("reason", why.slice(0, 300));
  p.set("earned_at", new Date().toISOString().replace("T", " "));
  p.set("awarded_by", auth.id);
  app.save(p);
  require(`${__hooks}/lib/audit.js`).write(app, {
    eventTitle: "Manual adjustment", member: member.id, action: "points_adjusted", actor: auth, actorName: actorLabel(auth),
    detail: `${n > 0 ? "+" + n : n} for ${member.getString("display_name")}. Reason: ${why.slice(0, 300)}`,
  });
  return { id: p.id };
}

// Totals for every member, plus points since `since` (YYYY-MM-DD).
// totals inside a campaign's dates (from, toExclusive; "" = open-ended), plus this week and all time
function leaderboard(app, since, from, to) {
  const rows = arrayOf(new DynamicModel({ id: "", display_name: "", platoon: "", discord_id: "", registered: false, total: 0, recent: 0, all_time: 0, billeted: 0, fill_in: 0, training: 0, adjustment: 0 }));
  const at = "COALESCE(NULLIF(p.earned_at, ''), p.created)";
  // carried-over starting points only count all-time
  const live = "COALESCE(p.carried_over, FALSE) = FALSE";
  const inRange = `${live} AND ${at} >= {:from}` + (to ? ` AND ${at} < {:to}` : "");
  app.db().newQuery(
    "SELECT m.id, m.display_name, m.platoon, m.discord_id, COALESCE(m.registered, FALSE) AS registered, " +
    `COALESCE(SUM(CASE WHEN ${inRange} THEN p.amount ELSE 0 END), 0) AS total, ` +
    `COALESCE(SUM(CASE WHEN ${live} AND ${at} >= {:since} THEN p.amount ELSE 0 END), 0) AS recent, ` +
    ["billeted", "fill_in", "training", "adjustment"].map((k) => `COALESCE(SUM(CASE WHEN ${inRange} AND p.kind = '${k}' THEN p.amount ELSE 0 END), 0) AS ${k}, `).join("") +
    "COALESCE(SUM(p.amount), 0) AS all_time " +
    "FROM members m LEFT JOIN points p ON p.member = m.id " +
    "GROUP BY m.id ORDER BY total DESC, m.display_name ASC"
  ).bind({ since: since + " 00:00:00.000Z", from: (from || "1970-01-01") + " 00:00:00.000Z", to: (to || "") + " 00:00:00.000Z" }).all(rows);
  return rows.map((r) => ({ id: r.id, name: r.display_name, platoon: r.platoon, discordId: r.discord_id, registered: !!r.registered, total: r.total, recent: r.recent, allTime: r.all_time, billeted: r.billeted, fillIn: r.fill_in, training: r.training, adjustment: r.adjustment }));
}

// Unit Leader tools (the can_manage_logs permission).
function canManageLogs(auth) { return !!auth && auth.getBool("can_manage_logs"); }
const MANAGE_NEEDED = "This needs the Edit & retract logs permission (Unit Leader by default).";

// takes away the points a log gave; returns the names of who lost one
function removeEventPoints(tx, ev) {
  const names = [];
  tx.findRecordsByFilter("points", "event = {:e}", "", 0, 0, { e: ev.id }).forEach((p) => {
    try { names.push(tx.findRecordById("members", p.getString("member")).getString("display_name")); } catch (_) {}
    tx.delete(p);
  });
  return names;
}
const pointsText = (names) => names.length ? ` Took back ${names.length} ${names.length === 1 ? "point" : "points"}: ${names.join(", ")}.` : " It had given no points.";

// Retracting a log: its points go, but the log stays on record as "retracted".
function retractEvent(app, eventId, reason, auth) {
  if (!canManageLogs(auth)) throw new ForbiddenError(MANAGE_NEEDED);
  const why = String(reason || "").trim().slice(0, 500);
  if (why.length < 3) throw new BadRequestError("Give a reason for retracting it. It's kept with the log.");
  const audit = require(`${__hooks}/lib/audit.js`);
  let out = {};
  app.runInTransaction((tx) => {
    const ev = tx.findRecordById("events", eventId);
    const was = ev.getString("status");
    if (was === "retracted") throw new BadRequestError("This log has already been retracted.");
    if (was === "withdrawn") throw new BadRequestError("This log was withdrawn when its Discord post went, so there's nothing to retract.");
    const names = removeEventPoints(tx, ev);
    const awardsOff = require(`${__hooks}/lib/awards.js`).removeForEvent(tx, ev, auth, actorLabel(auth));
    ev.set("status", "retracted");
    ev.set("review_note", why);
    ev.set("reviewed_by", auth.id);
    ev.set("reviewed_at", new Date().toISOString().replace("T", " "));
    ev.set("bot_notified", true);
    tx.save(ev);
    audit.write(tx, { event: ev, action: "retracted", actor: auth, actorName: actorLabel(auth), detail: `Retracted (it was ${was}).${pointsText(names)}${awardsOff} Reason: ${why}` });
    out = { ok: true, pointsRemoved: names.length };
  });
  return out;
}

// Reopening a reviewed or retracted log puts it back in the queue to be edited
// and reviewed again. Its points come off until it's approved again.
function reopenEvent(app, eventId, auth) {
  if (!canManageLogs(auth)) throw new ForbiddenError(MANAGE_NEEDED);
  const audit = require(`${__hooks}/lib/audit.js`);
  let out = {};
  app.runInTransaction((tx) => {
    const ev = tx.findRecordById("events", eventId);
    const was = ev.getString("status");
    if (["approved", "denied", "retracted"].indexOf(was) === -1) throw new BadRequestError("Only an approved, denied or retracted log can be reopened.");
    const names = removeEventPoints(tx, ev);
    const awardsOff = require(`${__hooks}/lib/awards.js`).removeForEvent(tx, ev, auth, actorLabel(auth));
    ev.set("status", "pending");
    ev.set("review_note", "");
    ev.set("bot_notified", true);
    tx.save(ev);
    audit.write(tx, { event: ev, action: "reopened_for_edit", actor: auth, actorName: actorLabel(auth), detail: `Reopened to edit (it was ${was}).${pointsText(names)}${awardsOff} They come back when it's approved again.` });
    out = { ok: true, pointsRemoved: names.length };
  });
  return out;
}

module.exports = { retractEvent, reopenEvent, pointKind, actorLabel, upsertDirectory, resolveName, ingestLog, reviewEvent, adjustPoints, leaderboard, ensureMember, memberByDiscord };
