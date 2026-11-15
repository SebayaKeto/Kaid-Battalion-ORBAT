// Codex edit mode. Reading is public; every change needs the Edit Codex permission
// (can_edit_codex). A built-in page with no codex_pages row shows the content that
// ships with the site (web/src/codex/codex-data.json). Saving a page writes a row;
// the version it replaces goes to codex_history so it can be put back.

const BUILTIN = ["points", "activity", "discharge", "ranks", "leadership", "quals", "billets", "kits", "uniform", "equivalence"];
const HISTORY_KEEP = 40;

function canEdit(auth) { return !!auth && auth.getBool("can_edit_codex"); }
function needEdit(auth) { if (!canEdit(auth)) throw new ForbiddenError("Edit Codex access needed."); }
function who(auth) { return require(`${__hooks}/lib/points.js`).actorLabel(auth); }
function audit(app, auth, action, title, detail) {
  require(`${__hooks}/lib/audit.js`).write(app, { eventTitle: "Codex: " + title, action, actor: auth, actorName: who(auth), detail });
}

function json(r, field) {
  try { const v = JSON.parse(r.getString(field) || "null"); return v == null ? null : v; } catch (_) { return null; }
}
function str(v, max) { return String(v == null ? "" : v).replace(/\s+$/, "").slice(0, max); }

function findPage(app, key) {
  try { return app.findFirstRecordByData("codex_pages", "key", key); } catch (_) { return null; }
}

function pageOut(r) {
  return {
    key: r.getString("key"), kind: r.getString("kind") || "custom", code: r.getString("code"), label: r.getString("label"),
    blurb: r.getString("blurb"), heading: r.getString("heading"), intro: r.getString("intro"), sort: r.getInt("sort"),
    hidden: r.getBool("hidden"), data: r.getBool("has_data") ? json(r, "data") : null, blocks: json(r, "blocks") || [],
    updatedBy: r.getString("updated_name"), updatedAt: r.getString("updated"),
  };
}

// everything the Codex needs; hidden pages only for editors
function list(app, auth) {
  const edit = canEdit(auth);
  const pages = app.findRecordsByFilter("codex_pages", "id != ''", "sort,created", 0, 0).map(pageOut).filter((p) => edit || !p.hidden);
  return { canEdit: edit, pages };
}

function snapshot(app, r, auth, note) {
  try {
    const h = new Record(app.findCollectionByNameOrId("codex_history"));
    h.set("key", r.getString("key"));
    h.set("label", r.getString("label"));
    h.set("snapshot", pageOut(r));
    h.set("saved_name", who(auth));
    h.set("note", str(note, 200));
    app.save(h);
    // keep the newest HISTORY_KEEP versions of each page
    app.findRecordsByFilter("codex_history", "key = {:k}", "-created", 0, 0, { k: r.getString("key") })
      .slice(HISTORY_KEEP).forEach((x) => app.delete(x));
  } catch (err) {
    console.log("[codex] history snapshot failed:", err);
  }
}

function cleanMeta(body, r, isNew) {
  const label = str(body.label, 60).trim();
  if (body.label !== undefined || isNew) {
    if (!label) throw new BadRequestError("Give the page a name.");
    r.set("label", label);
  }
  if (body.code !== undefined || isNew) {
    const code = str(body.code, 4).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 2) throw new BadRequestError("The short code needs 2 to 4 letters or numbers, like PTS.");
    r.set("code", code);
  }
  ["blurb:300", "heading:80", "intro:600"].forEach((f) => {
    const [name, max] = f.split(":");
    if (body[name] !== undefined) r.set(name, str(body[name], Number(max)));
  });
  if (body.hidden !== undefined) r.set("hidden", !!body.hidden);
  if (body.sort !== undefined && isFinite(Number(body.sort))) r.set("sort", Math.round(Number(body.sort)));
}

function checkSize(v, what) {
  const s = JSON.stringify(v);
  if (s && s.length > 3500000) throw new BadRequestError(`The ${what} is too big to save. Use fewer or smaller pictures pasted straight into the text.`);
}

// create or update one page. body: { label, code, blurb, heading, intro, hidden, data, blocks, resetData }
function save(app, key, body, auth) {
  needEdit(auth);
  key = String(key || "");
  let r = findPage(app, key);
  const builtin = BUILTIN.indexOf(key) !== -1;
  if (!r && !builtin) throw new NotFoundError("That page doesn't exist any more. Reload the Codex.");
  const isNew = !r;
  if (r) snapshot(app, r, auth, body.note);
  else {
    r = new Record(app.findCollectionByNameOrId("codex_pages"));
    r.set("key", key);
    r.set("kind", "builtin");
    r.set("sort", Number(body.sort) || 0);
  }
  cleanMeta(body, r, false);
  if (isNew && body.defaults) {
    // a built-in page saved for the first time keeps its original name and code
    ["label", "code", "blurb", "heading", "intro"].forEach((f) => { if (body[f] === undefined && body.defaults[f] !== undefined) r.set(f, str(body.defaults[f], 600)); });
  }
  if (body.resetData) { r.set("has_data", false); r.set("data", null); }
  else if (body.data !== undefined && builtin) {
    if (!body.data || typeof body.data !== "object") throw new BadRequestError("The page content is missing.");
    checkSize(body.data, "page");
    r.set("data", body.data);
    r.set("has_data", true);
  }
  if (body.blocks !== undefined) {
    if (!Array.isArray(body.blocks)) throw new BadRequestError("The page sections are missing.");
    checkSize(body.blocks, "page");
    r.set("blocks", body.blocks);
  }
  r.set("updated_name", who(auth));
  app.save(r);
  audit(app, auth, "codex_page_saved", r.getString("label") || key, isNew ? "Page edited for the first time." : "Page saved.");
  return pageOut(r);
}

function slug(label) {
  return String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "page";
}

// a new page made of sections. body: { label, code, blurb, heading, intro, blocks, sort }
function create(app, body, auth) {
  needEdit(auth);
  const r = new Record(app.findCollectionByNameOrId("codex_pages"));
  let key = slug(body.label);
  if (BUILTIN.indexOf(key) !== -1 || key === "search") key = key + "-2";
  let n = 2;
  const base = key;
  while (findPage(app, key)) { n += 1; key = `${base}-${n}`; }
  r.set("key", key);
  r.set("kind", "custom");
  cleanMeta(body, r, true);
  if (!body.heading) r.set("heading", r.getString("label").toUpperCase());
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  checkSize(blocks, "page");
  r.set("blocks", blocks);
  r.set("sort", isFinite(Number(body.sort)) ? Math.round(Number(body.sort)) : 999);
  r.set("updated_name", who(auth));
  app.save(r);
  audit(app, auth, "codex_page_created", r.getString("label"), "New Codex page.");
  return pageOut(r);
}

// body: { order: [{ key, label, code, blurb }] } in the order they should appear.
// Built-in pages without a row get one, keeping their original content.
function reorder(app, body, auth) {
  needEdit(auth);
  const order = Array.isArray(body.order) ? body.order : [];
  order.forEach((p, i) => {
    const key = String(p.key || "");
    let r = findPage(app, key);
    if (!r) {
      if (BUILTIN.indexOf(key) === -1) return;
      r = new Record(app.findCollectionByNameOrId("codex_pages"));
      r.set("key", key);
      r.set("kind", "builtin");
      ["label", "code", "blurb", "heading", "intro"].forEach((f) => { if (p[f] !== undefined) r.set(f, str(p[f], 600)); });
    }
    r.set("sort", (i + 1) * 10);
    app.save(r);
  });
  audit(app, auth, "codex_pages_reordered", "page order", "Codex pages put in a new order.");
  return list(app, auth);
}

// custom pages are deleted; built-in pages go back to the original that ships with the site
function remove(app, key, auth) {
  needEdit(auth);
  const r = findPage(app, String(key || ""));
  if (!r) return { ok: true };
  snapshot(app, r, auth, BUILTIN.indexOf(r.getString("key")) !== -1 ? "Before reset to original" : "Before delete");
  const label = r.getString("label") || r.getString("key");
  const builtin = BUILTIN.indexOf(r.getString("key")) !== -1;
  app.delete(r);
  audit(app, auth, builtin ? "codex_page_reset" : "codex_page_deleted", label, builtin ? "Page put back to the original." : "Page deleted. It can be brought back from its history.");
  return { ok: true };
}

function historyList(app, key, auth) {
  needEdit(auth);
  return app.findRecordsByFilter("codex_history", "key = {:k}", "-created", 0, HISTORY_KEEP, { k: String(key || "") }).map((h) => ({
    id: h.id, label: h.getString("label"), savedBy: h.getString("saved_name"), at: h.getString("created"), note: h.getString("note"),
  }));
}

// deleted pages that can still be brought back
function deletedList(app, auth) {
  needEdit(auth);
  const seen = {};
  const out = [];
  app.findRecordsByFilter("codex_history", "id != ''", "-created", 0, 500).forEach((h) => {
    const k = h.getString("key");
    if (seen[k]) return;
    seen[k] = true;
    if (BUILTIN.indexOf(k) !== -1 || findPage(app, k)) return;
    out.push({ id: h.id, key: k, label: h.getString("label"), at: h.getString("created"), savedBy: h.getString("saved_name") });
  });
  return out;
}

function restore(app, id, auth) {
  needEdit(auth);
  let h = null;
  try { h = app.findRecordById("codex_history", String(id || "")); } catch (_) {}
  if (!h) throw new NotFoundError("That version isn't there any more.");
  const s = json(h, "snapshot") || {};
  const key = h.getString("key");
  let r = findPage(app, key);
  if (r) snapshot(app, r, auth, "Before restoring an older version");
  else {
    r = new Record(app.findCollectionByNameOrId("codex_pages"));
    r.set("key", key);
  }
  r.set("kind", s.kind || (BUILTIN.indexOf(key) !== -1 ? "builtin" : "custom"));
  ["code", "label", "blurb", "heading", "intro"].forEach((f) => r.set(f, str(s[f], 600)));
  r.set("sort", Number(s.sort) || 0);
  r.set("hidden", !!s.hidden);
  r.set("has_data", s.data != null);
  r.set("data", s.data != null ? s.data : null);
  r.set("blocks", Array.isArray(s.blocks) ? s.blocks : []);
  r.set("updated_name", who(auth));
  app.save(r);
  audit(app, auth, "codex_page_restored", r.getString("label") || key, "Older version put back.");
  return pageOut(r);
}

function upload(app, e, auth) {
  needEdit(auth);
  let files = [];
  try { files = e.findUploadedFiles("file") || []; } catch (_) { files = []; }
  if (!files.length) throw new BadRequestError("Pick a picture to upload.");
  const r = new Record(app.findCollectionByNameOrId("codex_files"));
  r.set("file", files[0]);
  r.set("uploaded_name", who(auth));
  app.save(r);
  return { url: `/api/files/codex_files/${r.id}/${r.getString("file")}` };
}

module.exports = { list, save, create, reorder, remove, historyList, deletedList, restore, upload, canEdit };
