/// <reference path="../pb_data/types.d.ts" />

// Player registration: the details the Orbat needs for each trooper.
// Registering goes through /api/orbat/members/register (recruitment staff).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const members = app.findCollectionByNameOrId("members");
  const add = (f) => { if (!members.fields.getByName(f.name)) members.fields.add(f); };
  add(new TextField({ name: "rank", max: 10 }));
  add(new SelectField({ name: "status", maxSelect: 1, values: ["recruit", "active", "active_reserve", "inactive_reserve", "discharged"] }));
  add(new TextField({ name: "billet", max: 100 }));
  add(new DateField({ name: "joined_at" }));
  add(new BoolField({ name: "registered" }));
  add(new RelationField({ name: "registered_by", collectionId: users.id, maxSelect: 1 }));
  add(new DateField({ name: "registered_at" }));
  // (service numbers are kept unique by the register route, not an index, so
  // existing duplicates from Discord nicknames don't block this update)
  app.save(members);

  // recruitment staff can see the Discord name list, to pick who they're registering
  const dir = app.findCollectionByNameOrId("discord_members");
  const rule = "@request.auth.is_full = true || @request.auth.can_points = true || @request.auth.can_recruitment = true";
  dir.listRule = rule;
  dir.viewRule = rule;
  app.save(dir);
}, (app) => {
  const members = app.findCollectionByNameOrId("members");
  ["rank", "status", "billet", "joined_at", "registered", "registered_by", "registered_at"].forEach((n) => members.fields.removeByName(n));
  app.save(members);
});
