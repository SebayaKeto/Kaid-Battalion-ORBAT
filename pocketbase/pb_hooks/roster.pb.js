/// <reference path="../pb_data/types.d.ts" />

// Orbat registration: recruitment staff add troopers and edit their details.

routerAdd("POST", "/api/orbat/members/register", (e) => {
  const r = require(`${__hooks}/lib/roster.js`);
  const body = e.requestInfo().body || {};
  const out = r.register(e.app, body, e.auth);
  // a slot picked on the form: place them straight away
  if (body.slotId) {
    try {
      const placed = r.assignSlot(e.app, String(body.slotId), out.id, e.auth);
      out.slot = placed.slot || "";
    } catch (err) {
      out.slotError = (err && err.message) || "Couldn't place them in that slot.";
    }
  }
  return e.json(200, out);
}, $apis.requireAuth("users"));

// Live check for the register and edit form: is this number or callsign
// already used by another registered trooper? self = the trooper being edited,
// whose own unchanged number and callsign are not counted.
routerAdd("GET", "/api/orbat/members/check", (e) => {
  const r = require(`${__hooks}/lib/roster.js`);
  if (!r.canRecruit(e.auth)) throw new ForbiddenError("Recruitment access needed.");
  const q = e.request.url.query();
  let number = String(q.get("number") || "").trim();
  let callsign = String(q.get("callsign") || "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  const self = String(q.get("self") || "");
  if (!/^\d{4}$/.test(number)) number = "";
  if (callsign.length < 2) callsign = "";
  if (self) {
    try {
      const m = e.app.findRecordById("members", self);
      if (m.getBool("registered")) {
        if (m.getString("service_number") === number) number = "";
        if (m.getString("callsign").toLowerCase() === callsign.toLowerCase()) callsign = "";
      }
    } catch (_) {}
  }
  return e.json(200, r.clashes(e.app, number, callsign, self));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/members/{id}/transfer", (e) => {
  const r = require(`${__hooks}/lib/roster.js`);
  return e.json(200, r.transfer(e.app, e.request.pathValue("id"), e.requestInfo().body || {}, e.auth));
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/orbat/members/{id}/update", (e) => {
  const r = require(`${__hooks}/lib/roster.js`);
  const body = e.requestInfo().body || {};
  const id = e.request.pathValue("id");
  if (!r.canRecruit(e.auth)) throw new ForbiddenError("Recruitment access needed.");
  // slotId from the billet dropdown: a slot id, "" for no slot, "other" for a typed billet
  const want = body.slotId === undefined ? null : String(body.slotId);
  let cur = null;
  try { cur = e.app.findFirstRecordByFilter("orbat_slots", "member = {:m}", { m: id }); } catch (_) {}
  // leaving their slot: empty it first so the typed billet (if any) sticks
  if (want !== null && cur && (want === "" || want === "other")) r.assignSlot(e.app, cur.id, "", e.auth);
  const out = r.update(e.app, id, body, e.auth);
  if (want && want !== "other" && (!cur || want !== cur.id)) {
    const status = String(body.status || "");
    if (["active_reserve", "inactive_reserve", "discharged"].indexOf(status) !== -1) {
      out.slotError = "Reserves and discharged troopers don't hold a slot.";
    } else {
      try { out.slot = r.assignSlot(e.app, want, id, e.auth).slot || ""; }
      catch (err) { out.slotError = (err && err.message) || "Couldn't place them in that slot."; }
    }
  }
  return e.json(200, out);
}, $apis.requireAuth("users"));

// Registered troopers are only changed through the form above, so every
// change is checked and goes in the log. Unregistered records (made from
// training logs) can still be tidied up directly.
onRecordUpdateRequest((e) => {
  const before = e.record.original();
  if (before.getBool("registered") && !e.hasSuperuserAuth()) throw new BadRequestError("Edit registered troopers from the Orbat page.");
  ["registered", "registered_by", "registered_at"].forEach((f) => e.record.set(f, before.get(f)));
  e.next();
}, "members");

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) ["registered", "registered_by", "registered_at"].forEach((f) => e.record.set(f, f === "registered" ? false : ""));
  e.next();
}, "members");

routerAdd("POST", "/api/orbat/slots/{id}/assign", (e) => {
  const r = require(`${__hooks}/lib/roster.js`);
  const body = e.requestInfo().body || {};
  return e.json(200, r.assignSlot(e.app, e.request.pathValue("id"), String(body.memberId || ""), e.auth));
}, $apis.requireAuth("users"));

// Unit Leaders: set the order of a section's slots in one go
routerAdd("POST", "/api/orbat/sections/{id}/reorder", (e) => {
  if (!e.auth.getBool("is_full")) throw new ForbiddenError("Unit Leader access needed.");
  const id = e.request.pathValue("id");
  const ids = (e.requestInfo().body || {}).slotIds;
  if (!Array.isArray(ids)) throw new BadRequestError("slotIds must be a list.");
  e.app.runInTransaction((tx) => {
    const slots = tx.findRecordsByFilter("orbat_slots", "section = {:s}", "", 0, 0, { s: id });
    if (ids.length !== slots.length || slots.some((sl) => ids.indexOf(sl.id) === -1)) {
      throw new BadRequestError("The layout changed. Reload the page and try again.");
    }
    slots.forEach((sl) => { sl.set("sort", ids.indexOf(sl.id)); tx.save(sl); });
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

// Layout edits (Unit Leaders): who sits in a slot only changes through the
// assign route, and filled slots or sections can't be deleted.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("member", "");
  e.next();
}, "orbat_slots");
onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("member", e.record.original().getString("member"));
  const { slotBillet } = require(`${__hooks}/lib/roster.js`);
  const before = slotBillet(e.record.original());
  e.next();
  // renaming a filled slot's billet (or its fireteam colour) renames the trooper's billet too
  const after = slotBillet(e.record);
  const memberId = e.record.getString("member");
  if (memberId && after !== before) {
    try {
      const m = e.app.findRecordById("members", memberId);
      m.set("billet", after);
      e.app.save(m);
      const pts = require(`${__hooks}/lib/points.js`);
      require(`${__hooks}/lib/audit.js`).write(e.app, {
        eventTitle: m.getString("display_name"), member: m.id, action: "member_updated", actor: e.auth, actorName: pts.actorLabel(e.auth),
        detail: `Billet: ${before} → ${after} (slot renamed on the ORBAT layout).`,
      });
    } catch (err) { console.log("[orbat] billet sync failed:", err); }
  }
}, "orbat_slots");
onRecordDeleteRequest((e) => {
  if (e.record.getString("member")) throw new BadRequestError("Remove the trooper from this slot first.");
  e.next();
}, "orbat_slots");
// squad logos: keep a plain copy in pocketbase/squad_logos (see lib/logos.js)
onRecordUpdate((e) => {
  const before = e.record.original();
  e.next();
  require(`${__hooks}/lib/logos.js`).sync(e.app, e.record, before);
}, "orbat_sections");
onBootstrap((e) => {
  e.next();
  require(`${__hooks}/lib/logos.js`).restore(e.app);
});
onRecordDeleteRequest((e) => {
  const filled = e.app.findRecordsByFilter("orbat_slots", "section = {:s} && member != ''", "", 1, 0, { s: e.record.id });
  if (filled.length) throw new BadRequestError("Move everyone out of this section before deleting it.");
  e.next();
}, "orbat_sections");

// The public ORBAT: layout plus registered troopers, with no Discord or Steam
// IDs, for viewing without signing in.
routerAdd("GET", "/api/orbat/public/orbat", (e) => {
  const pick = (r, fields) => { const o = { id: r.id }; fields.forEach((f) => { o[f] = r.get(f); }); return o; };
  const units = e.app.findRecordsByFilter("orbat_units", "id != ''", "sort", 0, 0).map((r) => pick(r, ["key", "name", "platoon", "kind", "company", "group_label", "subtitle", "color", "sort"]));
  const sections = e.app.findRecordsByFilter("orbat_sections", "id != ''", "sort,id", 0, 0).map((r) => pick(r, ["unit", "name", "kind", "code", "sort", "logo"]));
  const slots = e.app.findRecordsByFilter("orbat_slots", "id != ''", "sort,id", 0, 0).map((r) => pick(r, ["section", "billet", "team", "sort", "member"]));
  const members = e.app.findRecordsByFilter("members", "registered = true", "display_name", 0, 0)
    .map((r) => pick(r, ["display_name", "rank", "service_number", "callsign", "platoon", "status", "billet", "joined_at", "registered"]));
  return e.json(200, { units, sections, slots, members });
});
