/// <reference path="../pb_data/types.d.ts" />

// Audit trail for points: every change to a log, every approval, denial and
// manual adjustment, with who did it and when. Written only by the server.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const events = app.findCollectionByNameOrId("events");
  const members = app.findCollectionByNameOrId("members");
  const staff = "(@request.auth.can_points = true || @request.auth.is_full = true)";
  const audit = new Collection({
    type: "base",
    name: "audit_log",
    listRule: staff,
    viewRule: staff,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1 },
      { type: "text", name: "event_title", max: 200 },
      { type: "relation", name: "member", collectionId: members.id, maxSelect: 1 },
      { type: "text", name: "action", required: true, max: 40 },
      { type: "relation", name: "actor", collectionId: users.id, maxSelect: 1 },
      { type: "text", name: "actor_name", max: 100 },
      { type: "text", name: "detail", max: 1000 },
      { type: "text", name: "before_text", max: 6000 },
      { type: "text", name: "after_text", max: 6000 },
      // also goes to the Discord audit channel
      { type: "bool", name: "to_discord" },
      { type: "bool", name: "discord_posted" },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: [
      "CREATE INDEX idx_audit_event ON audit_log (event)",
      "CREATE INDEX idx_audit_created ON audit_log (created)",
      "CREATE INDEX idx_audit_discord ON audit_log (to_discord, discord_posted)",
    ],
  });
  app.save(audit);

  // a pending log whose Discord post was deleted, or edited so it's no longer
  // a log, is kept as "withdrawn" instead of being thrown away
  const status = events.fields.getByName("status");
  if (status.values.indexOf("withdrawn") === -1) status.values = status.values.concat(["withdrawn"]);
  app.save(events);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("audit_log")); } catch (_) {}
});
