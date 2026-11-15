import { useContext, useState } from "react";
import { Rich, plain, ImgCtx } from "./richtext.jsx";

// Page sections for the Codex page builder. Each one draws with the same
// classes as the built-in pages, so new pages look like the rest of the Codex.

const TONE = { t: "select", k: "tone", label: "Colour", options: [["", "Plain"], ["good", "Green"], ["holo", "Blue"], ["warn", "Gold"], ["bad", "Red"]] };
const toneClass = (t) => (t ? `cx-toned tone-${t}` : "");
const up = (s) => String(s || "").toUpperCase();

function H2({ children }) { return children ? <h2 className="cx-h2">{up(children)}</h2> : null; }

function TextBlock({ b }) {
  return <section className={`cx-panel ${toneClass(b.tone)}`}><H2>{b.heading}</H2><Rich value={b.body} className="cx-body" /></section>;
}

function ColumnsBlock({ b }) {
  const cols = b.cols || [];
  return (
    <div className={`cx-gridn cols-${Math.min(3, Math.max(1, cols.length))}`}>
      {cols.map((c, i) => <section key={i} className={`cx-panel ${toneClass(c.tone)}`}><H2>{c.heading}</H2><Rich value={c.body} className="cx-body" /></section>)}
    </div>
  );
}

const LIST_CLASS = { bullet: "cx-req", check: "cx-yes", cross: "cx-no", number: "cx-num" };
function ListBlock({ b }) {
  const Tag = b.style === "number" ? "ol" : "ul";
  return (
    <section className={`cx-panel ${b.style === "check" ? "cx-good" : b.style === "cross" ? "cx-bad" : ""}`}>
      <H2>{b.heading}</H2>
      {b.intro && <Rich value={b.intro} className="cx-body cx-block-intro" />}
      <Tag className={`cx-list ${LIST_CLASS[b.style] || "cx-req"}`}>{(b.items || []).map((t, i) => <li key={i}><Rich value={t} /></li>)}</Tag>
    </section>
  );
}

function CalloutBlock({ b }) {
  return <div className={`cx-callout ${b.tone === "warn" ? "warn" : ""}`}>{b.heading && <b>{up(b.heading)}</b>}<Rich value={b.body} /></div>;
}

function CardsBlock({ b }) {
  const pic = useContext(ImgCtx);
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      {b.intro && <Rich value={b.intro} className="cx-body cx-block-intro" />}
      <div className="cx-acc">
        {(b.cards || []).map((c, i) => (
          <div key={i} className="cx-acc-card">
            {c.image && <img className="cx-card-img" src={pic(c.image)} alt="" loading="lazy" />}
            {c.title && <b>{up(c.title)}</b>}
            <Rich value={c.body} />
          </div>
        ))}
      </div>
    </section>
  );
}

function TableBlock({ b }) {
  const g = b.table || { cols: [], rows: [] };
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      <div className="cx-scroll">
        <table className="cx-table">
          <thead><tr>{g.cols.map((c, i) => <th key={i}><Rich value={c} /></th>)}</tr></thead>
          <tbody>{g.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Rich value={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function StepsBlock({ b }) {
  const steps = b.steps || [];
  const [step, setStep] = useState(0);
  const cur = steps[Math.min(step, steps.length - 1)];
  if (!cur) return <section className="cx-panel"><H2>{b.heading}</H2></section>;
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      <ol className="cx-steps" style={{ gridTemplateColumns: `repeat(${Math.min(6, steps.length)}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={i}>
            <button type="button" aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""} onClick={() => setStep(i)}>
              <span className="cx-stepdot">{i + 1}</span><span>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="cx-stepbody holo" key={step}>
        <div className="eyebrow">{cur.label}</div>
        <Rich value={cur.body} className="cx-body" />
        <div className="row">
          <button type="button" className="btn btn-sm" disabled={step === 0} onClick={() => setStep(step - 1)}>‹ BACK</button>
          <button type="button" className="btn btn-sm" disabled={step >= steps.length - 1} onClick={() => setStep(step + 1)}>NEXT STEP ›</button>
        </div>
      </div>
    </section>
  );
}

function TabsBlock({ b }) {
  const tabs = b.tabs || [];
  const [tab, setTab] = useState(0);
  const cur = tabs[Math.min(tab, tabs.length - 1)];
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      <div className="cx-seg" role="tablist" aria-label={b.heading || "Tabs"}>
        {tabs.map((t, i) => <button key={i} role="tab" type="button" aria-selected={i === tab} onClick={() => setTab(i)}>{t.name || `Tab ${i + 1}`}</button>)}
      </div>
      {cur && <div role="tabpanel" key={tab}><Rich value={cur.body} className="cx-body" /></div>}
    </section>
  );
}

function ImageBlock({ b }) {
  const pic = useContext(ImgCtx);
  if (!b.src) return <section className="cx-panel cx-dim">No picture chosen yet.</section>;
  return (
    <figure className={`cx-figure size-${b.size || "large"} ${b.framed === false ? "" : "framed"}`}>
      <img src={pic(b.src)} alt={b.alt || plain(b.caption) || ""} loading="lazy" />
      {b.caption && <figcaption><Rich value={b.caption} /></figcaption>}
    </figure>
  );
}

function StatBlock({ b }) {
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      {b.body && <Rich value={b.body} className="cx-body" />}
      <div className="cx-bigstat">
        <span className="cx-bignum">{b.value}</span>
        <span><b>{b.title}</b><Rich value={b.note} className="cx-dim" /></span>
      </div>
    </section>
  );
}

function KeyBlock({ b }) {
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      <dl className="cx-key">{(b.items || []).map(([a, d], i) => <div key={i}><dt>{a}</dt><dd>{d}</dd></div>)}</dl>
    </section>
  );
}

function BadgesBlock({ b }) {
  return (
    <section className="cx-panel">
      <H2>{b.heading}</H2>
      {b.intro && <Rich value={b.intro} className="cx-dim cx-about" />}
      <div className="cx-badges">
        {(b.items || []).map(([ab, name], i) => <div key={i} className="cx-badge"><span className="cx-badge-ab">{ab || "—"}</span><span className="cx-badge-name cx-pre">{name}</span></div>)}
      </div>
    </section>
  );
}

const rich = (k, label, extra) => ({ t: "rich", k, label, ...extra });
const text = (k, label, extra) => ({ t: "text", k, label, ...extra });

export const BLOCKS = {
  text: {
    name: "Text panel", icon: "¶", desc: "A heading and formatted text: paragraphs, lists, pictures, tables.",
    fields: [text("heading", "Heading"), rich("body", "Text"), TONE],
    make: () => ({ heading: "New section", body: "" }), Render: TextBlock,
  },
  columns: {
    name: "Side-by-side panels", icon: "▥", desc: "Two or three panels next to each other.",
    fields: [{ t: "list", k: "cols", label: "Panels", itemName: "panel", title: (c) => c.heading, item: { t: "group", fields: [text("heading", "Heading"), rich("body", "Text"), TONE], make: () => ({ heading: "Panel", body: "" }) } }],
    make: () => ({ cols: [{ heading: "Left", body: "" }, { heading: "Right", body: "" }] }), Render: ColumnsBlock,
  },
  list: {
    name: "List", icon: "☰", desc: "A ticked, crossed, numbered or arrowed list, like the points rules.",
    fields: [text("heading", "Heading"), { t: "select", k: "style", label: "List style", options: [["bullet", "› Arrows"], ["check", "[+] Allowed"], ["cross", "[x] Not allowed"], ["number", "01 Numbered"]] },
      rich("intro", "Text above the list (optional)", { minimal: true }), { t: "list", k: "items", label: "Items", itemName: "item", item: { t: "rich", minimal: true } }],
    make: () => ({ heading: "List", style: "bullet", items: ["First item"] }), Render: ListBlock,
  },
  callout: {
    name: "Callout", icon: "❕", desc: "A highlighted note that stands out, in green or gold.",
    fields: [text("heading", "Label"), rich("body", "Text", { minimal: true }), { t: "select", k: "tone", label: "Colour", options: [["", "Green"], ["warn", "Gold (warning)"]] }],
    make: () => ({ heading: "Note", body: "" }), Render: CalloutBlock,
  },
  cards: {
    name: "Cards", icon: "▦", desc: "A grid of small cards, each with a title, picture and text.",
    fields: [text("heading", "Heading"), rich("intro", "Text above the cards (optional)", { minimal: true }),
      { t: "list", k: "cards", label: "Cards", itemName: "card", title: (c) => c.title, item: { t: "group", fields: [text("title", "Title"), { t: "image", k: "image", label: "Picture (optional)" }, rich("body", "Text", { minimal: true })], make: () => ({ title: "Card", body: "" }) } }],
    make: () => ({ heading: "Cards", cards: [{ title: "First card", body: "" }, { title: "Second card", body: "" }] }), Render: CardsBlock,
  },
  table: {
    name: "Table", icon: "⊞", desc: "Rows and columns, like the milestones or rank tables.",
    fields: [text("heading", "Heading"), { t: "grid", k: "table", label: "Table" }],
    make: () => ({ heading: "Table", table: { cols: ["Column 1", "Column 2"], rows: [["", ""], ["", ""]] } }), Render: TableBlock,
  },
  steps: {
    name: "Steps", icon: "①", desc: "A step-by-step guide readers click through, like the discharge steps.",
    fields: [text("heading", "Heading"), { t: "list", k: "steps", label: "Steps", itemName: "step", title: (s) => s.label, item: { t: "group", fields: [text("label", "Step name"), rich("body", "What to do")], make: () => ({ label: "Step", body: "" }) } }],
    make: () => ({ heading: "How to", steps: [{ label: "Step one", body: "" }, { label: "Step two", body: "" }] }), Render: StepsBlock,
  },
  tabs: {
    name: "Tabs", icon: "⊟", desc: "Buttons that switch between texts, like the duty statuses.",
    fields: [text("heading", "Heading"), { t: "list", k: "tabs", label: "Tabs", itemName: "tab", title: (t) => t.name, item: { t: "group", fields: [text("name", "Tab name"), rich("body", "Text")], make: () => ({ name: "Tab", body: "" }) } }],
    make: () => ({ heading: "", tabs: [{ name: "First", body: "" }, { name: "Second", body: "" }] }), Render: TabsBlock,
  },
  image: {
    name: "Picture", icon: "🖼", desc: "One picture on its own, with a caption.",
    fields: [{ t: "image", k: "src", label: "Picture" }, rich("caption", "Caption (optional)", { minimal: true }), text("alt", "Describe the picture (for screen readers)"),
      { t: "select", k: "size", label: "Size", options: [["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["full", "Full width"]] },
      { t: "check", k: "framed", label: "Show a frame round it" }],
    make: () => ({ src: "", size: "large", framed: true }), Render: ImageBlock,
  },
  stat: {
    name: "Big number", icon: "#", desc: "A big figure with a label, like the most points you can gain.",
    fields: [text("heading", "Heading"), rich("body", "Text above (optional)", { minimal: true }), text("value", "Big number or word"), text("title", "Label"), rich("note", "Small print (optional)", { minimal: true })],
    make: () => ({ heading: "", value: "10", title: "Label", note: "" }), Render: StatBlock,
  },
  key: {
    name: "Abbreviations", icon: "≔", desc: "Short codes and what they mean, like the points key.",
    fields: [text("heading", "Heading"), { t: "list", k: "items", label: "Entries", itemName: "entry", item: { t: "pair", labels: ["Short", "Meaning"] } }],
    make: () => ({ heading: "Key", items: [["FTL", "Fire Team Leader"]] }), Render: KeyBlock,
  },
  badges: {
    name: "Badges", icon: "⬡", desc: "Hexagon badges with a short code and a name, like Quals & Certs.",
    fields: [text("heading", "Heading"), rich("intro", "Text above (optional)", { minimal: true }), { t: "list", k: "items", label: "Badges", itemName: "badge", item: { t: "pair", labels: ["Code", "Name"], types: ["text", "lines"] } }],
    make: () => ({ heading: "Badges", items: [["MM", "Marksman"]] }), Render: BadgesBlock,
  },
};

export const BLOCK_ORDER = ["text", "columns", "list", "callout", "cards", "table", "steps", "tabs", "image", "stat", "key", "badges"];

export function newBlock(type) {
  return { id: Math.random().toString(36).slice(2, 10), type, ...BLOCKS[type].make() };
}

export function blockTitle(b) {
  const def = BLOCKS[b.type];
  const t = b.heading || b.title || (b.type === "image" ? plain(b.caption) : "") || (b.cols && b.cols[0] && b.cols[0].heading) || "";
  return `${def ? def.name : b.type}${t ? ` · ${plain(t).split("\n")[0].slice(0, 50)}` : ""}`;
}

export function Blocks({ blocks }) {
  return (blocks || []).map((b, i) => {
    const def = BLOCKS[b.type];
    if (!def) return null;
    const R = def.Render;
    return <R key={b.id || i} b={b} />;
  });
}

// text of the sections, for search
export function blocksText(blocks) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") { if (v && !/^[a-z0-9]{8}$/.test(v) && !/^(\/api\/files|https?:)/.test(v)) out.push(plain(v)); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (k !== "type" && k !== "id" && k !== "tone" && k !== "style" && k !== "size" && k !== "src" && k !== "image") walk(x); });
  };
  walk(blocks);
  return out.join(" · ");
}
