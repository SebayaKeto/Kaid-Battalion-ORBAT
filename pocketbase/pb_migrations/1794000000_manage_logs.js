/// <reference path="../pb_data/types.d.ts" />

// New permission: reopen a reviewed log to edit it, or retract a log.
// Retracting takes away any points the log gave but keeps the log on record.
// Only the Unit Leader role has it by default; other roles can be given it in Discord access.
migrate((app) => {
  for (const name of ["users", "role_map"]) {
    const c = app.findCollectionByNameOrId(name);
    c.fields.add(new BoolField({ name: "can_manage_logs" }));
    app.save(c);
  }
  app.db().newQuery("UPDATE role_map SET can_manage_logs = TRUE WHERE discord_role_id = '1563589204099997787'").execute();
  // signed-in Unit Leaders get it straight away instead of on their next login
  app.db().newQuery("UPDATE users SET can_manage_logs = TRUE WHERE access_label = 'Unit Leader'").execute();

  const events = app.findCollectionByNameOrId("events");
  const status = events.fields.getByName("status");
  if (status.values.indexOf("retracted") === -1) status.values = status.values.concat(["retracted"]);
  app.save(events);
}, (app) => {
  for (const name of ["users", "role_map"]) {
    try { const c = app.findCollectionByNameOrId(name); c.fields.removeByName("can_manage_logs"); app.save(c); } catch (_) {}
  }
});
