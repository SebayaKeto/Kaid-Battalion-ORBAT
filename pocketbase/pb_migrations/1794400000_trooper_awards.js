/// <reference path="../pb_data/types.d.ts" />

// Trooper profiles: qualifications and certifications a trooper holds.
// One row per award (or per step up a Zeus or SULC ladder). Written and read
// only through /api/orbat/troopers and /api/orbat/awards routes.
// A revoked row is kept for the staff Site Log but never shown on a profile.
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  const events = app.findCollectionByNameOrId("events");
  const awards = new Collection({
    type: "base", name: "trooper_awards",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "relation", name: "member", required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["qual", "cert"] },
      { type: "text", name: "code", required: true, max: 20 },
      { type: "number", name: "level", onlyInt: true },
      { type: "text", name: "awarded_on", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { type: "text", name: "instructor", max: 300 },
      { type: "select", name: "source", required: true, maxSelect: 1, values: ["log", "manual"] },
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "event_label", max: 200 },
      { type: "text", name: "added_by", max: 30 },
      { type: "text", name: "added_name", max: 100 },
      { type: "bool", name: "revoked" },
      { type: "text", name: "revoked_at", max: 30 },
      { type: "text", name: "revoked_name", max: 100 },
      { type: "text", name: "revoke_note", max: 300 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: [
      "CREATE INDEX idx_awards_member ON trooper_awards (member)",
      "CREATE INDEX idx_awards_event ON trooper_awards (event)",
    ],
  });
  app.save(awards);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("trooper_awards")); } catch (_) {}
});
