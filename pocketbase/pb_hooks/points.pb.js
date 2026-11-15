/// <reference path="../pb_data/types.d.ts" />

// Points tracking: approvals, adjustments, leaderboard, and the routes the
// 41st Ops bot uses to send in Discord log posts and role changes.

// ── people routes ──────────────────────────────────────────────────────────
routerAdd("POST", "/api/orbat/events/{id}/review", (e) => {
  if (!e.auth.getBool("can_points") && !e.auth.getBool("is_full")) throw new ForbiddenError("Points access needed.");
  const pts = require(`${__hooks}/lib/points.js`);
  const body = e.requestInfo().body || {};
  const r = pts.reviewEvent(e.app, e.request.pathValue("id"), String(body.decision || ""), body.note, e.auth, body.award);
  return e.json(200, { ok: true, points: r.points, awarded: r.awarded, promoted: r.promoted });
}, $apis.requireAuth("users"));

// Unit Leader tools: retract a log (keeps it, takes its points), or reopen it to edit
routerAdd("POST", "/api/orbat/events/{id}/retract", (e) => {
  const pts = require(`${__hooks}/lib/points.js`);
  const body = e.requestInfo().body || {};
  return e.json(200, pts.retractEvent(e.app, e.request.pathValue("id"), body.reason, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/events/{id}/reopen", (e) => {
  const pts = require(`${__hooks}/lib/points.js`);
  return e.json(200, pts.reopenEvent(e.app, e.request.pathValue("id"), e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/points/adjust", (e) => {
  if (!e.auth.getBool("can_points") && !e.auth.getBool("is_full")) throw new ForbiddenError("Points access needed.");
  const pts = require(`${__hooks}/lib/points.js`);
  const body = e.requestInfo().body || {};
  return e.json(200, pts.adjustPoints(e.app, body.memberId, body.amount, body.reason, e.auth));
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/orbat/points/leaderboard", (e) => {
  const pts = require(`${__hooks}/lib/points.js`);
  const camp = require(`${__hooks}/lib/campaigns.js`);
  const q = e.request.url.query();
  let since = String(q.get("since") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) since = "1970-01-01";
  // ?campaign=<id>, "all" for every point ever, or the current campaign when left out
  const which = String(q.get("campaign") || "");
  let r = { campaign: null, from: "1970-01-01", to: "" };
  if (which !== "all") {
    try { r = camp.range(e.app, which); } catch (_) { throw new NotFoundError("That campaign doesn't exist."); }
  }
  let rows = pts.leaderboard(e.app, since, r.from, r.to);
  // the public view: registered troopers only, no Discord IDs
  if (!e.auth) rows = rows.filter((x) => x.registered).map((x) => Object.assign({}, x, { discordId: "" }));
  const c = r.campaign;
  return e.json(200, { since, campaign: c ? { id: c.id, name: c.getString("name"), startsOn: c.getString("starts_on"), endsOn: c.getString("ends_on") } : null, rows });
});

routerAdd("GET", "/api/orbat/campaigns", (e) => {
  return e.json(200, { items: require(`${__hooks}/lib/campaigns.js`).list(e.app) });
});

routerAdd("POST", "/api/orbat/campaigns/start", (e) => {
  return e.json(200, require(`${__hooks}/lib/campaigns.js`).start(e.app, e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/campaigns/{id}/rename", (e) => {
  return e.json(200, require(`${__hooks}/lib/campaigns.js`).rename(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

// rolling calendar: last week, this week and 6 ahead, points per trooper per week
routerAdd("GET", "/api/orbat/points/calendar", (e) => {
  let today = String(e.request.url.query().get("today") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) today = "";
  return e.json(200, require(`${__hooks}/lib/campaigns.js`).calendar(e.app, today));
});

// ── keep event review fields server-controlled ─────────────────────────────
onRecordCreateRequest((e) => {
  e.record.set("status", "pending");
  e.record.set("source", "manual");
  e.record.set("created_by", e.auth ? e.auth.id : "");
  ["reviewed_by", "reviewed_at", "review_note", "discord_message_id", "discord_channel_id", "discord_author_id", "discord_author_name", "raw_text"].forEach((f) => e.record.set(f, ""));
  e.record.set("bot_notified", true);
  e.record.set("date_needs_check", false);
  e.next();
  const pts = require(`${__hooks}/lib/points.js`);
  require(`${__hooks}/lib/audit.js`).write(e.app, { event: e.record, action: "logged", actor: e.auth, actorName: pts.actorLabel(e.auth), detail: "Logged on the site." });
}, "events");

onRecordUpdateRequest((e) => {
  const before = e.record.original();
  const wasUnchecked = before.getBool("date_needs_check");
  // an admin picking a new date counts as confirming it
  if (e.record.getString("event_date") !== before.getString("event_date")) e.record.set("date_needs_check", false);
  ["status", "reviewed_by", "reviewed_at", "review_note", "source", "discord_message_id", "discord_channel_id",
    "discord_author_id", "discord_author_name", "raw_text", "bot_notified", "created_by"].forEach((f) => e.record.set(f, before.get(f)));
  e.next();

  const audit = require(`${__hooks}/lib/audit.js`);
  const pts = require(`${__hooks}/lib/points.js`);
  const day = (v) => String(v || "").slice(0, 10) || "none";
  const labels = { type: "Type", title: "Title", event_date: "Date", host_platoon: "Host platoon", qualification: "Qualification" };
  const changes = [];
  Object.keys(labels).forEach((f) => {
    let a = before.getString(f), b = e.record.getString(f);
    if (f === "event_date") { a = day(a); b = day(b); }
    if (a !== b) changes.push(`${labels[f]}: ${a || "none"} → ${b || "none"}`);
  });
  const who = { event: e.record, actor: e.auth, actorName: pts.actorLabel(e.auth) };
  if (changes.length) audit.write(e.app, Object.assign({ action: "details_changed", detail: changes.join("; ") }, who));
  if (wasUnchecked && !e.record.getBool("date_needs_check")) {
    audit.write(e.app, Object.assign({ action: "date_confirmed", detail: "Date confirmed as " + day(e.record.getString("event_date")) + "." }, who));
  }
}, "events");

// attendance can only be added to, or edited on, events that are still pending,
// and every change made on the site goes in the audit log
onRecordCreateRequest((e) => {
  const ev = e.app.findRecordById("events", e.record.getString("event"));
  if (ev.getString("status") !== "pending") throw new BadRequestError("This event has already been reviewed.");
  e.next();
  const pts = require(`${__hooks}/lib/points.js`);
  const a = require(`${__hooks}/lib/audit.js`);
  a.write(e.app, { event: ev, member: e.record.getString("member"), action: "attendee_added", actor: e.auth, actorName: pts.actorLabel(e.auth), detail: a.attendeeText(e.app, e.record) });
}, "attendance");

onRecordUpdateRequest((e) => {
  const ev = e.app.findRecordById("events", e.record.getString("event"));
  if (ev.getString("status") !== "pending") throw new BadRequestError("This event has already been reviewed.");
  const before = e.record.original();
  e.next();
  const pts = require(`${__hooks}/lib/points.js`);
  const a = require(`${__hooks}/lib/audit.js`);
  const was = a.attendeeText(e.app, before), now = a.attendeeText(e.app, e.record);
  if (was !== now) a.write(e.app, { event: ev, member: e.record.getString("member"), action: "attendee_changed", actor: e.auth, actorName: pts.actorLabel(e.auth), detail: was + " → " + now });
}, "attendance");

onRecordDeleteRequest((e) => {
  const ev = e.app.findRecordById("events", e.record.getString("event"));
  const text = require(`${__hooks}/lib/audit.js`).attendeeText(e.app, e.record);
  e.next();
  const pts = require(`${__hooks}/lib/points.js`);
  require(`${__hooks}/lib/audit.js`).write(e.app, { event: ev, action: "attendee_removed", actor: e.auth, actorName: pts.actorLabel(e.auth), detail: text });
}, "attendance");

// ── bot routes (shared secret, no user login) ─────────────────────────────
// every bot route starts with require(...).requireBot(e)
routerAdd("GET", "/api/orbatbot/config", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const o = require(`${__hooks}/lib/orbat.js`);
  const cfg = o.config();
  return e.json(200, { guildId: cfg.guildId, logChannels: cfg.logChannels, auditChannel: cfg.auditChannel, assetsChannel: cfg.assetsChannel, staffRoles: cfg.staffRoles });
});

routerAdd("POST", "/api/orbatbot/log", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const pts = require(`${__hooks}/lib/points.js`);
  return e.json(200, pts.ingestLog(e.app, e.requestInfo().body || {}));
});

// A deleted Discord post: a pending log is withdrawn (kept for the record),
// a reviewed one keeps its points and the deletion is noted.
routerAdd("POST", "/api/orbatbot/log-deleted", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const audit = require(`${__hooks}/lib/audit.js`);
  const id = String((e.requestInfo().body || {}).messageId || "");
  let ev = null;
  try { ev = e.app.findFirstRecordByFilter("events", "discord_message_id = {:m}", { m: id }); } catch (_) {}
  if (!ev) return e.json(200, { status: "not_found" });
  const status = ev.getString("status");
  const actorName = ("Discord · " + (ev.getString("discord_author_name") || "unknown")).slice(0, 100);
  if (status === "pending") {
    ev.set("status", "withdrawn");
    ev.set("review_note", "The Discord post was deleted.");
    ev.set("bot_notified", true);
    e.app.save(ev);
    audit.write(e.app, { event: ev, action: "withdrawn", actorName, detail: "The Discord post was deleted.", before: ev.getString("raw_text") });
    return e.json(200, { status: "withdrawn" });
  }
  if (status === "approved" || status === "denied") {
    audit.write(e.app, { event: ev, action: "post_deleted_after_review", actorName, detail: status === "approved" ? "It was approved, so the points stand." : "It had been denied." });
    return e.json(200, { status: "kept_reviewed" });
  }
  return e.json(200, { status: "kept" });
});

// Instant role updates: the bot calls this the moment Discord reports a change.
routerAdd("POST", "/api/orbatbot/member", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const o = require(`${__hooks}/lib/orbat.js`);
  const body = e.requestInfo().body || {};
  const discordId = String(body.discordId || "");
  if (!/^\d+$/.test(discordId)) throw new BadRequestError("discordId is required.");
  let user = null;
  try { user = e.app.findFirstRecordByFilter("users", "discord_id = {:d}", { d: discordId }); } catch (_) {}
  if (!user) return e.json(200, { status: "no_account" });
  if (body.left) {
    if (user.getString("access_label") !== "Left Discord") {
      o.clearRoles(user, "Left Discord");
      user.set("reauth_required", true);
      e.app.save(user);
      o.log(e.app, { user, event: "access_removed_left_server", detail: "reported by bot" });
    }
    return e.json(200, { status: "removed" });
  }
  const roles = Array.isArray(body.roles) ? body.roles.map(String).filter((r) => /^\d+$/.test(r)) : [];
  o.applyRoles(e.app, user, roles);
  if (body.nick) user.set("discord_name", String(body.nick).slice(0, 100));
  e.app.save(user);
  return e.json(200, { status: "updated", access: user.getString("access_label") });
});

// The bot keeps a copy of everyone's Discord names so logs can use plain names.
routerAdd("POST", "/api/orbatbot/directory", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const pts = require(`${__hooks}/lib/points.js`);
  const body = e.requestInfo().body || {};
  let saved = 0;
  e.app.runInTransaction((tx) => { saved = pts.upsertDirectory(tx, body.members); });
  return e.json(200, { saved });
});

// Reviewed Discord events the bot hasn't reacted to yet. Denials carry what
// the bot needs to open a thread: who logged it, who denied it, and why.
routerAdd("GET", "/api/orbatbot/reviewed", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const rows = e.app.findRecordsByFilter("events", "source = 'discord' && status != 'pending' && bot_notified = false", "updated", 50, 0);
  return e.json(200, rows.map((r) => {
    const item = { id: r.id, messageId: r.getString("discord_message_id"), channelId: r.getString("discord_channel_id"), status: r.getString("status") };
    if (item.status === "denied") {
      let reviewer = null;
      try { reviewer = e.app.findRecordById("users", r.getString("reviewed_by")); } catch (_) {}
      item.title = require(`${__hooks}/lib/audit.js`).eventLabel(r);
      item.authorId = r.getString("discord_author_id");
      item.reason = r.getString("review_note");
      item.reviewerId = reviewer ? reviewer.getString("discord_id") : "";
      item.reviewerName = reviewer ? (reviewer.getString("discord_name") || reviewer.getString("username")) : "";
    }
    return item;
  }));
});

routerAdd("POST", "/api/orbatbot/notified", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const ids = (e.requestInfo().body || {}).ids;
  (Array.isArray(ids) ? ids : []).slice(0, 50).forEach((id) => {
    try {
      const r = e.app.findRecordById("events", String(id));
      r.set("bot_notified", true);
      e.app.save(r);
    } catch (_) {}
  });
  return e.json(200, { ok: true });
});

// Audit entries waiting to go to the Discord audit channel, oldest first.
routerAdd("GET", "/api/orbatbot/audit", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const o = require(`${__hooks}/lib/orbat.js`);
  const audit = require(`${__hooks}/lib/audit.js`);
  const cfg = o.config();
  // Assets page changes go to their own channel; each feed is off while its channel isn't set
  const feeds = [[cfg.auditChannel, "action !~ 'asset_%'"], [cfg.assetsChannel, "action ~ 'asset_%'"]];
  let rows = [];
  feeds.forEach(([channelId, filter]) => {
    if (!channelId) return;
    e.app.findRecordsByFilter("audit_log", `to_discord = true && discord_posted = false && ${filter}`, "created", 25, 0)
      .forEach((r) => rows.push({ r, channelId }));
  });
  rows.sort((a, b) => (a.r.getString("created") < b.r.getString("created") ? -1 : 1));
  return e.json(200, rows.map(({ r, channelId }) => ({ id: r.id, channelId, text: audit.discordText(e.app, r, cfg.guildId) })));
});

routerAdd("POST", "/api/orbatbot/audit-posted", (e) => {
  require(`${__hooks}/lib/orbat.js`).requireBot(e);
  const ids = (e.requestInfo().body || {}).ids;
  (Array.isArray(ids) ? ids : []).slice(0, 50).forEach((id) => {
    try {
      const r = e.app.findRecordById("audit_log", String(id));
      r.set("discord_posted", true);
      e.app.save(r);
    } catch (_) {}
  });
  return e.json(200, { ok: true });
});
