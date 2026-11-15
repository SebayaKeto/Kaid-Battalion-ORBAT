/// <reference path="../pb_data/types.d.ts" />

// The ORBAT layout as data: units (platoons, Ranger, Air Wing, Navy and the
// command elements), their sections (squads, command blocks) and the slots
// in each section. A trooper fills at most one slot. Unit Leaders can edit
// the layout; slots are filled through /api/orbat/slots/{id}/assign.
migrate((app) => {
  const members = app.findCollectionByNameOrId("members");
  const authed = "@request.auth.id != ''";
  const full = "@request.auth.is_full = true";

  const units = new Collection({
    type: "base", name: "orbat_units",
    listRule: authed, viewRule: authed, createRule: full, updateRule: full, deleteRule: null,
    fields: [
      { type: "text", name: "key", required: true, max: 32, pattern: "^[a-z0-9_]+$" },
      { type: "text", name: "name", required: true, max: 60, presentable: true },
      // what a trooper's "platoon" field says when they belong here
      { type: "text", name: "platoon", max: 64 },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["line", "ranger", "special", "command"] },
      { type: "text", name: "company", max: 32 },
      { type: "text", name: "group_label", max: 60 },
      { type: "text", name: "subtitle", max: 100 },
      { type: "text", name: "color", max: 9, pattern: "^(#[0-9a-fA-F]{6})?$" },
      { type: "number", name: "sort", onlyInt: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_units_key ON orbat_units (key)"],
  });
  app.save(units);

  const sections = new Collection({
    type: "base", name: "orbat_sections",
    listRule: authed, viewRule: authed, createRule: full, updateRule: full, deleteRule: full,
    fields: [
      { type: "relation", name: "unit", required: true, collectionId: units.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 60, presentable: true },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["command", "squad"] },
      { type: "text", name: "code", max: 40 },
      { type: "number", name: "sort", onlyInt: true },
    ],
    indexes: ["CREATE INDEX idx_sections_unit ON orbat_sections (unit)"],
  });
  app.save(sections);

  const slots = new Collection({
    type: "base", name: "orbat_slots",
    listRule: authed, viewRule: authed, createRule: full, updateRule: full, deleteRule: full,
    fields: [
      { type: "relation", name: "section", required: true, collectionId: sections.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "billet", required: true, max: 60 },
      { type: "number", name: "sort", onlyInt: true },
      { type: "relation", name: "member", collectionId: members.id, maxSelect: 1 },
    ],
    indexes: [
      "CREATE INDEX idx_slots_section ON orbat_slots (section)",
      "CREATE UNIQUE INDEX idx_slots_member ON orbat_slots (member) WHERE member != ''",
    ],
  });
  app.save(slots);

  // ── starting layout (from the old roster and Mock v2) ─────────────────────
  let unitSort = 0;
  const addUnit = (u, secs) => {
    const r = new Record(units);
    r.load(Object.assign({ sort: unitSort++ }, u));
    app.save(r);
    secs.forEach((s, si) => {
      const sec = new Record(sections);
      sec.load({ unit: r.id, name: s.name, kind: s.kind || "squad", code: s.code || "", sort: si });
      app.save(sec);
      s.slots.forEach((billet, i) => {
        const sl = new Record(slots);
        sl.load({ section: sec.id, billet, sort: i });
        app.save(sl);
      });
    });
  };
  const times = (n, billet) => Array(n).fill(billet);
  const lineSquad = (name) => ({ name, slots: ["Squad Leader", "FRO", "Fireteam Lead A", "Fireteam Lead B"].concat(times(8, "Trooper")) });
  const line = (key, name, company, groupLabel, color) => addUnit(
    { key, name: name + " Platoon", platoon: name, kind: "line", company, group_label: groupLabel, color },
    [
      { name: name + " Platoon Command", kind: "command", slots: ["Platoon Commander", "Platoon Sergeant Major", "JTAC / FAC", "Platoon Medic"] },
      lineSquad("Alpha Squad"), lineSquad("Bravo Squad"), lineSquad("Charlie Squad"),
      { name: "Armour Section", slots: ["Section Leader", "Section 2IC / Crew Commander", "Crew", "Crew", "Crew"] },
    ],
  );

  addUnit({ key: "battalion", name: "Battalion Command", kind: "command", group_label: "Command", color: "#c8312b" },
    [{ name: "Battalion Command", kind: "command", slots: ["Battalion Commander", "Battalion Sergeant Major"] }]);
  addUnit({ key: "katarn", name: "Katarn Company Command", kind: "command", company: "katarn", group_label: "1st Company · Katarn", color: "#d4a72c" },
    [{ name: "Katarn Company Command", kind: "command", slots: ["Company Commander", "Company Sergeant Major"] }]);
  addUnit({ key: "tusken", name: "Tusken Company Command", kind: "command", company: "tusken", group_label: "2nd Company · Tusken", color: "#d4a72c" },
    [{ name: "Tusken Company Command", kind: "command", slots: ["Company Commander", "Company Sergeant Major"] }]);
  line("acklay", "Acklay", "katarn", "1st Company · Katarn", "#4f8fd1");
  line("chimaera", "Chimaera", "katarn", "1st Company · Katarn", "#5fd38a");
  line("banshee", "Banshee", "tusken", "2nd Company · Tusken", "#d0574f");
  line("drexl", "Drexl", "tusken", "2nd Company · Tusken", "#a47ad6");
  const rangerSquad = (p) => ({ name: p + " Ranger Squad", slots: ["Squad Leader", "Team Leader"].concat(times(6, "Ranger")) });
  addUnit({ key: "ranger", name: "Ranger Platoon", platoon: "Ranger", kind: "ranger", group_label: "Special Units", subtitle: "Special Operations", color: "#8f1f19" },
    [rangerSquad("Acklay"), rangerSquad("Banshee"), rangerSquad("Chimaera"), rangerSquad("Drexl"),
      { name: "Gundark Scout Team", code: "EYES ONLY", slots: ["Section Leader"].concat(times(4, "Scout")) }]);
  const squadron = (n) => ({ name: n + " Squadron", slots: ["Squadron Leader",
    n + " 1 Flight Lead", "Pilot", "Pilot", "Crew Chief", "Crew Chief",
    n + " 2 Flight Lead", "Pilot", "Pilot", "Crew Chief", "Crew Chief"] });
  addUnit({ key: "airwing", name: "Fynock Air Wing", platoon: "Air Wing", kind: "special", group_label: "Special Units", subtitle: "Air Operations", color: "#3fa7d6" },
    [{ name: "Air Wing Command", kind: "command", slots: ["Wing Leader", "Wing SNCO"] }, squadron("Gold"), squadron("Red")]);
  const zeusTeam = (p) => ({ name: p + " Zeus Team", slots: ["Senior Zeus"].concat(times(3, "Junior Zeus")) });
  addUnit({ key: "navy", name: "Navy", platoon: "Navy", kind: "special", group_label: "Special Units", subtitle: "Naval Zeus Operations", color: "#6f86d9" },
    [{ name: "Navy Command", kind: "command", slots: ["Head Zeus", "Zeus 2IC"] }, zeusTeam("Acklay"), zeusTeam("Banshee"), zeusTeam("Chimaera"), zeusTeam("Drexl")]);
}, (app) => {
  ["orbat_slots", "orbat_sections", "orbat_units"].forEach((n) => { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} });
});
