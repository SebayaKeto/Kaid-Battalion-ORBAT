// Assets page: what each unit holds in a campaign, and every gain and loss.
//
// Counts are never stored. They are the sum of a campaign's entries that
// aren't retracted. Starting supply is entries with is_start = true, so it is
// part of the count but not a "gain".
//
// Permissions:
//   can_assets          log gains and losses, retract entries, submit and edit
//                       asset types, manage starting supply
//   can_approve_assets  approve or deny new asset types (Unit Leader only by default)

const CATEGORIES = ["Vehicle", "Weapon", "Supply"];
const EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

const iso = (d) => d.toISOString().slice(0, 10);
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(new Date(s + "T00:00:00Z")) === s;
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const now = () => new Date().toISOString().replace("T", " ");

function canLog(auth) { return !!auth && (auth.getBool("can_assets") || auth.getBool("is_full")); }
function canApprove(auth) { return !!auth && auth.getBool("can_approve_assets"); }
function needLog(auth) { if (!canLog(auth)) throw new ForbiddenError("Assets access needed."); }
function who(auth) { return require(`${__hooks}/lib/points.js`).actorLabel(auth); }
function audit(app, auth, action, title, detail) {
  require(`${__hooks}/lib/audit.js`).write(app, { eventTitle: title, action, actor: auth, actorName: who(auth), detail });
}

function json(r, field) {
  try { const v = JSON.parse(r.getString(field) || "null"); return v == null ? null : v; } catch (_) { return null; }
}

// Battalion Command, the line platoons and Ranger, in ORBAT order.
// Air Wing flies the platoons' vehicles and Navy holds nothing, so neither is tracked.
function units(app) {
  return app.findRecordsByFilter("orbat_units", "key = 'battalion' || kind = 'line' || kind = 'ranger'", "sort", 0, 0)
    .map((u) => ({ key: u.getString("key"), name: u.getString("name"), color: u.getString("color") }));
}
function unitMap(app) { const m = {}; units(app).forEach((u) => { m[u.key] = u; }); return m; }

function typeOut(r) {
  return {
    id: r.id, name: r.getString("name"), category: r.getString("category"), image: r.getString("image"),
    units: json(r, "units") || [], sort: r.getInt("sort"), status: r.getString("status"), retired: r.getBool("retired"),
    submittedBy: r.getString("submitted_name"), submittedAt: r.getString("created"),
    reviewedBy: r.getString("reviewed_name"), reviewedAt: r.getString("reviewed_at"), reviewNote: r.getString("review_note"),
  };
}

function entryOut(r) {
  return {
    id: r.id, unit: r.getString("unit"), type: r.getString("type"), delta: r.getInt("delta"), date: r.getString("entry_date"),
    reason: r.getString("reason"), eventLabel: r.getString("event_label"), isStart: r.getBool("is_start"),
    by: r.getString("logged_name"), created: r.getString("created"), batch: r.getString("batch"),
    retracted: r.getBool("retracted"), retractReason: r.getString("retract_reason"), retractedBy: r.getString("retracted_name"), retractedAt: r.getString("retracted_at"),
  };
}

function campaignOf(app, id) {
  const c = require(`${__hooks}/lib/campaigns.js`);
  if (id) { try { return app.findRecordById("campaigns", id); } catch (_) { throw new NotFoundError("That campaign doesn't exist."); } }
  const cur = c.current(app);
  if (!cur) throw new BadRequestError("There is no current campaign. Start one on the Points page.");
  return cur;
}

// everything the page needs for one campaign
function summary(app, campaignId, auth) {
  const camp = campaignOf(app, campaignId);
  const staff = canLog(auth) || canApprove(auth);
  const campaigns = app.findRecordsByFilter("campaigns", "id != ''", "-starts_on", 0, 0).map((c) => ({
    id: c.id, name: c.getString("name"), startsOn: c.getString("starts_on"), endsOn: c.getString("ends_on"),
    current: !c.getString("ends_on"), assetStart: c.getString("asset_start"),
  }));
  const types = app.findRecordsByFilter("asset_types", staff ? "id != ''" : "status = 'approved'", "sort,name", 0, 0).map(typeOut);
  const entries = app.findRecordsByFilter("asset_entries", "campaign = {:c}", "entry_date,created", 0, 0, { c: camp.id }).map(entryOut);
  const out = {
    campaign: campaigns.find((c) => c.id === camp.id), campaigns, units: units(app), types, entries,
    today: iso(new Date()), canLog: canLog(auth), canApprove: canApprove(auth),
  };
  if (canLog(auth)) {
    out.presets = app.findRecordsByFilter("asset_presets", "id != ''", "name", 0, 0).map((p) => ({ id: p.id, name: p.getString("name"), rows: json(p, "rows") || [] }));
    // approved operations and trainings to link entries to, newest first
    const from = iso(new Date(Date.now() - 120 * 86400000));
    out.events = app.findRecordsByFilter("events", "status = 'approved' && event_date >= {:f}", "-event_date", 200, 0, { f: from + " 00:00:00.000Z" }).map((ev) => ({
      id: ev.id, label: eventLabel(ev),
    }));
  }
  return out;
}

function eventLabel(ev) {
  const audit = require(`${__hooks}/lib/audit.js`);
  const d = audit.day(ev.getString("event_date"));
  return (audit.eventLabel(ev) + (d ? ` (${d})` : "")).slice(0, 200);
}

// held now for every unit/type in a campaign: { "acklay|typeId": n }
function heldMap(app, campaignId) {
  const rows = arrayOf(new DynamicModel({ unit: "", type: "", n: 0 }));
  app.db().newQuery("SELECT unit, type, SUM(delta) AS n FROM asset_entries WHERE campaign = {:c} AND COALESCE(retracted, FALSE) = FALSE GROUP BY unit, type")
    .bind({ c: campaignId }).all(rows);
  const m = {};
  rows.forEach((r) => { m[r.unit + "|" + r.type] = r.n; });
  return m;
}

function approvedType(app, id) {
  let t = null;
  try { t = app.findRecordById("asset_types", String(id || "")); } catch (_) {}
  if (!t || t.getString("status") !== "approved") throw new BadRequestError("That asset type doesn't exist or isn't approved yet.");
  return t;
}

function sign(n) { return n > 0 ? "+" + n : String(n); }

// LOG CHANGES: several lines sharing one date, reason and operation.
// A line that takes a count below zero is refused unless allowNegative is set;
// the answer then lists the lines so the page can ask "Log anyway?".
function log(app, body, auth) {
  needLog(auth);
  const camp = campaignOf(app, "");
  const date = String(body.date || "").trim();
  if (!validDate(date)) throw new BadRequestError("Pick the date it happened.");
  if (date < camp.getString("starts_on")) throw new BadRequestError(`${camp.getString("name")} started on ${camp.getString("starts_on")}. Pick a date after that.`);
  if (date > iso(new Date(Date.now() + 86400000))) throw new BadRequestError("The date can't be in the future.");
  const reason = clean(body.reason, 300);
  if (reason.length < 3) throw new BadRequestError("Say why, for example \"Shot down over the LZ\".");
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) throw new BadRequestError("Add at least one line.");
  if (lines.length > 40) throw new BadRequestError("40 lines at most per entry.");

  let event = null;
  if (body.eventId) {
    try { event = app.findRecordById("events", String(body.eventId)); } catch (_) {}
    if (!event || event.getString("status") !== "approved") throw new BadRequestError("That operation isn't an approved log.");
  }

  const um = unitMap(app);
  const held = heldMap(app, camp.id);
  const typeCache = {};
  const checked = lines.map((l, i) => {
    const n = i + 1;
    const unit = String(l.unit || "");
    if (!um[unit]) throw new BadRequestError(`Line ${n}: pick a unit.`);
    const t = typeCache[l.type] || (typeCache[l.type] = approvedType(app, l.type));
    if (t.getBool("retired")) throw new BadRequestError(`Line ${n}: ${t.getString("name")} is retired and can't be logged.`);
    if ((json(t, "units") || []).indexOf(unit) === -1) throw new BadRequestError(`Line ${n}: ${um[unit].name} doesn't hold ${t.getString("name")}. Add the unit to it under Asset Types first.`);
    const delta = Number(l.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 9999) throw new BadRequestError(`Line ${n}: the quantity has to be a whole number from 1 to 9999.`);
    return { unit, type: t, delta };
  });

  // running totals, so two losses of the same thing in one entry add up
  const run = {};
  const below = [];
  checked.forEach((l) => {
    const k = l.unit + "|" + l.type.id;
    if (!(k in run)) run[k] = held[k] || 0;
    run[k] += l.delta;
    if (l.delta < 0 && run[k] < 0) below.push({ unit: um[l.unit].name, type: l.type.getString("name"), after: run[k] });
  });
  if (below.length && !body.allowNegative) return { needsConfirm: true, below };

  const batch = $security.randomString(12);
  const name = who(auth);
  const col = app.findCollectionByNameOrId("asset_entries");
  app.runInTransaction((tx) => {
    checked.forEach((l) => {
      const r = new Record(col);
      r.load({
        campaign: camp.id, unit: l.unit, type: l.type.id, delta: l.delta, entry_date: date, reason,
        event: event ? event.id : "", event_label: event ? eventLabel(event) : "", is_start: false, batch,
        logged_by: auth.id, logged_name: name, retracted: false,
      });
      tx.save(r);
    });
    const detail = checked.map((l) => `${um[l.unit].name}: ${l.type.getString("name")} ${sign(l.delta)}`).join("\n") +
      `\nReason: ${reason}` + (event ? `\nOperation: ${eventLabel(event)}` : "") + `\nDate: ${date}` +
      (below.length ? `\nLogged below zero: ${below.map((b) => `${b.unit} ${b.type} (${b.after})`).join(", ")}` : "");
    const gains = checked.filter((l) => l.delta > 0).length, losses = checked.length - gains;
    audit(tx, auth, "asset_logged", `${camp.getString("name")}: ${gains ? gains + " gain" + (gains > 1 ? "s" : "") : ""}${gains && losses ? ", " : ""}${losses ? losses + " loss" + (losses > 1 ? "es" : "") : ""}`, detail);
  });
  return { saved: checked.length, batch };
}

function retract(app, id, body, auth) {
  needLog(auth);
  let r = null;
  try { r = app.findRecordById("asset_entries", id); } catch (_) {}
  if (!r) throw new NotFoundError("That entry doesn't exist.");
  if (r.getBool("retracted")) throw new BadRequestError("That entry is already retracted.");
  const reason = clean(body.reason, 300);
  if (reason.length < 3) throw new BadRequestError("Give a reason for retracting it.");
  r.set("retracted", true);
  r.set("retract_reason", reason);
  r.set("retracted_name", who(auth));
  r.set("retracted_at", now());
  app.save(r);
  const um = unitMap(app);
  let tname = "an asset";
  try { tname = app.findRecordById("asset_types", r.getString("type")).getString("name"); } catch (_) {}
  const unitName = (um[r.getString("unit")] || {}).name || r.getString("unit");
  audit(app, auth, "asset_retracted", `${unitName}: ${tname} ${sign(r.getInt("delta"))}`,
    `Logged ${r.getString("entry_date")} by ${r.getString("logged_name")}: ${r.getString("reason")}\nRetracted because: ${reason}`);
  return { ok: true };
}

// ── asset types ──────────────────────────────────────────────────────────
function cleanUnits(app, list) {
  const um = unitMap(app);
  const out = [];
  (Array.isArray(list) ? list : []).forEach((k) => { k = String(k); if (um[k] && out.indexOf(k) === -1) out.push(k); });
  return out;
}

function nameTaken(app, name, exceptId) {
  const rows = app.findRecordsByFilter("asset_types", "status != 'denied' && id != {:x}", "", 0, 0, { x: exceptId || "" });
  return rows.some((r) => r.getString("name").toLowerCase() === name.toLowerCase());
}

function unitNames(app, keys) {
  const um = unitMap(app);
  return keys.map((k) => (um[k] || {}).name || k).join(", ") || "no units";
}

// a new type waits as pending until someone with can_approve_assets reviews it
function submitType(app, body, auth) {
  needLog(auth);
  const name = clean(body.name, 60);
  if (name.length < 2) throw new BadRequestError("Give the asset type a name.");
  if (nameTaken(app, name, "")) throw new BadRequestError(`There is already an asset type called ${name}.`);
  const category = String(body.category || "");
  if (CATEGORIES.indexOf(category) === -1) throw new BadRequestError("Pick Vehicle, Weapon or Supply.");
  const keys = cleanUnits(app, body.units);
  const r = new Record(app.findCollectionByNameOrId("asset_types"));
  r.load({ name, category, units: keys, sort: 0, status: "pending", retired: false, submitted_by: auth.id, submitted_name: who(auth) });
  app.save(r);
  audit(app, auth, "asset_type_submitted", name, `${category} for ${unitNames(app, keys)}. Waiting for approval.`);
  return typeOut(r);
}

function reviewType(app, id, body, auth) {
  if (!canApprove(auth)) throw new ForbiddenError("Only the Unit Leader can approve or deny asset types.");
  let r = null;
  try { r = app.findRecordById("asset_types", id); } catch (_) {}
  if (!r) throw new NotFoundError("That asset type doesn't exist.");
  if (r.getString("status") !== "pending") throw new BadRequestError("That asset type has already been reviewed.");
  const approve = body.decision === "approve";
  const note = clean(body.note, 300);
  if (!approve && note.length < 3) throw new BadRequestError("Give a reason for denying it.");
  if (approve && nameTaken(app, r.getString("name"), r.id)) throw new BadRequestError(`There is already an asset type called ${r.getString("name")}.`);
  if (approve) {
    let top = 0;
    app.findRecordsByFilter("asset_types", "status = 'approved'", "-sort", 1, 0).forEach((t) => { top = t.getInt("sort"); });
    r.set("sort", top + 10);
  }
  r.set("status", approve ? "approved" : "denied");
  r.set("reviewed_name", who(auth));
  r.set("reviewed_at", now());
  r.set("review_note", note);
  app.save(r);
  audit(app, auth, approve ? "asset_type_approved" : "asset_type_denied", r.getString("name"),
    `${r.getString("category")}, submitted by ${r.getString("submitted_name")}.` + (note ? `\n${approve ? "Note" : "Reason"}: ${note}` : ""));
  return typeOut(r);
}

// rename, re-categorise, change which units hold it, retire or restore
function updateType(app, id, body, auth) {
  needLog(auth);
  let r = null;
  try { r = app.findRecordById("asset_types", id); } catch (_) {}
  if (!r) throw new NotFoundError("That asset type doesn't exist.");
  if (r.getString("status") !== "approved") throw new BadRequestError("Only approved asset types can be changed.");
  const changes = [];
  if (body.name !== undefined) {
    const name = clean(body.name, 60);
    if (name.length < 2) throw new BadRequestError("Give the asset type a name.");
    if (name !== r.getString("name")) {
      if (nameTaken(app, name, r.id)) throw new BadRequestError(`There is already an asset type called ${name}.`);
      changes.push(`Renamed from ${r.getString("name")} to ${name}.`);
      r.set("name", name);
    }
  }
  if (body.category !== undefined && body.category !== r.getString("category")) {
    if (CATEGORIES.indexOf(body.category) === -1) throw new BadRequestError("Pick Vehicle, Weapon or Supply.");
    changes.push(`Category: ${r.getString("category")} → ${body.category}.`);
    r.set("category", body.category);
  }
  if (body.units !== undefined) {
    const before = json(r, "units") || [];
    const after = cleanUnits(app, body.units);
    const added = after.filter((k) => before.indexOf(k) === -1), removed = before.filter((k) => after.indexOf(k) === -1);
    if (added.length || removed.length) {
      changes.push((added.length ? `Added ${unitNames(app, added)}. ` : "") + (removed.length ? `Removed ${unitNames(app, removed)}.` : ""));
      r.set("units", after);
    }
  }
  if (body.retired !== undefined && !!body.retired !== r.getBool("retired")) {
    changes.push(body.retired ? "Retired: it keeps its history but can't be logged." : "Restored: it can be logged again.");
    r.set("retired", !!body.retired);
  }
  if (!changes.length) return typeOut(r);
  app.save(r);
  const action = body.retired !== undefined && changes.length === 1 && /^(Retired|Restored)/.test(changes[0])
    ? (body.retired ? "asset_type_retired" : "asset_type_restored") : "asset_type_changed";
  audit(app, auth, action, r.getString("name"), changes.join("\n").trim());
  return typeOut(r);
}

// image upload (multipart "image") or {remove: true}
function setImage(app, id, e, auth) {
  needLog(auth);
  let r = null;
  try { r = app.findRecordById("asset_types", id); } catch (_) {}
  if (!r) throw new NotFoundError("That asset type doesn't exist.");
  let files = [];
  try { files = e.findUploadedFiles("image") || []; } catch (_) { files = []; }
  if (files.length) r.set("image", files[0]);
  else if ((e.requestInfo().body || {}).remove) r.set("image", null);
  else throw new BadRequestError("Pick an image.");
  app.save(r);
  audit(app, auth, "asset_type_changed", r.getString("name"), files.length ? "New image." : "Image removed.");
  return typeOut(r);
}

// ── starting supply ──────────────────────────────────────────────────────
function cleanRows(app, rows) {
  const um = unitMap(app);
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach((row, i) => {
    const qty = Number(row.qty);
    if (!um[row.unit]) throw new BadRequestError(`Row ${i + 1}: pick a unit.`);
    const t = approvedType(app, row.type);
    if ((json(t, "units") || []).indexOf(row.unit) === -1) throw new BadRequestError(`Row ${i + 1}: ${um[row.unit].name} doesn't hold ${t.getString("name")}.`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) throw new BadRequestError(`Row ${i + 1}: the quantity has to be a whole number from 1 to 9999.`);
    const dup = out.find((o) => o.unit === row.unit && o.type === t.id);
    if (dup) dup.qty += qty; else out.push({ unit: row.unit, type: t.id, qty });
  });
  return out;
}

function savePreset(app, body, auth) {
  needLog(auth);
  const name = clean(body.name, 60);
  if (name.length < 2) throw new BadRequestError("Give the preset a name.");
  const rows = cleanRows(app, body.rows);
  if (!rows.length) throw new BadRequestError("Add at least one row.");
  let r;
  if (body.id) { try { r = app.findRecordById("asset_presets", String(body.id)); } catch (_) { throw new NotFoundError("That preset doesn't exist."); } }
  else r = new Record(app.findCollectionByNameOrId("asset_presets"));
  const isNew = !body.id;
  r.set("name", name);
  r.set("rows", rows);
  app.save(r);
  audit(app, auth, "asset_preset_saved", name, `${isNew ? "New preset" : "Preset edited"}: ${rows.length} row${rows.length > 1 ? "s" : ""}, ${rows.reduce((s, x) => s + x.qty, 0)} items in all.`);
  return { id: r.id, name, rows };
}

function deletePreset(app, id, auth) {
  needLog(auth);
  let r = null;
  try { r = app.findRecordById("asset_presets", id); } catch (_) {}
  if (!r) throw new NotFoundError("That preset doesn't exist.");
  const name = r.getString("name");
  app.delete(r);
  audit(app, auth, "asset_preset_deleted", name, "Preset deleted. Campaigns that already used it keep their starting supply.");
  return { ok: true };
}

// Sets the current campaign's starting supply: from a preset, carried over from
// the previous campaign's end counts, or zero. Any earlier starting supply for
// this campaign is retracted (kept on record), so it can be redone.
function setStartingSupply(app, body, auth) {
  needLog(auth);
  const camp = campaignOf(app, "");
  const mode = String(body.mode || "");
  let rows = [];
  let label = "";
  if (mode === "preset") {
    let p = null;
    try { p = app.findRecordById("asset_presets", String(body.presetId || "")); } catch (_) {}
    if (!p) throw new BadRequestError("Pick a preset.");
    rows = (json(p, "rows") || []).slice();
    label = `${p.getString("name")} preset`;
  } else if (mode === "carry") {
    let prev = null;
    app.findRecordsByFilter("campaigns", "starts_on < {:s}", "-starts_on", 1, 0, { s: camp.getString("starts_on") }).forEach((c) => { prev = c; });
    if (!prev) throw new BadRequestError("There is no earlier campaign to carry over from.");
    const held = heldMap(app, prev.id);
    Object.keys(held).forEach((k) => { if (held[k] > 0) { const bits = k.split("|"); rows.push({ unit: bits[0], type: bits[1], qty: held[k] }); } });
    label = `Carried over from ${prev.getString("name")}`;
  } else if (mode === "zero") {
    label = "Started from zero";
  } else throw new BadRequestError("Pick how the campaign starts.");

  // drop rows for units or types that no longer qualify
  const um = unitMap(app);
  const ok = {};
  app.findRecordsByFilter("asset_types", "status = 'approved' && retired = false", "", 0, 0).forEach((t) => { ok[t.id] = json(t, "units") || []; });
  rows = rows.filter((r) => um[r.unit] && ok[r.type] && ok[r.type].indexOf(r.unit) !== -1 && r.qty > 0);

  const name = who(auth);
  const col = app.findCollectionByNameOrId("asset_entries");
  const batch = $security.randomString(12);
  let replaced = 0;
  app.runInTransaction((tx) => {
    tx.findRecordsByFilter("asset_entries", "campaign = {:c} && is_start = true && retracted = false", "", 0, 0, { c: camp.id }).forEach((old) => {
      old.set("retracted", true);
      old.set("retract_reason", "Starting supply was set again.");
      old.set("retracted_name", name);
      old.set("retracted_at", now());
      tx.save(old);
      replaced++;
    });
    rows.forEach((row) => {
      const r = new Record(col);
      r.load({
        campaign: camp.id, unit: row.unit, type: row.type, delta: row.qty, entry_date: camp.getString("starts_on"),
        reason: `Starting supply: ${label}`, is_start: true, batch, logged_by: auth.id, logged_name: name, retracted: false,
      });
      tx.save(r);
    });
    const c = tx.findRecordById("campaigns", camp.id);
    c.set("asset_start", label.slice(0, 120));
    tx.save(c);
    audit(tx, auth, "asset_supply_set", camp.getString("name"),
      `${label}: ${rows.length} line${rows.length === 1 ? "" : "s"}, ${rows.reduce((s, x) => s + x.qty, 0)} items in all.` + (replaced ? ` Replaced the earlier starting supply (${replaced} lines, kept on record).` : ""));
  });
  return { lines: rows.length, label };
}

// ── image backups: pocketbase/asset_images/<name>.<ext> ──────────────────
function imgDir(app) { return app.dataDir() + "/../asset_images"; }
function slug(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "asset"; }
function exists(p) { try { $os.stat(p); return true; } catch (_) { return false; } }
function ext(file) { const x = String(file).split(".").pop().toLowerCase(); return EXTS.indexOf(x) === -1 ? "png" : x; }
function removeCopies(app, base) { EXTS.forEach((x) => { const p = `${imgDir(app)}/${base}.${x}`; if (exists(p)) { try { $os.remove(p); } catch (_) {} } }); }

function syncImage(app, r, before) {
  try {
    const base = slug(r.getString("name"));
    if (before) {
      const oldBase = slug(before.getString("name"));
      if (oldBase !== base || (before.getString("image") && !r.getString("image"))) removeCopies(app, oldBase);
    }
    const file = r.getString("image");
    if (!file) { removeCopies(app, base); return; }
    if (before && before.getString("image") === file && exists(`${imgDir(app)}/${base}.${ext(file)}`)) return;
    const src = `${app.dataDir()}/storage/${r.collection().id}/${r.id}/${file}`;
    $os.mkdirAll(imgDir(app), 0o755);
    removeCopies(app, base);
    $os.writeFile(`${imgDir(app)}/${base}.${ext(file)}`, $os.readFile(src), 0o644);
  } catch (err) {
    console.log("[orbat] couldn't save a copy of the asset image:", err);
  }
}

function restoreImages(app) {
  let n = 0;
  try { app.findCollectionByNameOrId("asset_types"); } catch (_) { return; } // first start: the migration hasn't run yet
  try {
    app.findRecordsByFilter("asset_types", "image = '' && status = 'approved'", "", 0, 0).forEach((r) => {
      const base = slug(r.getString("name"));
      const x = EXTS.find((e) => exists(`${imgDir(app)}/${base}.${e}`));
      if (!x) return;
      r.set("image", $filesystem.fileFromPath(`${imgDir(app)}/${base}.${x}`));
      app.save(r);
      n++;
    });
  } catch (err) {
    console.log("[orbat] couldn't restore asset images:", err);
  }
  if (n) console.log(`[orbat] restored ${n} asset image(s) from asset_images`);
}

module.exports = {
  summary, log, retract, submitType, reviewType, updateType, setImage, savePreset, deletePreset, setStartingSupply,
  syncImage, restoreImages, canLog, canApprove,
};
