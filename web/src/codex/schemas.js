// What can be edited on each built-in Codex page, in plain words.
// Field kinds are described in form.jsx.

const text = (k, label, extra) => ({ t: "text", k, label, ...extra });
const lines = (k, label, extra) => ({ t: "lines", k, label, ...extra });
const rich = (k, label, extra) => ({ t: "rich", k, label, ...extra });
const img = (k, label, extra) => ({ t: "image", k, label, ...extra });
const list = (k, label, itemName, item, extra) => ({ t: "list", k, label, itemName, item, ...extra });
const group = (fields, make) => ({ t: "group", fields, make });
const set = (label, fields, hint) => ({ label, fields, hint });

const qualList = (label) => group([
  text("heading", "Heading"),
  rich("about", "About", { minimal: true }),
  list("items", label, "entry", group([text("abbr", "Short code", { max: 12 }), lines("text", "Name (first line), then any notes")], () => ({ abbr: "", text: "" })), { title: (q) => `${q.abbr ? `${q.abbr} · ` : ""}${(q.text || "").split("\n")[0]}` }),
]);

const rankList = (label) => list(null, label, "rank", group([
  text("name", "Rank name"), text("abbr", "Short form", { max: 12 }), img("insignia", "Insignia"),
  rich("requirements", "Requirements (optional)", { minimal: true }), rich("description", "Description"),
  lines("notes", "Tags", { hint: "One per line, shown as small tags" }),
], () => ({ name: "New rank", abbr: "", insignia: "", requirements: "", description: "", notes: "" })), { title: (r) => `${r.abbr ? `${r.abbr} · ` : ""}${r.name}` });

const cell = (k, label) => ({ t: "cell", k, label });

export const SCHEMAS = {
  points: [
    set("Points rules", [{ t: "group", k: "rules", fields: [text("heading", "Heading"), rich("text", "Text")] }]),
    set("Gaining points", [{ t: "group", k: "gain", fields: [text("heading", "Heading"), rich("text", "Text"), text("maxValue", "Big number"), text("maxHeading", "Big number label"), rich("maxNote", "Big number small print", { minimal: true })] }]),
    set("What counts", [{ t: "group", k: "qualifies", fields: [text("heading", "Heading"), list("items", "Things that earn points", "thing", group([rich("text", "What counts", { minimal: true }), rich("note", "Extra note (optional)", { minimal: true })], () => ({ text: "", note: "" })), { title: (x) => x.text })] }]),
    set("What doesn't count", [{ t: "group", k: "notQualify", fields: [text("heading", "Heading"), list("items", "Things that don't earn points", "thing", { t: "rich", minimal: true })] }]),
    set("Callout under the lists", [{ t: "group", k: "note", fields: [text("heading", "Label"), rich("text", "Text", { minimal: true })] }]),
    set("Milestones table", [{ t: "group", k: "milestones", fields: [
      text("heading", "Heading"),
      list("cols", "Column headings", "column", { t: "lines" }),
      list("rows", "Rows", "row", group([cell("pts", "Points"), cell("inf", "Infantry"), cell("av", "Air Wing")], () => ({ pts: { text: "", rows: 1 }, inf: { text: "", rows: 1 }, av: { text: "", rows: 1 } })), { title: (r, i) => `Row ${i + 1}${r.pts ? ` · ${r.pts.text}` : ""}`, hint: "A cell can be joined to the one above to span several rows." }),
    ] }], "The calculator lights up every row whose points the reader has reached."),
    set("Key", [{ t: "group", k: "key", fields: [text("heading", "Heading"), list("items", "Abbreviations", "entry", { t: "pair", labels: ["Short", "Meaning"] })] }]),
  ],
  activity: [
    set("Duty statuses", [list("statuses", "Statuses", "status", group([
      text("name", "Status name"), list("requirements", "Requirements", "requirement", { t: "rich", minimal: true }), rich("timeout", "Time allowed without attendance", { minimal: true }),
    ], () => ({ name: "New status", requirements: [""], timeout: "" })), { title: (s) => s.name })]),
  ],
  discharge: [
    set("Discharge types", [list("types", "Types", "type", group([
      text("name", "Type name"), list("points", "Points", "point", { t: "rich", minimal: true }, { hint: "The first point also shows on the type's button." }),
    ], () => ({ name: "New type", points: [""] })), { title: (t) => t.name, hint: "Colours go green, blue, gold, red in order." })]),
    set("Steps", [text("stepsTitle", "Steps heading"), list("steps", "Steps", "step", group([text("label", "Step name"), rich("text", "What to do")], () => ({ label: "New step", text: "" })), { title: (s) => s.label })]),
  ],
  ranks: [
    set("Infantry", [{ ...rankList("Infantry ranks, lowest first"), k: "infantry" }]),
    set("Fynock Air Wing", [{ ...rankList("Fynock ranks, lowest first"), k: "fynock" }]),
    set("Navy · Zeus", [{ ...rankList("Navy ranks, lowest first"), k: "navy" }]),
  ],
  leadership: [
    set("Leadership groups", [list("groups", "Groups", "group", group([
      text("heading", "Group heading", { hint: "Left empty, the first group is called Battalion Command" }),
      list("leaders", "Leaders", "leader", group([
        text("billet", "Billet"), text("holder", "Held by", { hint: "Leave empty or write N/A for vacant" }),
        text("callsignLabel", "Callsign label", { placeholder: "Callsign" }), text("callsign", "Callsign"), img("photo", "Photo (first two groups only)"),
      ], () => ({ billet: "New billet", holder: "", callsignLabel: "Callsign", callsign: "", photo: "" })), { title: (l) => `${l.billet}${l.holder ? ` · ${l.holder}` : ""}` }),
    ], () => ({ heading: "New group", leaders: [] })), { title: (g, i) => g.heading || (i === 0 ? "Battalion Command" : `Group ${i + 1}`), hint: "The first two groups show photos. The fourth is split into Navy, Fynock and platoon detachments by billet name." })]),
  ],
  quals: [
    set("Qualifications", [{ ...qualList("Qualifications"), k: "qualifications" }]),
    set("Certifications", [{ ...qualList("Certifications"), k: "certifications" }]),
  ],
  billets: [
    set("Billet sections", [list("groups", "Sections", "section", group([
      text("heading", "Section name"),
      list("billets", "Billets", "billet", group([
        text("name", "Billet name"),
        img("image", "Loadout picture", { hint: "Shown when there is no 360° view, or under PHOTO" }),
        list("fields", "Details", "detail", { t: "pair", labels: ["Label", "Text"], types: ["text", "lines"] }, { hint: "Labels with “cap” or “restriction” are shown in gold." }),
      ], () => ({ id: "", name: "New billet", image: "", fields: [["Permissions", "None"], ["Authorized Weapons", ""]] })), { title: (b) => (b.name || "").replace("\n", " ") }),
    ], () => ({ heading: "New section", billets: [] })), { title: (g) => g.heading })]),
    set("Quality assurance", [{ t: "group", k: "qa", fields: [text("heading", "Heading"), rich("intro", "Intro"), list("items", "Paragraphs", "paragraph", { t: "rich", minimal: true }, { hint: "Paragraphs starting “Retrain” go in the gold box, “Removal” or “Approval” in the red box." })] }]),
  ],
  kits: [
    set("Resupply rules", [{ t: "group", k: "resupply", fields: [text("heading", "Heading"), list("items", "Paragraphs", "paragraph", { t: "rich", minimal: true }, { hint: "A paragraph starting “Example” is shown as an example. The last one is the motto." })] }]),
    set("Kits", [list("kits", "Kits", "kit", group([
      text("name", "Kit name"), text("startHeading", "Starting kit heading", { placeholder: "Starting Kit" }),
      list("starting", "Starting kit", "item", { t: "text", placeholder: "e.g. Bacta Bandage x20" }, { hint: "End with x and a number to show a count badge." }),
      text("extraName", "Extra kit name (optional)"), text("extraHeading", "Extra kit note (optional)"),
      list("extra", "Extra kit", "item", { t: "text" }),
    ], () => ({ id: "", name: "New kit", startHeading: "Starting Kit", starting: [], extraName: "", extraHeading: "", extra: [] })), { title: (k) => k.name })]),
  ],
  uniform: [
    set("Top notices", [list("general", "Notices", "notice", { t: "rich", minimal: true })]),
    set("Accessories", [list("accessories", "Accessories", "accessory", group([text("name", "Name"), list("rules", "Rules", "rule", { t: "rich", minimal: true })], () => ({ name: "New accessory", rules: [""] })), { title: (a) => a.name })]),
    set("Exceptions", [{ t: "group", k: "exceptions", fields: [text("heading", "Heading"), rich("text", "Text", { minimal: true })] }]),
    set("Custom rules", [list("custom", "Rule tabs", "tab", group([text("name", "Tab name"), list("rules", "Rules", "rule", { t: "rich", minimal: true })], () => ({ name: "New tab", rules: [""] })), { title: (c) => c.name })]),
  ],
  equivalence: [
    set("Table", [
      { t: "pair", k: "cols", label: "Column headings", labels: ["Left", "Right"] },
      list("rows", "Rows", "row", { t: "pair", labels: ["Left", "Right"], types: ["lines", "lines"] }, { hint: "End a rank with its short form in brackets, like (CT), to link it to Unit Ranks." }),
    ]),
  ],
};

// Older content from the sheet keeps the notes for "What counts" in a separate
// lookup. The editor keeps each note with its line instead.
export function normalise(key, data) {
  if (!data) return data;
  const d = JSON.parse(JSON.stringify(data));
  if (key === "points" && d.qualifies && d.qualifies.notes) {
    const notes = d.qualifies.notes;
    d.qualifies.items = d.qualifies.items.map((t) => (typeof t === "string" ? { text: t, note: notes[t] || "" } : t));
    delete d.qualifies.notes;
  }
  return d;
}

// give new billets and kits a stable id from their name
export function fillIds(key, data) {
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
  const uniq = (items) => {
    const seen = new Set();
    items.forEach((x) => {
      if (!x.id) { let id = slug(x.name); let n = 2; while (seen.has(id)) id = `${slug(x.name)}-${n++}`; x.id = id; }
      seen.add(x.id);
    });
  };
  if (key === "billets" && data.groups) uniq(data.groups.flatMap((g) => g.billets || []));
  if (key === "kits" && data.kits) uniq(data.kits);
  return data;
}
