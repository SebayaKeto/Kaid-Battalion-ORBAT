/// <reference path="../pb_data/types.d.ts" />

// Troopers in a slot take that slot's billet (fixes billets renamed on the layout before this sync existed).
migrate((app) => {
  app.db().newQuery(
    "UPDATE members SET billet = (SELECT s.billet FROM orbat_slots s WHERE s.member = members.id) " +
    "WHERE id IN (SELECT member FROM orbat_slots WHERE member != '')"
  ).execute();
}, () => {});
