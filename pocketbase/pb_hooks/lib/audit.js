// Audit trail helpers. One row per thing that happened to a log or to points.
//
// actions:
//   logged                     new log from Discord, or an event created on the site
//   post_edited                Discord post edited while pending (site updated to match)
//   post_edited_after_review   Discord post edited after approval/denial (ignored, kept for the record)
//   post_deleted_after_review  Discord post deleted after approval/denial
//   withdrawn                  pending log closed because its post was deleted or is no longer a log
//   details_changed            type, title, date or host platoon changed on the site
//   date_confirmed             admin confirmed a date that wasn't a Discord timestamp
//   attendee_added / attendee_changed / attendee_removed
//   reopened                   a withdrawn log whose post was edited back into a log
//   approved / denied
//   points_adjusted            manual adjustment
//   retracted                  log retracted: its points taken back, the log kept
//   reopened_for_edit          reviewed log put back in the queue to edit (points off until re-approved)
//   member_registered / member_updated   Orbat registration and edits
//   award_added / award_revoked  qualifications and certifications on trooper profiles
//   asset_*                    Assets page changes; posted in the Assets log channel instead

const TO_DISCORD = ["retracted", "reopened_for_edit", "approved", "denied", "post_edited_after_review", "post_deleted_after_review", "points_adjusted", "member_registered", "member_updated", "member_assigned", "member_unassigned", "award_added", "award_revoked",
  "asset_logged", "asset_retracted", "asset_type_submitted", "asset_type_approved", "asset_type_denied", "asset_type_changed",
  "asset_type_retired", "asset_type_restored", "asset_preset_saved", "asset_preset_deleted", "asset_supply_set"];

function write(app, entry) {
  try {
    const r = new Record(app.findCollectionByNameOrId("audit_log"));
    r.set("event", entry.event ? entry.event.id : "");
    r.set("event_title", entry.event ? eventLabel(entry.event) : String(entry.eventTitle || "").slice(0, 200));
    r.set("member", entry.member || "");
    r.set("action", entry.action);
    r.set("actor", entry.actor ? entry.actor.id : "");
    r.set("actor_name", String(entry.actorName || (entry.actor ? entry.actor.getString("username") : "")).slice(0, 100));
    r.set("detail", String(entry.detail || "").slice(0, 1000));
    r.set("before_text", String(entry.before || "").slice(0, 6000));
    r.set("after_text", String(entry.after || "").slice(0, 6000));
    r.set("to_discord", TO_DISCORD.indexOf(entry.action) !== -1);
    r.set("discord_posted", false);
    app.save(r);
  } catch (err) {
    console.log("[orbat] audit write failed:", err);
  }
}

// "CPL-7567 \"Rex\" (trainee, point)" for one attendance row
function attendeeText(app, row) {
  let name = row.getString("name");
  try { if (row.getString("member")) name = app.findRecordById("members", row.getString("member")).getString("display_name"); } catch (_) {}
  return `${name || "unnamed"} (${row.getString("role") || "attendee"}, ${row.getBool("award_point") ? "point" : "no point"})`;
}

function eventLabel(ev) {
  const kind = ev.getString("type") === "operation" ? "Operation" : "Training";
  return (kind + (ev.getString("title") ? ": " + ev.getString("title") : "")).slice(0, 200);
}

function day(iso) {
  const d = new Date(String(iso || "").replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d.getUTCDate() + " " + m[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

// The message the bot posts in the Discord audit channel for one row.
function discordText(app, row, guildId) {
  const unix = Math.floor(new Date(row.getString("created").replace(" ", "T")).getTime() / 1000);
  const who = row.getString("actor_name") || "someone";
  const title = row.getString("event_title") || "a log";
  let ev = null;
  try { if (row.getString("event")) ev = app.findRecordById("events", row.getString("event")); } catch (_) {}
  const action = row.getString("action");
  const link = ev && ev.getString("discord_message_id") && action !== "post_deleted_after_review"
    ? ` · [post](<https://discord.com/channels/${guildId}/${ev.getString("discord_channel_id")}/${ev.getString("discord_message_id")}>)`
    : "";
  const when = ev ? ` (${day(ev.getString("event_date"))})` : "";
  const detail = row.getString("detail") && action !== "post_edited_after_review" ? "\n> " + row.getString("detail").replace(/\n/g, "\n> ") : "";
  const head = {
    approved: `✅ **${title}**${when} approved by **${who}**`,
    denied: `❌ **${title}**${when} denied by **${who}**`,
    retracted: `🚫 **${title}**${when} retracted by **${who}**`,
    reopened_for_edit: `🔓 **${title}**${when} reopened to edit by **${who}**`,
    post_edited_after_review: `✏️ **${who.replace(/^Discord · /, "")}** edited the Discord post for **${title}**${when} after it was reviewed. Nothing on the site changed; the edit is saved on the site.`,
    post_deleted_after_review: `🗑️ The Discord post for **${title}**${when} was deleted after it was reviewed.`,
    points_adjusted: `🧮 Manual points adjustment by **${who}**`,
    member_registered: `📋 **${title}** registered by **${who}**`,
    member_updated: `🪪 **${title}** updated by **${who}**`,
    member_assigned: `🔀 **${title}** placed by **${who}**`,
    member_unassigned: `↩️ **${title}** taken out of their slot by **${who}**`,
    award_added: `🎖️ Qualification or certification added for **${title}** by **${who}**`,
    award_revoked: `➖ Qualification or certification taken off **${title}** by **${who}**`,
    asset_logged: `📦 **Assets logged** by **${who}** · ${title}`,
    asset_retracted: `🚫 Asset entry **${title}** retracted by **${who}**`,
    asset_type_submitted: `🆕 New asset type **${title}** submitted by **${who}**, waiting for approval`,
    asset_type_approved: `✅ New asset type **${title}** approved by **${who}**`,
    asset_type_denied: `❌ New asset type **${title}** denied by **${who}**`,
    asset_type_changed: `🛠️ Asset type **${title}** changed by **${who}**`,
    asset_type_retired: `📁 Asset type **${title}** retired by **${who}**`,
    asset_type_restored: `📂 Asset type **${title}** restored by **${who}**`,
    asset_preset_saved: `🗂️ Starting-supply preset **${title}** saved by **${who}**`,
    asset_preset_deleted: `🗑️ Starting-supply preset **${title}** deleted by **${who}**`,
    asset_supply_set: `🚚 Starting supply for **${title}** set by **${who}**`,
  }[action] || `${row.getString("action")} by ${who}`;
  return `${head} · <t:${unix}:f>${link}${detail}`.slice(0, 1900);
}

module.exports = { day, write, attendeeText, eventLabel, discordText, TO_DISCORD };
