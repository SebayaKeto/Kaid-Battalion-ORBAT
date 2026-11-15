/// <reference path="../pb_data/types.d.ts" />

// The tight 20-a-minute limit was on every POST /api/orbat/ route, which also
// caught staff work like assigning slots and registering troopers. Keep it
// only on the password and account routes; everything else uses the general
// /api/ limit.
migrate((app) => {
  const settings = app.settings();
  const tight = ["POST /api/orbat/setup-credentials", "POST /api/orbat/change-password", "POST /api/orbat/admin/"];
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== "POST /api/orbat/" && tight.indexOf(r.label) === -1);
  tight.forEach((label) => settings.rateLimits.rules.push({ label, audience: "", duration: 60, maxRequests: 20 }));
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label.indexOf("POST /api/orbat/") !== 0);
  settings.rateLimits.rules.push({ label: "POST /api/orbat/", audience: "", duration: 60, maxRequests: 20 });
  app.save(settings);
});
