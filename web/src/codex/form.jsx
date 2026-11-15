import { useContext, useRef, useState } from "react";
import { RichField } from "./rich.jsx";
import { plain, ImgCtx } from "./richtext.jsx";
import { uploadImage } from "./api.js";

// A form built from a small description of the content, so every Codex page and
// section can be edited the same friendly way. Field kinds:
//   text, lines (several lines), rich (formatted text), image, number, select, check,
//   group (fields of one object), list (of any field), pair ([a, b]), cell (table cell
//   that can span rows), grid (a whole table).

export function blankFor(spec) {
  if (spec.make) return spec.make();
  switch (spec.t) {
    case "number": return 0;
    case "check": return false;
    case "select": return spec.options[0][0];
    case "list": return [];
    case "pair": return ["", ""];
    case "cell": return { text: "", rows: 1 };
    case "grid": return { cols: ["Column 1", "Column 2"], rows: [["", ""]] };
    case "group": {
      const o = {};
      (spec.fields || []).forEach((f) => { if (f.k) o[f.k] = blankFor(f); else if (f.t === "group") Object.assign(o, blankFor(f)); });
      return o;
    }
    default: return "";
  }
}

const move = (arr, i, d) => { const a = arr.slice(); const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function Fields({ fields, value, onChange }) {
  const v = value || {};
  return (
    <div className="fx-fields">
      {fields.map((f, i) => {
        if (f.when && !f.when(v)) return null;
        if (!f.k) {
          // a heading over a few fields of the same object
          return (
            <fieldset key={i} className="fx-set">
              {f.label && <legend>{f.label}</legend>}
              {f.hint && <p className="fx-hint">{f.hint}</p>}
              <Fields fields={f.fields} value={v} onChange={onChange} />
            </fieldset>
          );
        }
        return <Field key={f.k} spec={f} value={v[f.k]} onChange={(nv) => onChange({ ...v, [f.k]: nv })} />;
      })}
    </div>
  );
}

let uid = 0;
export function Field({ spec, value, onChange, bare }) {
  const [id] = useState(() => `fx-${++uid}`);
  const lab = !bare && spec.label && (
    <div className="fx-label">
      <label htmlFor={id}>{spec.label}</label>
      {spec.hint && <span className="fx-hint">{spec.hint}</span>}
    </div>
  );
  switch (spec.t) {
    case "text":
      return <div className="fx-field">{lab}<input id={id} className="input input-sm" value={value ?? ""} maxLength={spec.max || 200} placeholder={spec.placeholder || ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "lines":
      return <div className="fx-field">{lab}<textarea id={id} className="input fx-lines" rows={spec.rows || Math.min(8, Math.max(2, String(value || "").split("\n").length))} value={value ?? ""} placeholder={spec.placeholder || ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "number":
      return <div className="fx-field fx-narrow">{lab}<input id={id} type="number" className="input input-sm" value={value ?? 0} min={spec.min} max={spec.max} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></div>;
    case "select":
      return (
        <div className="fx-field">{lab}
          <div className="fx-choice" role="radiogroup" aria-label={spec.label}>
            {spec.options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={(value ?? spec.options[0][0]) === v} onClick={() => onChange(v)}>{l}</button>)}
          </div>
        </div>
      );
    case "check":
      return <label className="fx-check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {spec.label}{spec.hint && <span className="fx-hint">{spec.hint}</span>}</label>;
    case "rich":
      return <div className="fx-field">{lab}<RichField value={value || ""} onChange={onChange} label={spec.label} placeholder={spec.placeholder} minimal={spec.minimal} /></div>;
    case "image":
      return <div className="fx-field">{lab}<ImageField value={value || ""} onChange={onChange} /></div>;
    case "group":
      return (
        <div className="fx-field">
          {lab}
          <div className="fx-group"><Fields fields={spec.fields} value={value || {}} onChange={onChange} /></div>
        </div>
      );
    case "pair":
      return <PairField spec={spec} value={value} onChange={onChange} lab={lab} />;
    case "cell":
      return <CellField spec={spec} value={value} onChange={onChange} lab={lab} />;
    case "grid":
      return <div className="fx-field">{lab}<GridField value={value} onChange={onChange} /></div>;
    case "list":
      return <ListField spec={spec} value={Array.isArray(value) ? value : []} onChange={onChange} lab={lab} />;
    default:
      return null;
  }
}

function PairField({ spec, value, onChange, lab }) {
  const v = Array.isArray(value) ? value : ["", ""];
  const [la, lb] = spec.labels || ["", ""];
  const [ta, tb] = spec.types || ["text", "text"];
  const set = (i, x) => { const n = v.slice(); n[i] = x; onChange(n); };
  return (
    <div className="fx-field">
      {lab}
      <div className="fx-pair">
        <Field spec={{ t: ta, label: la }} value={v[0]} onChange={(x) => set(0, x)} />
        <Field spec={{ t: tb, label: lb }} value={v[1]} onChange={(x) => set(1, x)} />
      </div>
    </div>
  );
}

function CellField({ spec, value, onChange, lab }) {
  const merged = value == null;
  return (
    <div className="fx-field fx-cell">
      {lab}
      <label className="fx-check"><input type="checkbox" checked={merged} onChange={(e) => onChange(e.target.checked ? null : { text: "", rows: 1 })} /> Joined to the cell above</label>
      {!merged && (
        <div className="fx-pair">
          <Field spec={{ t: "lines", label: "Text" }} value={value.text} onChange={(t) => onChange({ ...value, text: t })} />
          <Field spec={{ t: "number", label: "Rows tall", min: 1, max: 30 }} value={value.rows || 1} onChange={(n) => onChange({ ...value, rows: Math.max(1, n || 1) })} />
        </div>
      )}
    </div>
  );
}

function GridField({ value, onChange }) {
  const v = value && Array.isArray(value.cols) ? value : { cols: ["Column 1", "Column 2"], rows: [["", ""]] };
  const n = v.cols.length;
  const setCol = (i, t) => onChange({ ...v, cols: v.cols.map((c, j) => (j === i ? t : c)) });
  const setCell = (r, i, t) => onChange({ ...v, rows: v.rows.map((row, k) => (k === r ? row.map((c, j) => (j === i ? t : c)) : row)) });
  const addCol = () => onChange({ cols: [...v.cols, `Column ${n + 1}`], rows: v.rows.map((r) => [...r, ""]) });
  const delCol = (i) => n > 1 && onChange({ cols: v.cols.filter((_, j) => j !== i), rows: v.rows.map((r) => r.filter((_, j) => j !== i)) });
  const addRow = (at) => { const rows = v.rows.slice(); rows.splice(at, 0, Array(n).fill("")); onChange({ ...v, rows }); };
  return (
    <div className="fx-grid">
      <div className="cx-scroll">
        <table>
          <thead>
            <tr>
              {v.cols.map((c, i) => (
                <th key={i}>
                  <input className="input input-sm" aria-label={`Column ${i + 1} heading`} value={c} onChange={(e) => setCol(i, e.target.value)} />
                  {n > 1 && <button type="button" className="fx-x" title="Delete this column" aria-label={`Delete column ${i + 1}`} onClick={() => delCol(i)}>✕</button>}
                </th>
              ))}
              <th className="fx-grid-add"><button type="button" className="btn btn-sm" onClick={addCol} title="Add a column">+ COL</button></th>
            </tr>
          </thead>
          <tbody>
            {v.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => <td key={i}><textarea className="input" rows={Math.min(5, Math.max(1, String(c).split("\n").length))} aria-label={`Row ${r + 1}, ${v.cols[i] || `column ${i + 1}`}`} value={c} onChange={(e) => setCell(r, i, e.target.value)} /></td>)}
                <td className="fx-rowtools">
                  <button type="button" className="fx-x" title="Move up" aria-label={`Move row ${r + 1} up`} disabled={r === 0} onClick={() => onChange({ ...v, rows: move(v.rows, r, -1) })}>↑</button>
                  <button type="button" className="fx-x" title="Move down" aria-label={`Move row ${r + 1} down`} disabled={r === v.rows.length - 1} onClick={() => onChange({ ...v, rows: move(v.rows, r, 1) })}>↓</button>
                  <button type="button" className="fx-x" title="Add a row below" aria-label={`Add a row below row ${r + 1}`} onClick={() => addRow(r + 1)}>+</button>
                  <button type="button" className="fx-x" title="Delete this row" aria-label={`Delete row ${r + 1}`} onClick={() => onChange({ ...v, rows: v.rows.filter((_, k) => k !== r) })}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-sm" onClick={() => addRow(v.rows.length)}>+ ADD ROW</button>
    </div>
  );
}

function ImageField({ value, onChange }) {
  const resolve = useContext(ImgCtx);
  const ref = useRef(null);
  const [busy, setBusy] = useState("");
  const src = value ? resolve(value) : "";
  const pick = async (f) => {
    if (!f) return;
    setBusy("Uploading…");
    try { onChange(await uploadImage(f)); setBusy(""); }
    catch (err) { setBusy(err?.response?.message || err.message || "Upload failed. Try again."); }
  };
  return (
    <div className="fx-image" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
      <div className="fx-thumb">{src ? <img src={src} alt="" /> : <span>NO PICTURE</span>}</div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => ref.current?.click()}>{value ? "CHANGE PICTURE" : "UPLOAD PICTURE"}</button>
          {value && <button type="button" className="btn btn-sm" onClick={() => onChange("")}>REMOVE</button>}
        </div>
        <span className="fx-hint">{busy || "Or drag a picture here. PNG, JPG, WebP or GIF up to 10 MB."}</span>
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

// Lists of plain text or formatted text are edited in place; lists of bigger
// things fold into cards with a title, so long lists stay easy to scan.
const SIMPLE = ["text", "lines", "rich", "pair", "image"];
function ListField({ spec, value, onChange, lab }) {
  const item = spec.item;
  const simple = SIMPLE.indexOf(item.t) !== -1;
  const [open, setOpen] = useState(() => (value.length === 1 ? { 0: true } : {}));
  const name = spec.itemName || "item";
  const titleOf = (x, i) => {
    const t = spec.title ? spec.title(x, i) : "";
    return plain(t).split("\n")[0].slice(0, 70) || `${name[0].toUpperCase()}${name.slice(1)} ${i + 1}`;
  };
  const add = (at) => {
    const a = value.slice();
    a.splice(at, 0, blankFor(item));
    onChange(a);
    setOpen((o) => ({ ...shift(o, at, 1), [at]: true }));
  };
  const del = (i) => {
    if (!simple && !window.confirm(`Delete “${titleOf(value[i], i)}”?`)) return;
    onChange(value.filter((_, j) => j !== i));
    setOpen((o) => shift(o, i, -1));
  };
  const mv = (i, d) => {
    onChange(move(value, i, d));
    setOpen((o) => { const n = { ...o }; const a = !!o[i], b = !!o[i + d]; n[i] = b; n[i + d] = a; return n; });
  };
  const dup = (i) => { const a = value.slice(); a.splice(i + 1, 0, clone(value[i])); onChange(a); setOpen((o) => ({ ...shift(o, i + 1, 1), [i + 1]: true })); };
  const tools = (i) => (
    <span className="fx-tools">
      <button type="button" className="fx-x" title="Move up" aria-label={`Move ${titleOf(value[i], i)} up`} disabled={i === 0} onClick={() => mv(i, -1)}>↑</button>
      <button type="button" className="fx-x" title="Move down" aria-label={`Move ${titleOf(value[i], i)} down`} disabled={i === value.length - 1} onClick={() => mv(i, 1)}>↓</button>
      <button type="button" className="fx-x" title="Copy" aria-label={`Copy ${titleOf(value[i], i)}`} onClick={() => dup(i)}>⧉</button>
      <button type="button" className="fx-x danger" title="Delete" aria-label={`Delete ${titleOf(value[i], i)}`} onClick={() => del(i)}>✕</button>
    </span>
  );
  return (
    <div className="fx-field fx-list">
      <div className="fx-label">
        {lab && <span className="fx-ltext">{spec.label}</span>}
        <span className="fx-count">{value.length}</span>
        {lab && spec.hint && <span className="fx-hint">{spec.hint}</span>}
      </div>
      {simple ? (
        <ol className="fx-simple">
          {value.map((x, i) => (
            <li key={i}>
              <Field spec={{ ...item, label: "" }} value={x} onChange={(nv) => onChange(value.map((y, j) => (j === i ? nv : y)))} bare />
              {tools(i)}
            </li>
          ))}
        </ol>
      ) : (
        <div className="fx-cards">
          {value.map((x, i) => (
            <div key={i} className={`fx-card ${open[i] ? "open" : ""}`}>
              <div className="fx-card-head">
                <button type="button" className="fx-card-toggle" aria-expanded={!!open[i]} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                  <span className="fx-caret" aria-hidden="true">{open[i] ? "▾" : "▸"}</span>{titleOf(x, i)}
                </button>
                {tools(i)}
              </div>
              {open[i] && <div className="fx-card-body"><Field spec={{ ...item, label: "" }} value={x} onChange={(nv) => onChange(value.map((y, j) => (j === i ? nv : y)))} bare /></div>}
            </div>
          ))}
        </div>
      )}
      {value.length === 0 && <p className="fx-hint">Nothing here yet.</p>}
      <button type="button" className="btn btn-sm fx-add" onClick={() => add(value.length)}>+ ADD {name.toUpperCase()}</button>
    </div>
  );
}
function shift(o, at, d) {
  const n = {};
  Object.keys(o).forEach((k) => { const i = Number(k); if (i < at) n[i] = o[k]; else if (d > 0) n[i + d] = o[k]; else if (i > at) n[i - 1] = o[k]; });
  return n;
}
