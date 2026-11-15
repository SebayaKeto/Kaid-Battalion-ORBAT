/// <reference path="../pb_data/types.d.ts" />

// Starting points can be carried over from before the site: they count in a
// trooper's all-time total but not in weekly, campaign or calendar totals.
migrate((app) => {
  const points = app.findCollectionByNameOrId("points");
  points.fields.add(new BoolField({ name: "carried_over" }));
  app.save(points);
}, (app) => {
  const points = app.findCollectionByNameOrId("points");
  points.fields.removeByName("carried_over");
  app.save(points);
});
