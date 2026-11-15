// Squad logo backups. Every uploaded logo is also copied, at full size, to
// pocketbase/squad_logos/<unit>--<squad>.<ext>, an ordinary folder that goes along
// when the site files are copied. On start-up, any squad without a logo gets its
// copy from that folder back, so logos survive a move to a new PC or a fresh database.

const EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

function dir(app) { return app.dataDir() + "/../squad_logos"; }

function slug(v) {
  return String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "squad";
}

// "acklay--alpha-squad" for a section
function baseName(app, section) {
  let unitKey = "unit";
  try { unitKey = app.findRecordById("orbat_units", section.getString("unit")).getString("key") || "unit"; } catch (_) {}
  return slug(unitKey) + "--" + slug(section.getString("name"));
}

function exists(path) { try { $os.stat(path); return true; } catch (_) { return false; } }

function removeCopies(app, base) {
  EXTS.forEach((x) => { const p = `${dir(app)}/${base}.${x}`; if (exists(p)) { try { $os.remove(p); } catch (_) {} } });
}

// called after a section is saved: keep the copy in step with the logo and the squad name
function sync(app, section, before) {
  try {
    const base = baseName(app, section);
    if (before) {
      const oldBase = baseName(app, before);
      if (oldBase !== base || (before.getString("logo") && !section.getString("logo"))) removeCopies(app, oldBase);
    }
    const file = section.getString("logo");
    if (!file) { removeCopies(app, base); return; }
    if (before && before.getString("logo") === file && exists(`${dir(app)}/${base}.${ext(file)}`)) return;
    const src = `${app.dataDir()}/storage/${section.collection().id}/${section.id}/${file}`;
    $os.mkdirAll(dir(app), 0o755);
    removeCopies(app, base);
    $os.writeFile(`${dir(app)}/${base}.${ext(file)}`, $os.readFile(src), 0o644);
  } catch (err) {
    console.log("[orbat] couldn't save a copy of the squad logo:", err);
  }
}

function ext(file) {
  const x = String(file).split(".").pop().toLowerCase();
  return EXTS.indexOf(x) === -1 ? "png" : x;
}

// on start-up: give squads without a logo their saved copy back
function restore(app) {
  let restored = 0;
  try {
    app.findRecordsByFilter("orbat_sections", "logo = ''", "", 0, 0).forEach((s) => {
      const base = baseName(app, s);
      const x = EXTS.find((e) => exists(`${dir(app)}/${base}.${e}`));
      if (!x) return;
      s.set("logo", $filesystem.fileFromPath(`${dir(app)}/${base}.${x}`));
      app.save(s);
      restored++;
    });
  } catch (err) {
    console.log("[orbat] couldn't restore squad logos:", err);
  }
  if (restored) console.log(`[orbat] restored ${restored} squad logo(s) from squad_logos`);
}

module.exports = { sync, restore, dir };
