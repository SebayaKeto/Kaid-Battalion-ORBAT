/// <reference path="../pb_data/types.d.ts" />

// Battalion and company command staff sit above the platoons: their "platoon"
// is the command element itself, set when they're placed in a command slot.
migrate((app) => {
  const names = { battalion: "Battalion Command", katarn: "Katarn Company", tusken: "Tusken Company" };
  Object.keys(names).forEach((key) => {
    try {
      const u = app.findFirstRecordByFilter("orbat_units", "key = {:k}", { k: key });
      u.set("platoon", names[key]);
      app.save(u);
    } catch (_) {}
  });
  // anyone already in a command slot
  app.db().newQuery(
    "UPDATE members SET platoon = (SELECT u.platoon FROM orbat_slots s JOIN orbat_sections c ON c.id = s.section JOIN orbat_units u ON u.id = c.unit WHERE s.member = members.id) " +
    "WHERE id IN (SELECT s.member FROM orbat_slots s JOIN orbat_sections c ON c.id = s.section JOIN orbat_units u ON u.id = c.unit WHERE u.kind = 'command')"
  ).execute();
}, (app) => {
  ["battalion", "katarn", "tusken"].forEach((key) => {
    try {
      const u = app.findFirstRecordByFilter("orbat_units", "key = {:k}", { k: key });
      u.set("platoon", "");
      app.save(u);
    } catch (_) {}
  });
});
