/// <reference path="../pb_data/types.d.ts" />

// New permission: approve or deny new asset types submitted on the Assets page.
// Only the Unit Leader role has it by default; it can be given to other roles in Discord access.
migrate((app) => {
  for (const name of ["users", "role_map"]) {
    const c = app.findCollectionByNameOrId(name);
    if (!c.fields.getByName("can_approve_assets")) c.fields.add(new BoolField({ name: "can_approve_assets" }));
    app.save(c);
  }
  app.db().newQuery("UPDATE role_map SET can_approve_assets = TRUE WHERE discord_role_id = '1563589204099997787'").execute();
  // signed-in Unit Leaders get it straight away instead of on their next login
  app.db().newQuery("UPDATE users SET can_approve_assets = TRUE WHERE access_label = 'Unit Leader'").execute();
}, (app) => {
  for (const name of ["users", "role_map"]) {
    try { const c = app.findCollectionByNameOrId(name); c.fields.removeByName("can_approve_assets"); app.save(c); } catch (_) {}
  }
});
