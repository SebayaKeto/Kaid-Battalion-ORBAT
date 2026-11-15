// The bot's work, kept separate from the Discord connection so it can be tested.
// Every call goes to the Orbat site with the shared ORBAT_BOT_SECRET.

const PENDING = "📝";
const APPROVED = "✅";
const DENIED = "❌";

const DATE_HELP = [
  "📅 **Date of Completion** needs a Discord timestamp, so UK and US members read it the same way.",
  "Write it like `<t:1761346800:D>` (the number is the Unix time; a site like <https://hammertime.cyou> makes one for you), or use `today` / `yesterday`.",
  "Edit your post and the site updates automatically. Until then an admin has to confirm the date before approving.",
].join("\n");

const EDIT_NOTE = "✏️ This log has already been reviewed, so editing it doesn't change anything on the site. The edit has been saved in the audit log. If something was wrong, post a corrected log or ask an admin for a manual adjustment.";

// Denied log → a private thread in the log channel with the reason. Only the
// person who logged it, the admin who denied it, and members with the staff
// roles (Unit Administration, Unit Leader) are in it. Only the logger and the
// admin are pinged; staff are added silently.
function denialText(item, link) {
  const who = item.reviewerId ? `<@${item.reviewerId}>` : `**${item.reviewerName || "an admin"}**`;
  const to = item.authorId ? `<@${item.authorId}> your` : "Your";
  const self = item.authorId && item.authorId === item.reviewerId;
  return [
    self ? `❌ <@${item.authorId}> you denied your own log for **${item.title || "this training"}**.`
      : `❌ ${to} log for **${item.title || "this training"}** was denied by ${who}.`,
    `**Reason:** ${item.reason || "No reason given."}`,
    link ? `**Log:** ${link}` : "",
    `If you have any questions, ask ${who} here. To try again, post a corrected log.`,
  ].filter(Boolean).join("\n").slice(0, 1900);
}

// threads already opened, so a retry finishes the same thread instead of making another
const denialThreads = new Map();

async function denialNotice(message, item, staffRoles = []) {
  const channel = message.channel?.isThread?.() ? message.channel.parent : message.channel;
  if (!channel?.threads) throw new Error("can't find the log channel");
  const thread = denialThreads.get(item.id) || await channel.threads.create({
    name: `Denied: ${item.title || "training log"}`.slice(0, 100),
    type: 12, // ChannelType.PrivateThread
    invitable: false, // only moderators can add more people
    autoArchiveDuration: 10080,
    reason: "Training log denied on the Orbat site",
  });
  denialThreads.set(item.id, thread);
  // staff first, silently, so nobody outside the list ever sees it
  const ids = new Set([item.authorId, item.reviewerId].filter(Boolean));
  const guild = message.guild || channel.guild;
  if (guild && staffRoles.length) {
    guild.members.cache.forEach((m) => { if (!m.user?.bot && staffRoles.some((r) => m.roles.cache.has(r))) ids.add(m.id); });
  }
  for (const id of ids) await thread.members.add(id).catch((err) => console.log("[bot] couldn't add", id, "to the denial thread:", err.message));
  // the same person can log and deny it; Discord rejects a user listed twice
  const ping = [...new Set([item.authorId, item.reviewerId].filter(Boolean))];
  await thread.send({ content: denialText(item, message.url), allowedMentions: { parse: [], users: ping } });
  denialThreads.delete(item.id);
  return thread;
}

function makeApi(baseUrl, secret, log = console) {
  const base = baseUrl.replace(/\/+$/, "");
  return async function api(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Orbat-Bot-Secret": secret },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status} ${data.message || ""}`.trim());
      err.status = res.status;
      throw err;
    }
    return data;
  };
}

// Names for everyone mentioned, as shown in the server (nickname first).
function mentionNames(message) {
  const out = {};
  message.mentions?.users?.forEach((u) => { out[u.id] = u.globalName || u.username; });
  message.mentions?.members?.forEach((m) => { out[m.id] = m.displayName; });
  return out;
}

async function sendLog(api, message) {
  const result = await api("POST", "/api/orbatbot/log", {
    messageId: message.id,
    channelId: message.channelId,
    parentId: message.channel?.parentId || "",
    authorId: message.author?.id || "",
    authorName: message.member?.displayName || message.author?.globalName || message.author?.username || "",
    content: message.content || "",
    postedAt: new Date(message.createdTimestamp || Date.now()).toISOString(),
    mentions: mentionNames(message),
  });
  if (result.status === "created" || result.status === "reopened") await message.react(PENDING).catch(() => {});
  // typed dates can be misread (UK vs US), so ask for a Discord timestamp — once, when the log first arrives
  if (result.status === "created" && result.dateProblem) {
    await message.reply({ content: DATE_HELP, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
  if (result.status === "removed") await removeOwnReaction(message, PENDING);
  // edits after approval/denial change nothing; say so the first time
  if (result.editedAfterReview && result.firstEdit) {
    await message.reply({ content: EDIT_NOTE, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
  return result;
}

async function removeOwnReaction(message, emoji) {
  const r = message.reactions?.cache?.get(emoji);
  if (r && message.client?.user) await r.users.remove(message.client.user.id).catch(() => {});
}

// Approved/denied on the site → tick or cross on the Discord post.
const denialTries = new Map();
async function syncReviewed(api, fetchMessage, staffRoles = []) {
  const items = await api("GET", "/api/orbatbot/reviewed");
  const done = [];
  for (const item of items) {
    try {
      const message = await fetchMessage(item.channelId, item.messageId);
      if (message) {
        await removeOwnReaction(message, PENDING);
        if (item.status === "approved") await message.react(APPROVED);
        if (item.status === "denied") {
          await message.react(DENIED);
          try {
            await denialNotice(message, item, staffRoles);
          } catch (err) {
            // keep it private: never fall back to posting the reason in public. Retry a few times.
            const n = (denialTries.get(item.id) || 0) + 1;
            denialTries.set(item.id, n);
            console.log(`[bot] couldn't open the private denial thread for ${item.messageId} (try ${n}/5):`, err.message, "- if it's a permissions error, check the bot has Create Private Threads and Send Messages in Threads in the log channel");
            if (n < 5) continue;
          }
        }
      }
      done.push(item.id);
    } catch (err) {
      // 10008 message deleted, 10003 channel gone, 50083 thread archived: nothing left to react to
      if (err.code === 10008 || err.code === 10003 || err.code === 50083 || err.status === 404) done.push(item.id);
      else console.log("[bot] couldn't react to", item.messageId, err.message);
    }
  }
  if (done.length) await api("POST", "/api/orbatbot/notified", { ids: done });
  return done.length;
}

// Audit feed: approvals, denials, edits after review and adjustments go to
// the audit channel. Nobody is pinged from there.
async function syncAudit(api, sendTo) {
  const items = await api("GET", "/api/orbatbot/audit");
  const done = [];
  for (const item of items) {
    try {
      await sendTo(item.channelId, { content: item.text, allowedMentions: { parse: [] } });
      done.push(item.id);
    } catch (err) {
      console.log("[bot] couldn't post to the audit channel:", err.message, "- check the bot can View Channel and Send Messages there");
      break; // keep the order; try the rest next time
    }
  }
  if (done.length) await api("POST", "/api/orbatbot/audit-posted", { ids: done });
  return done.length;
}

// Names the site can match plain-text log names against.
function directoryEntry(member, left = false) {
  return {
    id: member.id,
    displayName: member.displayName || member.nickname || member.user?.globalName || member.user?.username || "",
    username: member.user?.username || "",
    globalName: member.user?.globalName || "",
    left,
  };
}

async function sendDirectory(api, members) {
  let saved = 0;
  for (let i = 0; i < members.length; i += 500) {
    const r = await api("POST", "/api/orbatbot/directory", { members: members.slice(i, i + 500).map((m) => directoryEntry(m)) });
    saved += r.saved || 0;
  }
  return saved;
}

function memberRoles(member) {
  return [...member.roles.cache.keys()].filter((id) => id !== member.guild.id); // drop @everyone
}

async function sendMember(api, member, left = false) {
  return api("POST", "/api/orbatbot/member", left
    ? { discordId: member.id, left: true }
    : { discordId: member.id, roles: memberRoles(member), nick: member.displayName });
}

module.exports = { syncAudit, denialText, denialNotice, directoryEntry, sendDirectory, makeApi, sendLog, syncReviewed, sendMember, memberRoles, mentionNames, PENDING, APPROVED, DENIED };
