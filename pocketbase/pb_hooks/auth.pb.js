/// <reference path="../pb_data/types.d.ts" />

// 41st Orbat login portal
// - Discord sign-in (must be in the 41st Discord server), roles → permissions
// - username + password sign-in
// - if a session's IP changes, it is ended and the member must re-enter their password
// - every sign-in and forced re-login is written to security_log

// ── Discord provider from environment ──────────────────────────────────────
onBootstrap((e) => {
  e.next();
  const id = $os.getenv("DISCORD_CLIENT_ID");
  const secret = $os.getenv("DISCORD_CLIENT_SECRET");
  if (!id || !secret) {
    console.log("[orbat] DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set: Discord sign-in is disabled");
    return;
  }
  try {
    const users = e.app.findCollectionByNameOrId("users");
    const existing = users.oauth2.providers.find((p) => p.name === "discord");
    if (existing && existing.clientId === id && existing.clientSecret === secret) return;
    users.oauth2.enabled = true;
    users.oauth2.providers = [{ name: "discord", clientId: id, clientSecret: secret }];
    e.app.save(users);
    console.log("[orbat] Discord sign-in configured");
  } catch (err) {
    console.log("[orbat] could not configure Discord provider:", err);
  }
});

// ── accounts are only created through Discord sign-in ──────────────────────
onRecordCreateRequest((e) => {
  // Discord sign-in creates new accounts through this same event, marked with the "oauth2" context
  const viaDiscord = e.requestInfo().context === "oauth2";
  if (!viaDiscord && !e.hasSuperuserAuth()) {
    throw new ForbiddenError("Accounts are created by signing in with Discord.");
  }
  e.next();
}, "users");

// ── Discord sign-in ────────────────────────────────────────────────────────
onRecordAuthWithOAuth2Request((e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  if (e.providerName !== "discord") throw new ForbiddenError("Only Discord sign-in is allowed.");

  const discordId = e.oAuth2User.id;
  const ip = e.realIP();
  const member = o.fetchGuildMember(discordId);

  if (member.checked && !member.inGuild) {
    o.log(e.app, { user: e.record, event: "denied_not_in_server", method: "discord", ip, ua: o.userAgent(e), detail: "Discord ID " + discordId });
    throw new ForbiddenError("This Discord account isn't in the 41st Discord server.", { code: "not_in_server" });
  }
  if (!member.checked && e.isNewRecord && o.config().botToken) {
    throw new BadRequestError("Couldn't reach Discord to check your membership. Try again in a minute.");
  }

  // only staff roles can sign in
  const staff = member.checked ? o.isStaff(o.permsFor(e.app, member.roles).flags) : !!(e.record && o.isStaff(e.record));
  if (!staff) {
    o.log(e.app, { user: e.record, event: "denied_not_staff", method: "discord", ip, ua: o.userAgent(e), detail: "Discord ID " + discordId });
    throw new ForbiddenError(o.NOT_STAFF, { code: "not_staff" });
  }

  if (e.record && e.record.getBool("reauth_required") && e.record.getBool("has_password")) {
    o.log(e.app, { user: e.record, event: "denied_password_required", method: "discord", ip, prevIp: e.record.getString("session_ip"), ua: o.userAgent(e) });
    throw new ForbiddenError("Your connection changed. Sign in with your username and password.", { code: "password_required" });
  }

  // createData is empty unless the browser sends one, and a browser could send
  // fields like is_full, so new accounts always start from this fixed set.
  if (e.isNewRecord) {
    e.createData = {
      username: ("trooper_" + discordId).slice(0, 32),
      discord_id: discordId,
      has_password: false,
    };
  }

  e.next();

  // e.record now exists (new or existing): store Discord identity + roles
  const user = e.app.findRecordById("users", e.record.id);
  user.set("discord_id", discordId);
  user.set("discord_name", member.nick || e.oAuth2User.username || e.oAuth2User.name || "");
  if (member.checked) o.applyRoles(e.app, user, member.roles);
  e.app.save(user);
}, "users");

// ── username + password sign-in ────────────────────────────────────────────
onRecordAuthWithPasswordRequest((e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  e.identity = (e.identity || "").trim().toLowerCase();
  if (!e.record) {
    try { e.record = e.app.findFirstRecordByData("users", "username", e.identity); } catch (_) {}
  }

  if (e.record && !e.record.getBool("has_password")) {
    throw new BadRequestError("Sign in with Discord first to set up your username and password.", { code: "setup_required" });
  }

  // re-check Discord membership and roles before letting them in
  if (e.record && e.record.getString("discord_id")) {
    const member = o.fetchGuildMember(e.record.getString("discord_id"));
    if (member.checked && !member.inGuild) {
      o.log(e.app, { user: e.record, event: "denied_not_in_server", method: "password", ip: e.realIP(), ua: o.userAgent(e) });
      throw new ForbiddenError("Your Discord account is no longer in the 41st Discord server.", { code: "not_in_server" });
    }
    if (member.checked) {
      o.applyRoles(e.app, e.record, member.roles);
      e.app.save(e.record);
    }
  }
  if (e.record && !o.isStaff(e.record)) {
    o.log(e.app, { user: e.record, event: "denied_not_staff", method: "password", ip: e.realIP(), ua: o.userAgent(e) });
    throw new ForbiddenError(o.NOT_STAFF, { code: "not_staff" });
  }

  try {
    e.next();
  } catch (err) {
    o.log(e.app, { user: e.record, event: "failed_password", method: "password", ip: e.realIP(), ua: o.userAgent(e), detail: "username: " + e.identity });
    throw err;
  }
}, "users");

// ── every successful sign-in: pin the session to this IP ───────────────────
onRecordAuthRequest((e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  // authMethod is empty for token refreshes; the IP middleware already checked those
  if (!e.authMethod) return e.next();

  const user = e.app.findRecordById("users", e.record.id);
  const ip = e.realIP();
  const prev = user.getString("session_ip");
  user.set("session_ip", ip);
  user.set("reauth_required", false);
  user.set("last_login_at", new Date().toISOString());
  e.app.save(user);
  o.log(e.app, {
    user, event: "login", method: e.authMethod, ip, prevIp: prev, ua: o.userAgent(e),
    detail: prev && prev !== ip ? "new IP since last sign-in" : "",
  });
  e.record = user;
  e.next();
}, "users");

// ── IP check on every authenticated request ────────────────────────────────
routerUse((e) => {
  const auth = e.auth;
  if (!auth || auth.collection().name !== "users") return e.next();

  const path = e.request.url.path;
  if (path.indexOf("/api/collections/users/auth-with-") === 0 ||
      path === "/api/collections/users/auth-methods" ||
      path.indexOf("/api/") !== 0) {
    return e.next();
  }

  const o = require(`${__hooks}/lib/orbat.js`);
  const ip = e.realIP();
  const sessionIp = auth.getString("session_ip");
  const mode = o.config().ipMode;

  if (auth.getBool("reauth_required")) {
    throw new UnauthorizedError("Please sign in again.", { code: "reauth_required" });
  }
  if (!o.sameNetwork(sessionIp, ip, mode)) {
    const user = e.app.findRecordById("users", auth.id);
    user.set("reauth_required", true);
    e.app.save(user);
    o.log(e.app, { user, event: "ip_changed", ip, prevIp: sessionIp, ua: o.userAgent(e), detail: "session ended; password required" });
    throw new UnauthorizedError("Your connection changed. Please sign in with your username and password.", { code: "reauth_required" });
  }
  // staff access removed (Discord roles changed): the session ends, the public view stays
  if (!o.isStaff(auth)) {
    throw new UnauthorizedError("You no longer have a staff role, so you've been signed out. The ORBAT is still open to view.", { code: "not_staff" });
  }
  return e.next();
});
