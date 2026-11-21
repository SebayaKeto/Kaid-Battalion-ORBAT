// Shared helpers for the 41st Orbat hooks. Loaded inside each handler with
// require(`${__hooks}/lib/orbat.js`), because every hook runs in its own VM.

const PERMS = ["can_points", "can_promotions", "can_transfers", "can_recruitment", "can_assets", "can_manage_logs", "can_approve_assets", "can_edit_codex", "is_full"];

function parseChannels(v) {
  const out = {};
  v.split(",").forEach((pair) => {
    const bits = pair.trim().split(":");
    if (/^\d+$/.test(bits[0] || "")) out[bits[0]] = bits[1] === "operation" ? "operation" : "training";
  });
  return out;
}

function config() {
  return {
    guildId: $os.getenv("DISCORD_GUILD_ID") || "1563587481214124042",
    botToken: $os.getenv("DISCORD_BOT_TOKEN") || "",
    discordApi: ($os.getenv("DISCORD_API_BASE") || "https://discord.com/api/v10").replace(/\/+$/, ""),
    // strict = exact IP match, subnet = same /24 (IPv4) or /64 (IPv6), off = no check
    ipMode: ($os.getenv("ORBAT_IP_MODE") || "strict").toLowerCase(),
    // shared secret the Ops bot sends with every call
    botSecret: $os.getenv("ORBAT_BOT_SECRET") || "",
    // "channelId:training,channelId:operation" — which Discord channels hold logs
    logChannels: parseChannels($os.getenv("ORBAT_LOG_CHANNELS") || "1563587741445267527:training"),
    // where the bot posts the audit feed; empty turns it off
    auditChannel: String($os.getenv("ORBAT_AUDIT_CHANNEL") || "").replace(/\D/g, ""),
    // Assets page changes go here instead of the audit channel
    assetsChannel: String($os.getenv("ORBAT_ASSETS_CHANNEL") || "").replace(/\D/g, ""),
    // roles added to private denial threads: Unit Administration and Unit Leader
    staffRoles: String($os.getenv("ORBAT_DENIAL_ROLES") || "1563588894992244757,1563589204099997787").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x)),
  };
}

// Looks a user up in the 41st Discord server with the bot token.
// Returns { checked: false } when no bot token is configured or Discord can't be reached.
function fetchGuildMember(discordId) {
  const cfg = config();
  if (!cfg.botToken || !discordId) return { checked: false };
  let res;
  try {
    res = $http.send({
      url: `${cfg.discordApi}/guilds/${cfg.guildId}/members/${discordId}`,
      method: "GET",
      headers: { Authorization: `Bot ${cfg.botToken}` },
      timeout: 10,
    });
  } catch (err) {
    console.log("[orbat] discord lookup failed:", err);
    return { checked: false };
  }
  if (res.statusCode === 404) return { checked: true, inGuild: false, roles: [] };
  if (res.statusCode !== 200) {
    console.log("[orbat] discord lookup returned", res.statusCode);
    return { checked: false };
  }
  const m = res.json || {};
  return {
    checked: true,
    inGuild: true,
    roles: m.roles || [],
    nick: m.nick || (m.user && (m.user.global_name || m.user.username)) || "",
  };
}

// Recomputes a user's permission flags from their Discord roles and the role_map table.
// Discord roles → { flags, label } from the role map
function permsFor(app, roles) {
  const rows = app.findAllRecords("role_map");
  const flags = {};
  PERMS.forEach((p) => (flags[p] = false));
  let label = "Member";
  let best = -Infinity;
  rows.forEach((row) => {
    if (roles.indexOf(row.getString("discord_role_id")) === -1) return;
    PERMS.forEach((p) => { if (row.getBool(p)) flags[p] = true; });
    const pr = row.getInt("priority");
    if (pr > best) { best = pr; label = row.getString("label"); }
  });
  return { flags, label };
}

// Only staff sign in; everyone else views the ORBAT without an account.
function isStaff(userOrFlags) {
  return PERMS.some((p) => (typeof userOrFlags.getBool === "function" ? userOrFlags.getBool(p) : !!userOrFlags[p]));
}
const NOT_STAFF = "Only staff need to sign in. The ORBAT, points and assets are open to view without an account.";

function applyRoles(app, user, roles) {
  const { flags, label } = permsFor(app, roles);
  PERMS.forEach((p) => user.set(p, flags[p]));
  user.set("discord_roles", roles);
  user.set("access_label", label);
}

function clearRoles(user, label) {
  PERMS.forEach((p) => user.set(p, false));
  user.set("discord_roles", []);
  user.set("access_label", label || "No access");
}

function sameNetwork(a, b, mode) {
  if (mode === "off") return true;
  if (!a || !b) return false;
  if (a === b) return true;
  if (mode !== "subnet") return false;
  if (a.indexOf(":") === -1 && b.indexOf(":") === -1) {
    return a.split(".").slice(0, 3).join(".") === b.split(".").slice(0, 3).join(".");
  }
  return a.split(":").slice(0, 4).join(":") === b.split(":").slice(0, 4).join(":");
}

function log(app, entry) {
  try {
    const col = app.findCollectionByNameOrId("security_log");
    const r = new Record(col);
    r.set("user", entry.user ? entry.user.id : "");
    r.set("event", entry.event);
    r.set("method", entry.method || "");
    r.set("ip", entry.ip || "");
    r.set("prev_ip", entry.prevIp || "");
    r.set("user_agent", (entry.ua || "").slice(0, 300));
    r.set("detail", (entry.detail || "").slice(0, 500));
    app.save(r);
  } catch (err) {
    console.log("[orbat] security log write failed:", err);
  }
}

// How many days the Security Log keeps entries (IP addresses, browsers).
// ORBAT_SECURITY_LOG_DAYS in .env; 90 when unset, 0 keeps everything.
function securityLogDays() {
  const raw = String($os.getenv("ORBAT_SECURITY_LOG_DAYS") || "").trim();
  if (raw === "") return 90;
  const n = parseInt(raw, 10);
  return /^\d+$/.test(raw) && n >= 0 ? n : 90;
}

// "2026-08-23 03:30:00.000Z": the moment `days` before now, in the format
// PocketBase stores dates in, so it compares correctly as text.
function securityLogCutoff(days, nowMs) {
  return new Date(nowMs - days * 86400000).toISOString().replace("T", " ");
}

// Deletes Security Log entries older than the keep period. Returns how many went.
function pruneSecurityLog(app) {
  const days = securityLogDays();
  if (!days) return 0;
  try { app.findCollectionByNameOrId("security_log"); } catch (_) { return 0; } // first start: the migration hasn't run yet
  try {
    const res = app.db().newQuery("DELETE FROM security_log WHERE created < {:cut}")
      .bind({ cut: securityLogCutoff(days, Date.now()) }).execute();
    const n = res && typeof res.rowsAffected === "function" ? res.rowsAffected() : 0;
    if (n) console.log(`[orbat] security log: removed ${n} entries older than ${days} days`);
    return n;
  } catch (err) {
    console.log("[orbat] security log cleanup failed:", err);
    return 0;
  }
}

// Reads every member of the 41st Discord in pages of 1000 (one request per
// page, needs the Server Members Intent). Returns { checked: false } on any failure.
function fetchAllGuildMembers() {
  const cfg = config();
  if (!cfg.botToken) return { checked: false };
  const members = {};
  let after = "0";
  for (let page = 0; page < 50; page++) {
    let res;
    try {
      res = $http.send({
        url: `${cfg.discordApi}/guilds/${cfg.guildId}/members?limit=1000&after=${after}`,
        method: "GET",
        headers: { Authorization: `Bot ${cfg.botToken}` },
        timeout: 20,
      });
    } catch (err) {
      console.log("[orbat] discord member list failed:", err);
      return { checked: false };
    }
    if (res.statusCode !== 200 || !Array.isArray(res.json)) {
      console.log("[orbat] discord member list returned", res.statusCode);
      return { checked: false };
    }
    res.json.forEach((m) => {
      if (!m.user || !m.user.id) return;
      members[m.user.id] = { roles: m.roles || [], nick: m.nick || m.user.global_name || m.user.username || "" };
      after = m.user.id;
    });
    if (res.json.length < 1000) return { checked: true, members };
  }
  return { checked: false };
}

// Brings every account in line with Discord. Only saves accounts that changed.
// Returns { checked, updated, removed, unchanged }.
function syncAll(app) {
  const list = fetchAllGuildMembers();
  if (!list.checked) return { checked: false, updated: 0, removed: 0, unchanged: 0 };
  let updated = 0, removed = 0, unchanged = 0;
  app.findAllRecords("users").forEach((u) => {
    const id = u.getString("discord_id");
    if (!id) return;
    const before = accessKey(u);
    const m = list.members[id];
    if (!m) {
      if (u.getString("access_label") === "Left Discord") { unchanged++; return; }
      clearRoles(u, "Left Discord");
      u.set("reauth_required", true);
      app.save(u);
      log(app, { user: u, event: "access_removed_left_server" });
      removed++;
      return;
    }
    const rolesBefore = storedRoles(u);
    applyRoles(app, u, m.roles);
    if (accessKey(u) === before && rolesBefore === m.roles.slice().sort().join(",")) { unchanged++; return; }
    app.save(u);
    updated++;
  });
  return { checked: true, updated, removed, unchanged };
}

function accessKey(u) {
  return JSON.stringify([PERMS.map((p) => u.getBool(p)), u.getString("access_label")]);
}

function storedRoles(u) {
  try {
    const r = JSON.parse(u.getString("discord_roles") || "[]");
    return Array.isArray(r) ? r.slice().sort().join(",") : "";
  } catch (_) { return ""; }
}

// Bot routes: the Ops bot proves itself with ORBAT_BOT_SECRET.
function requireBot(e) {
  const secret = config().botSecret;
  const sent = e.request.header.get("X-Orbat-Bot-Secret") || "";
  if (!secret || secret.length < 16) throw new ForbiddenError("ORBAT_BOT_SECRET isn't set on the server.");
  if (!$security.equal(sent, secret)) throw new UnauthorizedError("Bad bot secret.");
}

function userAgent(e) {
  try { return e.request.header.get("User-Agent") || ""; } catch (_) { return ""; }
}

function summary(user) {
  const out = {
    id: user.id,
    username: user.getString("username"),
    discordName: user.getString("discord_name"),
    discordLinked: !!user.getString("discord_id"),
    discordId: user.getString("discord_id"),
    guildId: config().guildId,
    accessLabel: user.getString("access_label") || "Member",
    needsSetup: !user.getBool("has_password"),
    perms: {},
  };
  PERMS.forEach((p) => (out.perms[p] = user.getBool(p)));
  return out;
}

function validUsername(u) {
  return /^[a-z0-9_.-]{3,32}$/.test(u);
}

function passwordProblem(pw, confirm) {
  if (typeof pw !== "string" || pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 72) return "Password must be 72 characters or fewer.";
  if (pw !== confirm) return "Passwords don't match.";
  return "";
}

module.exports = { securityLogDays, securityLogCutoff, pruneSecurityLog, PERMS, NOT_STAFF, permsFor, isStaff, config, requireBot, fetchGuildMember, fetchAllGuildMembers, syncAll, applyRoles, clearRoles, sameNetwork, log, userAgent, summary, validUsername, passwordProblem };
