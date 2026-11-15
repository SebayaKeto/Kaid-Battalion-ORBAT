/// <reference path="../pb_data/types.d.ts" />

// Fireteam colour on a slot, so two "Medic" slots in a squad can be told apart.
// A trooper's billet reads "Medic (Blue)" when their slot has a colour.
migrate((app) => {
  const slots = app.findCollectionByNameOrId("orbat_slots");
  slots.fields.add(new SelectField({ name: "team", maxSelect: 1, values: ["red", "yellow", "green", "blue"] }));
  app.save(slots);
}, (app) => {
  const slots = app.findCollectionByNameOrId("orbat_slots");
  slots.fields.removeByName("team");
  app.save(slots);
});
