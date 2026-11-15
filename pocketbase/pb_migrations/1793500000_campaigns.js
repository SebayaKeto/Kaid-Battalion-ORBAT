/// <reference path="../pb_data/types.d.ts" />

// Campaigns split the points table into date ranges: a point belongs to the
// campaign whose dates cover its earned date. The current campaign has no end.
// Also adds points.kind (how a point was earned).
// Public to read and only written through /api/orbat routes.
migrate((app) => {
  const campaigns = new Collection({
    type: "base", name: "campaigns",
    listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, max: 80, presentable: true },
      { type: "text", name: "starts_on", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { type: "text", name: "ends_on", pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_campaign_start ON campaigns (starts_on)"],
  });
  app.save(campaigns);

  const first = new Record(campaigns);
  first.load({ name: "Current Campaign", starts_on: "2000-01-01", ends_on: "" });
  app.save(first);

  // how each point was earned: on their own platoon's operation (billeted),
  // filling in on another platoon's operation, a training, or a manual adjustment
  const points = app.findCollectionByNameOrId("points");
  points.fields.add(new SelectField({ name: "kind", maxSelect: 1, values: ["billeted", "fill_in", "training", "adjustment"] }));
  app.save(points);
  app.db().newQuery(
    "UPDATE points SET kind = CASE " +
    "WHEN category = 'manual' THEN 'adjustment' " +
    "WHEN (SELECT type FROM events e WHERE e.id = points.event) = 'training' THEN 'training' " +
    "WHEN COALESCE((SELECT host_platoon FROM events e WHERE e.id = points.event), '') = '' THEN 'billeted' " +
    "WHEN (SELECT host_platoon FROM events e WHERE e.id = points.event) = (SELECT platoon FROM members m WHERE m.id = points.member) THEN 'billeted' " +
    "ELSE 'fill_in' END"
  ).execute();
}, (app) => {
  try { const p = app.findCollectionByNameOrId("points"); p.fields.removeByName("kind"); app.save(p); } catch (_) {}
  ["campaigns"].forEach((n) => { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} });
});
