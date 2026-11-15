import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../pb.js";
import { Fields, Field } from "./form.jsx";
import { BLOCKS, BLOCK_ORDER, newBlock, blockTitle } from "./blocks.jsx";
import { SCHEMAS, normalise, fillIds } from "./schemas.js";
import { savePage, createPage, deletePage, pageHistory, deletedPages, restoreVersion, reorderPages } from "./api.js";
import "./editor.css";

// Codex edit mode: the editing panel, new page, arrange pages and history.
// Loaded only for members with the Edit Codex permission.

const stamp = (iso) => (iso ? new Date(String(iso).replace(" ", "T")).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const codeFrom = (name) => {
  const words = String(name || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].replace(/[AEIOU]/g, (m, i) => (i === 0 ? m : "")).slice(0, 3).padEnd(2, "X");
  return words.slice(0, 3).map((w) => w[0]).join("");
};

export function Modal({ title, children, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const first = ref.current?.querySelector("input, textarea, select, button:not(.mx-close)");
    first?.focus();
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="mx-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`mx ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="mx-head"><h2>{title}</h2><button type="button" className="mx-close" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="mx-body">{children}</div>
      </div>
    </div>
  );
}

// ── page sections ───────────────────────────────────────────────────────────
function Palette({ onPick }) {
  return (
    <div className="ed-palette">
      {BLOCK_ORDER.map((t) => (
        <button key={t} type="button" className="ed-pal" onClick={() => onPick(t)}>
          <span className="ed-pal-icon" aria-hidden="true">{BLOCKS[t].icon}</span>
          <b>{BLOCKS[t].name}</b>
          <span>{BLOCKS[t].desc}</span>
        </button>
      ))}
    </div>
  );
}

export function BlocksEditor({ blocks, onChange, empty }) {
  const list = blocks || [];
  const [open, setOpen] = useState(() => (list.length === 1 ? list[0].id : ""));
  const [adding, setAdding] = useState(-1);
  const insert = (at, type) => {
    const b = newBlock(type);
    const a = list.slice(); a.splice(at, 0, b);
    onChange(a); setOpen(b.id); setAdding(-1);
  };
  const mv = (i, d) => { const a = list.slice(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  const dup = (i) => { const b = { ...clone(list[i]), id: Math.random().toString(36).slice(2, 10) }; const a = list.slice(); a.splice(i + 1, 0, b); onChange(a); setOpen(b.id); };
  const del = (i) => { if (window.confirm(`Delete the section “${blockTitle(list[i])}”?`)) onChange(list.filter((_, j) => j !== i)); };
  const addBtn = (at) => (
    adding === at
      ? <div className="ed-adding"><div className="ed-adding-head"><b>PICK A SECTION TO ADD</b><button type="button" className="btn btn-sm" onClick={() => setAdding(-1)}>CANCEL</button></div><Palette onPick={(t) => insert(at, t)} /></div>
      : <button type="button" className="ed-insert" onClick={() => setAdding(at)}>+ ADD A SECTION HERE</button>
  );
  return (
    <div className="ed-blocks">
      {list.length === 0 && <p className="fx-hint">{empty}</p>}
      {list.length > 0 && addBtn(0)}
      {list.map((b, i) => {
        const def = BLOCKS[b.type];
        const isOpen = open === b.id;
        return (
          <div key={b.id || i}>
            <div className={`fx-card ed-block ${isOpen ? "open" : ""}`}>
              <div className="fx-card-head">
                <button type="button" className="fx-card-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : b.id)}>
                  <span className="fx-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                  <span className="ed-block-icon" aria-hidden="true">{def ? def.icon : "?"}</span>{blockTitle(b)}
                </button>
                <span className="fx-tools">
                  <button type="button" className="fx-x" title="Move up" aria-label="Move section up" disabled={i === 0} onClick={() => mv(i, -1)}>↑</button>
                  <button type="button" className="fx-x" title="Move down" aria-label="Move section down" disabled={i === list.length - 1} onClick={() => mv(i, 1)}>↓</button>
                  <button type="button" className="fx-x" title="Copy" aria-label="Copy section" onClick={() => dup(i)}>⧉</button>
                  <button type="button" className="fx-x danger" title="Delete" aria-label="Delete section" onClick={() => del(i)}>✕</button>
                </span>
              </div>
              {isOpen && def && (
                <div className="fx-card-body">
                  <Fields fields={def.fields} value={b} onChange={(nb) => onChange(list.map((x, j) => (j === i ? nb : x)))} />
                </div>
              )}
            </div>
            {addBtn(i + 1)}
          </div>
        );
      })}
      {list.length === 0 && addBtn(0)}
    </div>
  );
}

// ── the editing panel ───────────────────────────────────────────────────────
const META_FIELDS = [
  { t: "text", k: "label", label: "Name in the menu", max: 60 },
  { t: "text", k: "code", label: "Short code", hint: "2 to 4 letters, shown next to the name", max: 4 },
  { t: "text", k: "heading", label: "Page title", hint: "The big title at the top of the page", max: 80 },
  { t: "lines", k: "intro", label: "Line under the title (optional)", rows: 2 },
  { t: "lines", k: "blurb", label: "Description on the Codex front page", rows: 2 },
  { t: "check", k: "hidden", label: "Hide this page", hint: "Only Codex editors can see a hidden page" },
];

// page: the merged page (meta + data + blocks) as shown. draft: what's being edited.
export function PageEditor({ page, defaults, draft, setDraft, onSaved, onClose, onDeleted }) {
  const builtin = page.kind === "builtin";
  const [tab, setTab] = useState(builtin ? "content" : "sections");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [showHistory, setShowHistory] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(page));
  const schema = SCHEMAS[page.key];

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true); setMsg({ kind: "", text: "" });
    try {
      const body = { label: draft.label, code: draft.code, heading: draft.heading, intro: draft.intro, blurb: draft.blurb, hidden: !!draft.hidden, blocks: draft.blocks || [], sort: page.sort, defaults };
      if (builtin && draft.dataChanged) body.data = fillIds(page.key, clone(draft.data));
      const saved = await savePage(page.key, body);
      onSaved(saved);
      setMsg({ kind: "ok", text: "Saved. Everyone sees the new version now." });
    } catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); }
    setBusy(false);
  };
  const discard = () => { if (!dirty || window.confirm("Throw away the changes you haven't saved?")) { setDraft(draftFrom(page)); setMsg({ kind: "", text: "" }); } };
  const close = () => { if (!dirty || window.confirm("You have changes that aren't saved. Close and throw them away?")) onClose(); };
  const resetOrDelete = async () => {
    const q = builtin
      ? `Put “${page.label}” back to the original Codex content? Every change made on the site to this page is undone. You can still bring your version back from History.`
      : `Delete the page “${page.label}”? You can bring it back later from Arrange pages.`;
    if (!window.confirm(q)) return;
    setBusy(true);
    try { await deletePage(page.key); onDeleted(page.key); }
    catch (err) { setMsg({ kind: "error", text: errorMessage(err) }); setBusy(false); }
  };

  return (
    <aside className="ed-drawer" aria-label={`Editing ${page.label}`}>
      <div className="ed-head">
        <div>
          <div className="eyebrow">EDITING · {page.code}</div>
          <h2>{draft.label || page.label}</h2>
          {page.updatedBy && <div className="fx-hint">Last saved by {page.updatedBy}, {stamp(page.updatedAt)}</div>}
        </div>
        <button type="button" className="mx-close" aria-label="Close the editor" onClick={close}>✕</button>
      </div>
      <div className="ed-tabs" role="tablist">
        {builtin && schema && <button type="button" role="tab" aria-selected={tab === "content"} onClick={() => setTab("content")}>PAGE CONTENT</button>}
        <button type="button" role="tab" aria-selected={tab === "sections"} onClick={() => setTab("sections")}>{builtin ? "EXTRA SECTIONS" : "SECTIONS"}{draft.blocks?.length ? ` (${draft.blocks.length})` : ""}</button>
        <button type="button" role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>SETTINGS</button>
      </div>
      <div className="ed-scroll">
        {tab === "content" && schema && (
          <>
            <p className="fx-hint ed-tip">Changes show on the page straight away. Nothing is public until you press SAVE.</p>
            <Fields fields={schema} value={draft.data} onChange={(d) => setDraft({ ...draft, data: d, dataChanged: true })} />
          </>
        )}
        {tab === "sections" && (
          <>
            <p className="fx-hint ed-tip">{builtin ? "Add your own sections under this page's content: text, lists, cards, tables, steps, pictures and more." : "Build the page from sections. Each one looks like the rest of the Codex."}</p>
            <BlocksEditor blocks={draft.blocks} onChange={(b) => setDraft({ ...draft, blocks: b })} empty="No sections yet. Add the first one." />
          </>
        )}
        {tab === "settings" && (
          <>
            <Fields fields={META_FIELDS} value={draft} onChange={(m) => setDraft({ ...draft, ...m, code: String(m.code || "").toUpperCase() })} />
            <div className="ed-danger">
              <b>{builtin ? "PUT BACK TO ORIGINAL" : "DELETE THIS PAGE"}</b>
              <p className="fx-hint">{builtin ? "Undo every change made on the site to this page and show the original Codex content again." : "Removes the page from the Codex. It can be brought back from Arrange pages."}</p>
              <button type="button" className="btn btn-sm btn-danger" disabled={busy || (builtin && !page.edited)} onClick={resetOrDelete}>{builtin ? "PUT BACK TO ORIGINAL" : "DELETE PAGE"}</button>
            </div>
          </>
        )}
      </div>
      <div className="ed-foot">
        {msg.text && <p className={`notice ${msg.kind === "error" ? "notice-error" : "notice-ok"}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>}
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "SAVING…" : dirty ? "SAVE" : "SAVED"}</button>
          <button type="button" className="btn" disabled={busy || !dirty} onClick={discard}>DISCARD CHANGES</button>
          <button type="button" className="btn ed-right" onClick={() => setShowHistory(true)}>HISTORY</button>
        </div>
      </div>
      {showHistory && (
        <HistoryDialog page={page} onClose={() => setShowHistory(false)} onRestored={(p) => { setShowHistory(false); onSaved(p); setMsg({ kind: "ok", text: "Older version put back." }); }} />
      )}
    </aside>
  );
}

export function draftFrom(page) {
  return {
    label: page.label, code: page.code, heading: page.heading, intro: page.intro || "", blurb: page.blurb || "", hidden: !!page.hidden,
    data: page.kind === "builtin" ? normalise(page.key, page.data) : null, blocks: clone(page.blocks || []),
  };
}

function HistoryDialog({ page, onClose, onRestored }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { pageHistory(page.key).then(setItems).catch((e) => setErr(errorMessage(e))); }, [page.key]);
  const restore = async (h) => {
    if (!window.confirm(`Put back the version saved ${stamp(h.at)}? The current version is kept in this list too.`)) return;
    try { onRestored(await restoreVersion(h.id)); } catch (e) { setErr(errorMessage(e)); }
  };
  return (
    <Modal title={`History · ${page.label}`} onClose={onClose}>
      <p className="fx-hint">Each time the page is saved, the version before it is kept here (the last 40).</p>
      {err && <p className="notice notice-error" role="alert">{err}</p>}
      {items === null && !err && <p className="fx-hint">Loading…</p>}
      {items && items.length === 0 && <p className="fx-hint">No earlier versions yet. They appear after the page is saved a second time.</p>}
      <ol className="ed-history">
        {(items || []).map((h) => (
          <li key={h.id}>
            <span><b>{stamp(h.at)}</b><span className="fx-hint">Replaced by {h.savedBy || "someone"}{h.note ? ` · ${h.note}` : ""}</span></span>
            <button type="button" className="btn btn-sm" onClick={() => restore(h)}>PUT THIS BACK</button>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

// ── new page ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  ["blank", "Blank", "Start with an empty page.", []],
  ["text", "Text page", "A text panel and a callout.", ["text", "callout"]],
  ["guide", "How-to guide", "Steps readers click through, with a list of rules.", ["text", "steps", "list"]],
  ["ref", "Reference", "A table and an abbreviations key.", ["table", "key"]],
  ["cards", "Cards", "A grid of cards with pictures.", ["text", "cards"]],
  ["tabs", "Tabs", "Buttons that switch between texts.", ["tabs", "callout"]],
];

export function NewPageDialog({ onClose, onCreated, nextSort }) {
  const [f, setF] = useState({ label: "", code: "", blurb: "", tpl: "text" });
  const [codeTouched, setCodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const tpl = TEMPLATES.find((t) => t[0] === f.tpl);
      const p = await createPage({ label: f.label.trim(), code: f.code || codeFrom(f.label), blurb: f.blurb, heading: f.label.trim().toUpperCase(), blocks: tpl[3].map(newBlock), sort: nextSort });
      onCreated(p);
    } catch (e2) { setErr(errorMessage(e2)); setBusy(false); }
  };
  return (
    <Modal title="New Codex page" onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <div className="fx-pair">
          <label className="field">PAGE NAME<input className="input" required maxLength={60} value={f.label} placeholder="e.g. Callsign Guide" onChange={(e) => setF({ ...f, label: e.target.value, code: codeTouched ? f.code : codeFrom(e.target.value) })} /></label>
          <label className="field">SHORT CODE<input className="input" required minLength={2} maxLength={4} value={f.code} placeholder="CSG" onChange={(e) => { setCodeTouched(true); setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }); }} /></label>
        </div>
        <label className="field">DESCRIPTION ON THE CODEX FRONT PAGE<input className="input" maxLength={300} value={f.blurb} placeholder="One line on what the page covers" onChange={(e) => setF({ ...f, blurb: e.target.value })} /></label>
        <div className="field">START FROM
          <div className="ed-templates" role="radiogroup" aria-label="Start from">
            {TEMPLATES.map(([id, name, desc]) => (
              <button key={id} type="button" role="radio" aria-checked={f.tpl === id} className="ed-pal" onClick={() => setF({ ...f, tpl: id })}><b>{name}</b><span>{desc}</span></button>
            ))}
          </div>
        </div>
        {err && <p className="notice notice-error" role="alert">{err}</p>}
        <div className="row"><button type="submit" className="btn btn-primary" disabled={busy || !f.label.trim()}>{busy ? "CREATING…" : "CREATE PAGE"}</button><button type="button" className="btn" onClick={onClose}>CANCEL</button></div>
        <p className="fx-hint">The page shows in the menu straight away. To work on it in private first, tick “Hide this page” in its Settings.</p>
      </form>
    </Modal>
  );
}

// ── arrange pages ───────────────────────────────────────────────────────────
export function ArrangeDialog({ pages, onClose, onDone }) {
  const [list, setList] = useState(pages.map((p) => ({ ...p })));
  const [deleted, setDeleted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { deletedPages().then(setDeleted).catch(() => setDeleted([])); }, []);
  const mv = (i, d) => { const a = list.slice(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setList(a); };
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await reorderPages(list.map((p) => ({ key: p.key, label: p.label, code: p.code, blurb: p.blurb, heading: p.heading, intro: p.intro })));
      const hides = list.filter((p) => !!p.hidden !== !!pages.find((x) => x.key === p.key).hidden);
      for (const p of hides) await savePage(p.key, { hidden: !!p.hidden, defaults: { label: p.label, code: p.code, blurb: p.blurb, heading: p.heading, intro: p.intro } });
      onDone();
    } catch (e) { setErr(errorMessage(e)); setBusy(false); }
  };
  const bringBack = async (d) => {
    try { await restoreVersion(d.id); onDone(); } catch (e) { setErr(errorMessage(e)); }
  };
  return (
    <Modal title="Arrange pages" onClose={onClose}>
      <p className="fx-hint">Move pages up or down the menu, or hide them. Hidden pages are only shown to Codex editors.</p>
      <ol className="ed-arrange">
        {list.map((p, i) => (
          <li key={p.key} className={p.hidden ? "hidden" : ""}>
            <span className="cx-code">{p.code}</span>
            <span className="ed-arrange-name">{p.label}{p.hidden && <span className="ed-tag">HIDDEN</span>}</span>
            <span className="fx-tools">
              <button type="button" className="fx-x" aria-label={`Move ${p.label} up`} disabled={i === 0} onClick={() => mv(i, -1)}>↑</button>
              <button type="button" className="fx-x" aria-label={`Move ${p.label} down`} disabled={i === list.length - 1} onClick={() => mv(i, 1)}>↓</button>
              <button type="button" className="btn btn-sm" onClick={() => setList(list.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)))}>{p.hidden ? "SHOW" : "HIDE"}</button>
            </span>
          </li>
        ))}
      </ol>
      {err && <p className="notice notice-error" role="alert">{err}</p>}
      <div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "SAVING…" : "SAVE ORDER"}</button><button type="button" className="btn" onClick={onClose}>CANCEL</button></div>
      {deleted && deleted.length > 0 && (
        <div className="ed-deleted">
          <b>DELETED PAGES</b>
          <ol className="ed-history">
            {deleted.map((d) => <li key={d.id}><span><b>{d.label || d.key}</b><span className="fx-hint">Deleted {stamp(d.at)}{d.savedBy ? ` by ${d.savedBy}` : ""}</span></span><button type="button" className="btn btn-sm" onClick={() => bringBack(d)}>BRING BACK</button></li>)}
          </ol>
        </div>
      )}
    </Modal>
  );
}

export { Field };
