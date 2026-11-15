/// <reference path="../pb_data/types.d.ts" />

// Login portal: member accounts, Discord role mapping, security log,
// trusted-proxy and rate-limit settings.
migrate((app) => {
  // ── users (auth) ──────────────────────────────────────────────────────────
  const users = app.findCollectionByNameOrId("users");

  const add = (field) => {
    if (!users.fields.getByName(field.name)) users.fields.add(field);
  };
  add(new TextField({ name: "username", min: 3, max: 32, pattern: "^[A-Za-z0-9_.-]+$", required: true, presentable: true }));
  add(new TextField({ name: "discord_id", max: 32 }));
  add(new TextField({ name: "discord_name", max: 100 }));
  add(new JSONField({ name: "discord_roles", maxSize: 20000 }));
  add(new BoolField({ name: "has_password" }));
  add(new BoolField({ name: "reauth_required" }));
  add(new TextField({ name: "session_ip", max: 64 }));
  add(new DateField({ name: "last_login_at" }));
  add(new TextField({ name: "access_label", max: 64 }));
  // permission flags, recomputed from Discord roles on every login
  for (const p of ["can_points", "can_promotions", "can_transfers", "can_recruitment", "can_assets", "is_full"]) {
    add(new BoolField({ name: p }));
  }

  // email stays optional: Discord may not share it
  const email = users.fields.getByName("email");
  if (email) email.required = false;

  users.addIndex("idx_users_username", true, "username", "");
  users.addIndex("idx_users_discord_id", true, "discord_id", "discord_id != ''");

  users.passwordAuth.enabled = true;
  users.passwordAuth.identityFields = ["username"];
  users.oauth2.enabled = true;
  users.oauth2.mappedFields.name = "discord_name";

  const staff = "@request.auth.is_full = true || @request.auth.can_promotions = true || @request.auth.can_transfers = true || @request.auth.can_points = true";
  users.listRule = "id = @request.auth.id || " + staff;
  users.viewRule = "id = @request.auth.id || " + staff;
  // new accounts only come from Discord sign-in (createRule must allow the
  // OAuth2 sign-up; direct POSTs are blocked in pb_hooks/auth.pb.js)
  users.createRule = "";
  // all self-service changes go through /api/orbat/* routes
  users.updateRule = null;
  users.deleteRule = null;
  app.save(users);

  // ── role_map: Discord role ID → site permissions ──────────────────────────
  const roleMap = new Collection({
    type: "base",
    name: "role_map",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.is_full = true",
    updateRule: "@request.auth.is_full = true",
    deleteRule: "@request.auth.is_full = true",
    fields: [
      { type: "text", name: "discord_role_id", required: true, max: 32, pattern: "^[0-9]+$" },
      { type: "text", name: "label", required: true, max: 64 },
      { type: "number", name: "priority", onlyInt: true },
      { type: "bool", name: "can_points" },
      { type: "bool", name: "can_promotions" },
      { type: "bool", name: "can_transfers" },
      { type: "bool", name: "can_recruitment" },
      { type: "bool", name: "can_assets" },
      { type: "bool", name: "is_full" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_role_map_role ON role_map (discord_role_id)"],
  });
  app.save(roleMap);

  const seed = [
    { discord_role_id: "1563589204099997787", label: "Unit Leader", priority: 30, is_full: true,
      can_points: true, can_promotions: true, can_transfers: true, can_recruitment: true, can_assets: true },
    { discord_role_id: "1563588894992244757", label: "Unit Administration", priority: 20,
      can_points: true, can_promotions: true, can_transfers: true, can_recruitment: true },
    { discord_role_id: "1563589033152487587", label: "Quartermaster", priority: 10, can_assets: true },
  ];
  for (const row of seed) {
    const r = new Record(roleMap);
    r.load(row);
    app.save(r);
  }

  // ── security_log ─────────────────────────────────────────────────────────
  const log = new Collection({
    type: "base",
    name: "security_log",
    listRule: "@request.auth.is_full = true || @request.auth.can_promotions = true",
    viewRule: "@request.auth.is_full = true || @request.auth.can_promotions = true",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "event", required: true, max: 64 },
      { type: "text", name: "method", max: 32 },
      { type: "text", name: "ip", max: 64 },
      { type: "text", name: "prev_ip", max: 64 },
      { type: "text", name: "user_agent", max: 300 },
      { type: "text", name: "detail", max: 500 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_security_log_created ON security_log (created)"],
  });
  app.save(log);

  // ── settings ─────────────────────────────────────────────────────────────
  const settings = app.settings();
  settings.meta.appName = "41st Orbat";
  // ngrok (and most hosts) pass the visitor's real IP in X-Forwarded-For
  settings.trustedProxy.headers = ["X-Forwarded-For"];
  settings.trustedProxy.useLeftmostIP = false; // rightmost = the hop ngrok appended, not a spoofable client value
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: "*:authWithPassword", audience: "", duration: 60, maxRequests: 8 },
    { label: "*:authWithOAuth2", audience: "", duration: 60, maxRequests: 10 },
    { label: "POST /api/orbat/", audience: "", duration: 60, maxRequests: 20 },
    { label: "/api/", audience: "", duration: 10, maxRequests: 300 },
  ];
  app.save(settings);
}, (app) => {
  for (const name of ["security_log", "role_map"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
