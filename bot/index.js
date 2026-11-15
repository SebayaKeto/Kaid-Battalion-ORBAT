// 41st Ops bot
//  - reads training logs posted in the log channel (or threads inside it) and sends them to the site for approval
//  - keeps a copy of everyone's Discord names so logs can name people without @mentions
//  - reacts 📝 when a log is queued, then ✅ or ❌ once it's approved or denied
//  - opens a private thread on denied logs with the reason, for the logger, the admin and Unit Administration
//  - posts an audit feed (approvals, denials, edits, adjustments) in the audit channel
//  - tells the site the moment someone's Discord roles change, so access updates instantly
//
// Run it with start-orbat.ps1 (it starts alongside PocketBase), or on its own: node index.js

const fs = require("fs");
const path = require("path");
const { Client, Events, GatewayIntentBits, Partials, ActivityType } = require("discord.js");
const h = require("./handlers.js");

// settings come from ../.env (start-orbat.ps1 also passes them in)
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(path.join(__dirname, "..", ".env"));

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SECRET = process.env.ORBAT_BOT_SECRET;
const SITE = process.env.ORBAT_URL || "http://127.0.0.1:8090";
if (!TOKEN) { console.error("DISCORD_BOT_TOKEN is missing from .env"); process.exit(1); }
if (!SECRET) { console.error("ORBAT_BOT_SECRET is missing from .env (start-orbat.ps1 creates one)"); process.exit(1); }

const api = h.makeApi(SITE, SECRET);
let config = { guildId: "", logChannels: {} };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: Server Members Intent
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: Message Content Intent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

const has = (id) => !!id && Object.prototype.hasOwnProperty.call(config.logChannels, id);
// a log channel itself, or a thread inside one
const watched = (message) => has(message.channelId) || has(message.channel?.parentId);

async function fetchMessage(channelId, messageId) {
  const channel = await client.channels.fetch(channelId);
  return channel.messages.fetch(messageId);
}

async function handleLog(message) {
  try {
    if (message.partial) message = await message.fetch();
    if (message.author?.bot || !watched(message)) return;
    const r = await h.sendLog(api, message);
    if (r.status === "created" || r.status === "updated") console.log(`[bot] log ${message.id}: ${r.status}`);
  } catch (err) {
    console.log("[bot] couldn't send log", message.id, err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[bot] online as ${c.user.tag}`);
  c.user.setActivity("training logs", { type: ActivityType.Watching });
  // the site may still be starting up, so keep trying
  for (let attempt = 1; ; attempt++) {
    try {
      config = await api("GET", "/api/orbatbot/config");
      break;
    } catch (err) {
      if (attempt === 1 || attempt % 12 === 0) {
        console.log("[bot] waiting for the Orbat site at", SITE, "-", err.message);
        if (err.status === 401 || err.status === 403) console.log("      Restart with start-orbat.ps1 so the site and bot share the same ORBAT_BOT_SECRET.");
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log("[bot] connected to the Orbat site");
  // everyone's names, so logs can name people without @mentions
  try {
    const guild = await c.guilds.fetch(config.guildId);
    const members = await guild.members.fetch();
    const saved = await h.sendDirectory(api, [...members.values()]);
    console.log(`[bot] sent ${members.size} member names to the site (${saved} new or changed)`);
  } catch (err) {
    console.log("[bot] couldn't read the member list:", err.message, "- check Server Members Intent is on");
  }

  // catch up on logs posted while the bot was offline (already-seen posts are ignored)
  for (const channelId of Object.keys(config.logChannels)) {
    try {
      const channel = await c.channels.fetch(channelId);
      let checked = 0;
      if (channel.messages) {
        const recent = await channel.messages.fetch({ limit: 100 });
        for (const m of [...recent.values()].reverse()) { await handleLog(m); checked++; }
      }
      if (channel.threads) {
        const active = await channel.threads.fetchActive();
        const archived = await channel.threads.fetchArchived({ limit: 25 }).catch(() => ({ threads: new Map() }));
        for (const thread of [...active.threads.values(), ...archived.threads.values()]) {
          if (thread.parentId !== channelId) continue;
          const msgs = await thread.messages.fetch({ limit: 50 }).catch(() => new Map());
          for (const m of [...msgs.values()].reverse()) { await handleLog(m); checked++; }
        }
      }
      console.log(`[bot] watching #${channel.name} and its threads (${checked} recent posts checked)`);
    } catch (err) {
      console.log(`[bot] can't read channel ${channelId}:`, err.message, "- check the bot can View Channel and Read Message History there");
    }
  }
  if (config.auditChannel) console.log(`[bot] audit feed goes to channel ${config.auditChannel}`);
  else console.log("[bot] no ORBAT_AUDIT_CHANNEL set, so the Discord audit feed is off");
  if (config.assetsChannel) console.log(`[bot] assets log goes to channel ${config.assetsChannel}`);
  else console.log("[bot] no ORBAT_ASSETS_CHANNEL set, so the Discord assets log is off");
  const sendTo = async (channelId, payload) => (await c.channels.fetch(channelId)).send(payload);
  const tick = async () => {
    await h.syncReviewed(api, fetchMessage, config.staffRoles || []).catch((err) => console.log("[bot] review sync:", err.message));
    await h.syncAudit(api, sendTo).catch((err) => console.log("[bot] audit sync:", err.message));
  };
  tick();
  setInterval(tick, 20000);
});

client.on(Events.MessageCreate, handleLog);
client.on(Events.MessageUpdate, (_old, now) => handleLog(now));
client.on(Events.MessageDelete, async (message) => {
  if (!watched(message)) return;
  api("POST", "/api/orbatbot/log-deleted", { messageId: message.id }).catch(() => {});
});

client.on(Events.GuildMemberAdd, (member) => {
  if (config.guildId && member.guild.id !== config.guildId) return;
  h.sendDirectory(api, [member]).catch(() => {});
});

client.on(Events.GuildMemberUpdate, async (before, after) => {
  if (config.guildId && after.guild.id !== config.guildId) return;
  if (before.partial || before.displayName !== after.displayName) h.sendDirectory(api, [after]).catch(() => {});
  const oldRoles = before.partial ? null : h.memberRoles(before).sort().join(",");
  if (oldRoles !== null && oldRoles === h.memberRoles(after).sort().join(",") && before.displayName === after.displayName) return;
  try {
    const r = await h.sendMember(api, after);
    if (r.status === "updated") console.log(`[bot] roles changed for ${after.displayName}: now ${r.access}`);
  } catch (err) { console.log("[bot] role update failed:", err.message); }
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (config.guildId && member.guild.id !== config.guildId) return;
  api("POST", "/api/orbatbot/directory", { members: [h.directoryEntry(member, true)] }).catch(() => {});
  h.sendMember(api, member, true).then((r) => { if (r.status === "removed") console.log(`[bot] ${member.displayName} left: site access removed`); }).catch(() => {});
});

client.on(Events.Error, (err) => console.log("[bot] discord error:", err.message));

client.login(TOKEN).catch((err) => {
  console.error("[bot] Discord login failed:", err.message);
  if (/disallowed intents/i.test(err.message)) console.error("      Turn on Server Members Intent and Message Content Intent on the Bot page of the Developer Portal.");
  process.exit(1);
});
