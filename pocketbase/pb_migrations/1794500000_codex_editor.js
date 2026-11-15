/// <reference path="../pb_data/types.d.ts" />

// Codex edit mode.
// - New permission can_edit_codex: edit, add, reorder and hide Codex pages on the site.
//   Only the Unit Leader role has it by default; it can be given to other roles in Discord access.
// - codex_pages: one row per Codex page that has been edited or added. A built-in page with
//   no row shows the original content that ships with the site.
// - codex_history: the previous version of a page each time it is saved, so a save can be undone.
// - codex_files: pictures uploaded in the Codex editor.
// Everything is written only through the /api/orbat/codex routes (pb_hooks/codex.pb.js).
migrate((app) => {
  for (const name of ["users", "role_map"]) {
    const c = app.findCollectionByNameOrId(name);
    if (!c.fields.getByName("can_edit_codex")) c.fields.add(new BoolField({ name: "can_edit_codex" }));
    app.save(c);
  }
  app.db().newQuery("UPDATE role_map SET can_edit_codex = TRUE WHERE discord_role_id = '1563589204099997787'").execute();
  // signed-in Unit Leaders get it straight away instead of on their next login
  app.db().newQuery("UPDATE users SET can_edit_codex = TRUE WHERE access_label = 'Unit Leader'").execute();

  const pages = new Collection({
    type: "base", name: "codex_pages",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "key", required: true, max: 40, presentable: true },
      { type: "text", name: "kind", max: 20 },
      { type: "text", name: "code", max: 4 },
      { type: "text", name: "label", max: 60 },
      { type: "text", name: "blurb", max: 300 },
      { type: "text", name: "heading", max: 80 },
      { type: "text", name: "intro", max: 600 },
      { type: "number", name: "sort", onlyInt: true },
      { type: "bool", name: "hidden" },
      { type: "bool", name: "has_data" },
      { type: "json", name: "data", maxSize: 4000000 },
      { type: "json", name: "blocks", maxSize: 4000000 },
      { type: "text", name: "updated_name", max: 100 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_codex_pages_key ON codex_pages (`key`)"],
  });
  app.save(pages);

  const history = new Collection({
    type: "base", name: "codex_history",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "key", required: true, max: 40 },
      { type: "text", name: "label", max: 60 },
      { type: "json", name: "snapshot", maxSize: 8000000 },
      { type: "text", name: "saved_name", max: 100 },
      { type: "text", name: "note", max: 200 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_codex_history_key ON codex_history (`key`)"],
  });
  app.save(history);

  const files = new Collection({
    type: "base", name: "codex_files",
    listRule: null, viewRule: "", createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "file", name: "file", required: true, maxSelect: 1, maxSize: 10 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
      { type: "text", name: "uploaded_name", max: 100 },
      { type: "autodate", name: "created", onCreate: true },
    ],
  });
  app.save(files);
}, (app) => {
  for (const name of ["codex_files", "codex_history", "codex_pages"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
  for (const name of ["users", "role_map"]) {
    try { const c = app.findCollectionByNameOrId(name); c.fields.removeByName("can_edit_codex"); app.save(c); } catch (_) {}
  }
});
