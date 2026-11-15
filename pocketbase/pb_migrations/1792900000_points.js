/// <reference path="../pb_data/types.d.ts" />

// Points tracking: members, events (trainings and operations), attendance and
// the points ledger. One approved attendance = 1 point.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const authed = "@request.auth.id != ''";
  const pointsStaff = "(@request.auth.can_points = true || @request.auth.is_full = true)";
  const rosterStaff = "(@request.auth.is_full = true || @request.auth.can_promotions = true || @request.auth.can_transfers = true || @request.auth.can_points = true)";

  // ── members: everyone on the roster (site account optional) ──────────────
  const members = new Collection({
    type: "base",
    name: "members",
    listRule: authed,
    viewRule: authed,
    createRule: rosterStaff,
    updateRule: rosterStaff,
    deleteRule: "@request.auth.is_full = true",
    fields: [
      { type: "text", name: "display_name", required: true, max: 100, presentable: true },
      { type: "text", name: "discord_id", max: 32, pattern: "^[0-9]*$" },
      { type: "text", name: "steam_id", max: 32, pattern: "^[0-9]*$" },
      { type: "text", name: "platoon", max: 64 },
      { type: "text", name: "source", max: 32 },
      { type: "bool", name: "active" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_members_discord ON members (discord_id) WHERE discord_id != ''",
      "CREATE INDEX idx_members_name ON members (display_name)",
    ],
  });
  app.save(members);

  // ── events: one Training or Operation ────────────────────────────────────
  const events = new Collection({
    type: "base",
    name: "events",
    listRule: authed + " && (status = 'approved' || " + pointsStaff + ")",
    viewRule: authed + " && (status = 'approved' || " + pointsStaff + ")",
    createRule: pointsStaff,
    updateRule: pointsStaff + " && status = 'pending'",
    deleteRule: pointsStaff + " && status = 'pending'",
    fields: [
      { type: "select", name: "type", required: true, maxSelect: 1, values: ["training", "operation"] },
      { type: "text", name: "title", max: 200 },
      { type: "date", name: "event_date", required: true },
      { type: "text", name: "host_platoon", max: 64 },
      { type: "text", name: "qualification", max: 200 },
      { type: "select", name: "source", maxSelect: 1, values: ["discord", "manual", "arma"] },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "approved", "denied"] },
      { type: "text", name: "discord_message_id", max: 32 },
      { type: "text", name: "discord_channel_id", max: 32 },
      { type: "text", name: "discord_author_id", max: 32 },
      { type: "text", name: "discord_author_name", max: 100 },
      { type: "text", name: "raw_text", max: 6000 },
      { type: "json", name: "parse_notes", maxSize: 20000 },
      { type: "relation", name: "created_by", collectionId: users.id, maxSelect: 1 },
      { type: "relation", name: "reviewed_by", collectionId: users.id, maxSelect: 1 },
      { type: "date", name: "reviewed_at" },
      { type: "text", name: "review_note", max: 500 },
      { type: "bool", name: "bot_notified" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_events_discord_msg ON events (discord_message_id) WHERE discord_message_id != ''",
      "CREATE INDEX idx_events_status ON events (status)",
      "CREATE INDEX idx_events_date ON events (event_date)",
    ],
  });
  app.save(events);

  // ── attendance: who was at an event ──────────────────────────────────────
  const attendance = new Collection({
    type: "base",
    name: "attendance",
    listRule: authed + " && (event.status = 'approved' || " + pointsStaff + ")",
    viewRule: authed + " && (event.status = 'approved' || " + pointsStaff + ")",
    createRule: pointsStaff,
    updateRule: pointsStaff + " && event.status = 'pending'",
    deleteRule: pointsStaff + " && event.status = 'pending'",
    fields: [
      { type: "relation", name: "event", required: true, collectionId: events.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "member", collectionId: members.id, maxSelect: 1 },
      { type: "text", name: "name", max: 100 },
      { type: "text", name: "discord_id", max: 32 },
      { type: "select", name: "role", maxSelect: 1, values: ["instructor", "trainee", "attendee"] },
      { type: "bool", name: "award_point" },
      { type: "number", name: "minutes", onlyInt: true, min: 0 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_attendance_event ON attendance (event)"],
  });
  app.save(attendance);

  // ── points: the ledger. Written only by server routes. ───────────────────
  const points = new Collection({
    type: "base",
    name: "points",
    listRule: authed,
    viewRule: authed,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "member", required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1 },
      { type: "number", name: "amount", required: true, onlyInt: true },
      { type: "select", name: "category", required: true, maxSelect: 1, values: ["attendance", "manual"] },
      { type: "text", name: "reason", max: 300 },
      { type: "date", name: "earned_at" },
      { type: "relation", name: "awarded_by", collectionId: users.id, maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: [
      // one attendance point per member per event, ever
      "CREATE UNIQUE INDEX idx_points_once ON points (member, event) WHERE category = 'attendance'",
      "CREATE INDEX idx_points_member ON points (member)",
    ],
  });
  app.save(points);

  // bot posts arrive on /api/orbatbot/, so keep the stricter /api/orbat/ limit for people
  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== "/api/orbatbot/");
  settings.rateLimits.rules.push({ label: "/api/orbatbot/", audience: "", duration: 10, maxRequests: 200 });
  app.save(settings);
}, (app) => {
  for (const name of ["points", "attendance", "events", "members"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
