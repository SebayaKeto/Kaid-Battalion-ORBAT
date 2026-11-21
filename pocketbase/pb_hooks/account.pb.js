/// <reference path="../pb_data/types.d.ts" />

// Self-service account routes and admin helpers for the login portal.

// Who am I, and what can I do?
routerAdd("GET", "/api/orbat/me", (e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  return e.json(200, o.summary(e.auth));
}, $apis.requireAuth("users"));

// First-time setup after Discord sign-in: choose a username and password.
routerAdd("POST", "/api/orbat/setup-credentials", (e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  const body = e.requestInfo().body || {};
  const user = e.app.findRecordById("users", e.auth.id);
  if (user.getBool("has_password")) throw new BadRequestError("Your username and password are already set.");

  const username = String(body.username || "").trim().toLowerCase();
  if (!o.validUsername(username)) {
    throw new BadRequestError("Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores.");
  }
  try {
    const other = e.app.findFirstRecordByData("users", "username", username);
    if (other && other.id !== user.id) throw new BadRequestError("That username is taken.");
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
  }
  const problem = o.passwordProblem(body.password, body.passwordConfirm);
  if (problem) throw new BadRequestError(problem);

  user.set("username", username);
  user.setPassword(body.password);
  user.set("has_password", true);
  e.app.save(user);
  o.log(e.app, { user, event: "credentials_set", ip: e.realIP(), ua: o.userAgent(e) });
  // changing the password invalidates the old token, so the client signs in again
  return e.json(200, { ok: true, relogin: true });
}, $apis.requireAuth("users"));

// Change your own password.
routerAdd("POST", "/api/orbat/change-password", (e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  const body = e.requestInfo().body || {};
  const user = e.app.findRecordById("users", e.auth.id);
  if (!user.getBool("has_password") || !user.validatePassword(String(body.oldPassword || ""))) {
    throw new BadRequestError("Your current password is wrong.");
  }
  const problem = o.passwordProblem(body.password, body.passwordConfirm);
  if (problem) throw new BadRequestError(problem);
  user.setPassword(body.password);
  e.app.save(user);
  o.log(e.app, { user, event: "password_changed", ip: e.realIP(), ua: o.userAgent(e) });
  return e.json(200, { ok: true, relogin: true });
}, $apis.requireAuth("users"));

// Unit Leader: clear a member's password so they must sign in with Discord and set a new one.
routerAdd("POST", "/api/orbat/admin/reset-password", (e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  if (!e.auth.getBool("is_full")) throw new ForbiddenError("Unit Leader access needed.");
  const body = e.requestInfo().body || {};
  const user = e.app.findRecordById("users", String(body.userId || ""));
  user.setPassword($security.randomString(40));
  user.set("has_password", false);
  user.set("reauth_required", false);
  user.set("session_ip", "");
  e.app.save(user);
  o.log(e.app, { user, event: "password_reset_by_admin", ip: e.realIP(), detail: "by " + e.auth.getString("username") });
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// Unit Leader: re-read everyone's Discord roles now.
routerAdd("POST", "/api/orbat/admin/sync-roles", (e) => {
  const o = require(`${__hooks}/lib/orbat.js`);
  if (!e.auth.getBool("is_full")) throw new ForbiddenError("Unit Leader access needed.");
  if (!o.config().botToken) throw new BadRequestError("DISCORD_BOT_TOKEN isn't set on the server.");
  const r = o.syncAll(e.app);
  if (!r.checked) throw new BadRequestError("Couldn't read the Discord member list. Check the bot token, that the bot is in the server, and that Server Members Intent is on.");
  return e.json(200, { updated: r.updated, removed: r.removed, unchanged: r.unchanged });
}, $apis.requireAuth("users"));

// Every night at 03:30, and once at start-up: delete Security Log entries
// older than ORBAT_SECURITY_LOG_DAYS (90 by default), so IP addresses
// aren't kept forever. The points and roster audit log is not touched.
cronAdd("orbat_security_log_cleanup", "30 3 * * *", () => {
  require(`${__hooks}/lib/orbat.js`).pruneSecurityLog($app);
});
onBootstrap((e) => {
  e.next();
  require(`${__hooks}/lib/orbat.js`).pruneSecurityLog(e.app);
});

// Every 2 minutes: keep site permissions in line with Discord roles.
// One request per 1000 members, so this stays light.
cronAdd("orbat_role_sync", "*/2 * * * *", () => {
  const o = require(`${__hooks}/lib/orbat.js`);
  if (!o.config().botToken) return;
  o.syncAll($app);
});
