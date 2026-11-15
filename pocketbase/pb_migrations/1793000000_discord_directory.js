/// <reference path="../pb_data/types.d.ts" />

// A copy of the 41st Discord's member names, kept up to date by the Ops bot,
// so training logs can name people in plain text instead of @mentions.
migrate((app) => {
  const dir = new Collection({
    type: "base",
    name: "discord_members",
    listRule: "@request.auth.is_full = true || @request.auth.can_points = true",
    viewRule: "@request.auth.is_full = true || @request.auth.can_points = true",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "discord_id", required: true, max: 32, pattern: "^[0-9]+$" },
      { type: "text", name: "display_name", max: 100, presentable: true },
      { type: "text", name: "username", max: 100 },
      { type: "text", name: "global_name", max: 100 },
      // lower-case copies for matching
      { type: "text", name: "display_lc", max: 100 },
      { type: "text", name: "username_lc", max: 100 },
      { type: "text", name: "global_lc", max: 100 },
      // from names like CPL-7567 "Rex": the four-digit number and the name
      { type: "text", name: "service_number", max: 8 },
      { type: "text", name: "callsign_lc", max: 100 },
      { type: "bool", name: "in_server" },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_dm_id ON discord_members (discord_id)",
      "CREATE INDEX idx_dm_display ON discord_members (display_lc)",
      "CREATE INDEX idx_dm_username ON discord_members (username_lc)",
      "CREATE INDEX idx_dm_global ON discord_members (global_lc)",
      "CREATE INDEX idx_dm_number ON discord_members (service_number)",
    ],
  });
  app.save(dir);

  // roster members get the same two identifiers
  const members = app.findCollectionByNameOrId("members");
  if (!members.fields.getByName("service_number")) members.fields.add(new TextField({ name: "service_number", max: 8, pattern: "^[0-9]*$" }));
  if (!members.fields.getByName("callsign")) members.fields.add(new TextField({ name: "callsign", max: 100 }));
  members.addIndex("idx_members_number", false, "service_number", "");
  app.save(members);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("discord_members")); } catch (_) {}
});
