/// <reference path="../pb_data/types.d.ts" />

// Logs whose date wasn't a Discord timestamp wait for an admin to confirm the date.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events");
  if (!events.fields.getByName("date_needs_check")) events.fields.add(new BoolField({ name: "date_needs_check" }));
  app.save(events);
}, (app) => {
  const events = app.findCollectionByNameOrId("events");
  events.fields.removeByName("date_needs_check");
  app.save(events);
});
