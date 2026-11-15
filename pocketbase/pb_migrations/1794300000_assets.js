/// <reference path="../pb_data/types.d.ts" />

// Assets page: asset types, gain/loss entries per unit and campaign, and
// starting-supply presets. Counts are never stored; they are added up from the
// entries. Everything is written only through /api/orbat/assets routes.
// The 23 asset types from the old tracker are loaded as approved.
migrate((app) => {
  const staffRead = "@request.auth.can_assets = true || @request.auth.can_approve_assets = true || @request.auth.is_full = true";

  const types = new Collection({
    type: "base", name: "asset_types",
    listRule: `status = 'approved' || ${staffRead}`, viewRule: `status = 'approved' || ${staffRead}`,
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, max: 60, presentable: true },
      { type: "select", name: "category", required: true, maxSelect: 1, values: ["Vehicle", "Weapon", "Supply"] },
      { type: "file", name: "image", maxSelect: 1, maxSize: 5 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"], thumbs: ["128x128f"] },
      { type: "json", name: "units", maxSize: 2000 },
      { type: "number", name: "sort", onlyInt: true },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "approved", "denied"] },
      { type: "bool", name: "retired" },
      { type: "text", name: "submitted_by", max: 30 },
      { type: "text", name: "submitted_name", max: 100 },
      { type: "text", name: "reviewed_name", max: 100 },
      { type: "text", name: "reviewed_at", max: 30 },
      { type: "text", name: "review_note", max: 300 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(types);

  const campaigns = app.findCollectionByNameOrId("campaigns");
  const events = app.findCollectionByNameOrId("events");
  const entries = new Collection({
    type: "base", name: "asset_entries",
    listRule: "", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "relation", name: "campaign", required: true, collectionId: campaigns.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "unit", required: true, max: 40 },
      { type: "relation", name: "type", required: true, collectionId: types.id, maxSelect: 1, cascadeDelete: false },
      { type: "number", name: "delta", required: true, onlyInt: true },
      { type: "text", name: "entry_date", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { type: "text", name: "reason", max: 300 },
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "event_label", max: 200 },
      { type: "bool", name: "is_start" },
      { type: "text", name: "batch", max: 30 },
      { type: "text", name: "logged_by", max: 30 },
      { type: "text", name: "logged_name", max: 100 },
      { type: "bool", name: "retracted" },
      { type: "text", name: "retract_reason", max: 300 },
      { type: "text", name: "retracted_name", max: 100 },
      { type: "text", name: "retracted_at", max: 30 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_asset_entries_campaign ON asset_entries (campaign)"],
  });
  app.save(entries);

  const presets = new Collection({
    type: "base", name: "asset_presets",
    listRule: staffRead, viewRule: staffRead, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "name", required: true, max: 60, presentable: true },
      { type: "json", name: "rows", maxSize: 50000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(presets);

  // how the campaign's starting supply was set ("Standard issue preset", "Carried over", "Zero")
  campaigns.fields.add(new TextField({ name: "asset_start", max: 120 }));
  app.save(campaigns);

  const P4 = ["acklay", "chimaera", "banshee", "drexl"];
  const P5 = P4.concat(["ranger"]);
  const seed = [
    ["AV-7", "Vehicle", ["battalion"]], ["LAAT/i", "Vehicle", P5], ["LAAT/c", "Vehicle", P5], ["LAAT/le", "Vehicle", P5],
    ["ARC-170", "Vehicle", P5], ["Z-95", "Vehicle", P5], ["Y-Wing", "Vehicle", P5], ["ITT", "Vehicle", P4],
    ["Logistics ITT", "Vehicle", P4], ["NU-Class Shuttle", "Vehicle", P5], ["Gungan Assault Craft", "Vehicle", P4],
    ["Rho-Class Shuttle", "Vehicle", P4], ["Gozanti-Class Cruiser", "Vehicle", P4], ["SDV", "Vehicle", ["ranger"]],
    ["AT-TE", "Vehicle", ["banshee"]], ["TX-130", "Vehicle", ["banshee"]],
    ["Mortar Tubes", "Weapon", ["acklay", "chimaera"]], ["E-Web", "Weapon", ["acklay", "chimaera"]],
    ["TARU Pod", "Supply", P5], ["Ammunition Crates", "Supply", P5], ["Medical Crates", "Supply", P5],
    ["Explosive Crates", "Supply", P5], ["Orbital Resupply Crates", "Supply", P5],
  ];
  seed.forEach(([name, category, units], i) => {
    const r = new Record(types);
    r.load({ name, category, units, sort: (i + 1) * 10, status: "approved", retired: false, submitted_name: "Old tracker", reviewed_name: "Old tracker" });
    app.save(r);
  });
}, (app) => {
  ["asset_entries", "asset_presets", "asset_types"].forEach((n) => { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} });
  try { const c = app.findCollectionByNameOrId("campaigns"); c.fields.removeByName("asset_start"); app.save(c); } catch (_) {}
});
