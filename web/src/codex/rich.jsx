import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { uploadImage } from "./api.js";
import { Rich, plain, toHtml } from "./richtext.jsx";

// an image that can be dragged to resize and set to sit left, centre or right
const CodexImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (el) => el.getAttribute("data-align") || "center",
        renderHTML: (attrs) => ({ "data-align": attrs.align || "center" }),
      },
    };
  },
}).configure({ inline: false, allowBase64: false, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 40, minHeight: 20 } });

const COLORS = [
  ["Default", ""], ["Bright", "#f2fbf5"], ["Holo green", "#5fd38a"], ["Pale green", "#a8f0c8"], ["Gold", "#d4a72c"],
  ["Amber", "#ffb547"], ["Red", "#ff8a80"], ["Blue", "#7cc4ff"], ["Grey", "#84a893"],
];
const HIGHLIGHTS = [["None", ""], ["Green", "rgba(95,211,138,.3)"], ["Gold", "rgba(212,167,44,.35)"], ["Red", "rgba(200,49,43,.4)"], ["Blue", "rgba(124,196,255,.3)"]];
const SIZES = [["Small", "13px"], ["Normal", ""], ["Large", "19px"], ["Huge", "24px"]];

function Btn({ on, label, title, onClick, disabled, wide }) {
  return (
    <button type="button" className={`rx-btn ${on ? "on" : ""} ${wide ? "wide" : ""}`} aria-pressed={on ? true : undefined} title={title || label} aria-label={title || label}
      disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</button>
  );
}

function Pop({ label, title, children, on }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="rx-pop" ref={ref}>
      <Btn label={label} title={title} on={on || open} onClick={() => setOpen((o) => !o)} />
      {open && <div className="rx-menu" role="menu" onClick={(e) => { if (e.target.closest("[data-close]")) setOpen(false); }}>{children}</div>}
    </span>
  );
}

export function RichEditor({ value, onChange, placeholder = "Write here…", minimal = false, label }) {
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const insertFiles = async (files, pos) => {
    const ed = editorRef.current;
    const imgs = [...files].filter((f) => /^image\//.test(f.type));
    if (!imgs.length || !ed) return false;
    for (const f of imgs) {
      setBusy(`Uploading ${f.name}…`);
      try {
        const url = await uploadImage(f);
        const width = Math.min(480, Math.round((ed.view.dom.clientWidth || 600) * 0.6));
        const chain = ed.chain().focus();
        (pos != null ? chain.insertContentAt(pos, { type: "image", attrs: { src: url, alt: f.name.replace(/\.[^.]+$/, ""), width } }) : chain.setImage({ src: url, alt: f.name.replace(/\.[^.]+$/, ""), width })).run();
        setBusy("");
      } catch (err) {
        setBusy(`Couldn't upload ${f.name}: ${err?.response?.message || err.message || "try again"}`);
      }
    }
    return true;
  };
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true, defaultProtocol: "https" }, codeBlock: false, code: false }),
      TextStyle, Color, FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CodexImage,
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: toHtml(value),
    editorProps: {
      attributes: { class: "cx-rich rx-area", "aria-label": label || "Text", "data-placeholder": placeholder },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length && [...files].some((f) => /^image\//.test(f.type))) { insertFiles(files); return true; }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length && [...files].some((f) => /^image\//.test(f.type))) {
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          insertFiles(files, at ? at.pos : null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChangeRef.current(html);
    },
  });
  editorRef.current = editor;
  onChangeRef.current = onChange;

  // the value was changed from outside (undo in the form, moved item): show it
  useEffect(() => {
    if (!editor) return;
    const cur = editor.isEmpty ? "" : editor.getHTML();
    const next = toHtml(value);
    if (next !== cur && !editor.isFocused) editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }), h4: e.isActive("heading", { level: 4 }),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }), center: e.isActive({ textAlign: "center" }), right: e.isActive({ textAlign: "right" }), justify: e.isActive({ textAlign: "justify" }),
      image: e.isActive("image"), imageAlign: e.getAttributes("image").align || "center", table: e.isActive("table"),
      color: e.getAttributes("textStyle").color || "", canUndo: e.can().undo(), canRedo: e.can().redo(),
    } : {}),
  }) || {};

  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const openLink = () => { setHref(editor.getAttributes("link").href || ""); setLinkOpen(true); };
  const applyLink = (ev) => {
    ev.preventDefault();
    const url = href.trim();
    if (!url) c().extendMarkRange("link").unsetLink().run();
    else {
      const full = /^(https?:|mailto:|#|\/)/i.test(url) ? url : `https://${url}`;
      if (editor.state.selection.empty && !s.link) c().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: full } }] }).run();
      else c().extendMarkRange("link").setLink({ href: full }).run();
    }
    setLinkOpen(false);
  };
  // fixed sizes so a picture looks the same in the editor and on the page; null = as wide as it fits
  const imgWidth = (w) => editor.chain().focus().updateAttributes("image", { width: w, height: null }).run();

  return (
    <div className={`rx ${minimal ? "rx-min" : ""}`}>
      <div className="rx-bar" role="toolbar" aria-label="Text formatting">
        <Btn label="↶" title="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => c().undo().run()} />
        <Btn label="↷" title="Redo (Ctrl+Y)" disabled={!s.canRedo} onClick={() => c().redo().run()} />
        <span className="rx-sep" />
        {!minimal && (
          <Pop label={s.h2 ? "Heading" : s.h3 ? "Subheading" : s.h4 ? "Small heading" : "Text"} title="Text style">
            <button type="button" data-close onClick={() => c().setParagraph().run()}>Normal text</button>
            <button type="button" data-close className="rx-m-h2" onClick={() => c().toggleHeading({ level: 2 }).run()}>Heading</button>
            <button type="button" data-close className="rx-m-h3" onClick={() => c().toggleHeading({ level: 3 }).run()}>Subheading</button>
            <button type="button" data-close className="rx-m-h4" onClick={() => c().toggleHeading({ level: 4 }).run()}>Small heading</button>
          </Pop>
        )}
        <Btn label={<b>B</b>} title="Bold (Ctrl+B)" on={s.bold} onClick={() => c().toggleBold().run()} />
        <Btn label={<i>I</i>} title="Italic (Ctrl+I)" on={s.italic} onClick={() => c().toggleItalic().run()} />
        <Btn label={<u>U</u>} title="Underline (Ctrl+U)" on={s.underline} onClick={() => c().toggleUnderline().run()} />
        <Btn label={<s>S</s>} title="Strikethrough" on={s.strike} onClick={() => c().toggleStrike().run()} />
        <Pop label={<span className="rx-a" style={{ borderBottomColor: s.color || "var(--text)" }}>A</span>} title="Text colour and size">
          <div className="rx-menu-h">Colour</div>
          <div className="rx-swatches">
            {COLORS.map(([n, v]) => (
              <button key={n} type="button" data-close title={n} aria-label={n} className="rx-sw" style={{ background: v || "transparent" }}
                onClick={() => (v ? c().setColor(v).run() : c().unsetColor().run())}>{v ? "" : "×"}</button>
            ))}
            <label className="rx-sw rx-custom" title="Any colour"><input type="color" onChange={(e) => c().setColor(e.target.value).run()} />+</label>
          </div>
          <div className="rx-menu-h">Highlight</div>
          <div className="rx-swatches">
            {HIGHLIGHTS.map(([n, v]) => (
              <button key={n} type="button" data-close title={n} aria-label={`Highlight ${n}`} className="rx-sw" style={{ background: v || "transparent" }}
                onClick={() => (v ? c().setHighlight({ color: v }).run() : c().unsetHighlight().run())}>{v ? "" : "×"}</button>
            ))}
          </div>
          <div className="rx-menu-h">Size</div>
          <div className="rx-row">
            {SIZES.map(([n, v]) => <button key={n} type="button" data-close onClick={() => (v ? c().setFontSize(v).run() : c().unsetFontSize().run())}>{n}</button>)}
          </div>
        </Pop>
        <span className="rx-sep" />
        <Btn label="•≡" title="Bulleted list" on={s.bullet} onClick={() => c().toggleBulletList().run()} />
        <Btn label="1≡" title="Numbered list" on={s.ordered} onClick={() => c().toggleOrderedList().run()} />
        {!minimal && <Btn label="❝" title="Quote" on={s.quote} onClick={() => c().toggleBlockquote().run()} />}
        <Pop label={s.center ? "≡c" : s.right ? "≡r" : s.justify ? "≡j" : "≡l"} title="Line up text">
          <button type="button" data-close onClick={() => c().setTextAlign("left").run()}>Line up left</button>
          <button type="button" data-close onClick={() => c().setTextAlign("center").run()}>Centre</button>
          <button type="button" data-close onClick={() => c().setTextAlign("right").run()}>Line up right</button>
          <button type="button" data-close onClick={() => c().setTextAlign("justify").run()}>Justify</button>
        </Pop>
        <span className="rx-sep" />
        <Btn label="🔗" title="Link" on={s.link} onClick={openLink} />
        <Btn label="🖼" title="Add a picture" onClick={() => fileRef.current?.click()} />
        {!minimal && (
          <Pop label="▦" title="Table" on={s.table}>
            {!s.table && <button type="button" data-close onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Insert a table</button>}
            {s.table && (
              <>
                <button type="button" data-close onClick={() => c().addRowAfter().run()}>Add a row below</button>
                <button type="button" data-close onClick={() => c().addColumnAfter().run()}>Add a column to the right</button>
                <button type="button" data-close onClick={() => c().deleteRow().run()}>Delete this row</button>
                <button type="button" data-close onClick={() => c().deleteColumn().run()}>Delete this column</button>
                <button type="button" data-close onClick={() => c().toggleHeaderRow().run()}>Header row on/off</button>
                <button type="button" data-close onClick={() => c().mergeOrSplit().run()}>Merge / split cells</button>
                <button type="button" data-close className="danger" onClick={() => c().deleteTable().run()}>Delete the table</button>
              </>
            )}
          </Pop>
        )}
        {!minimal && <Btn label="―" title="Divider line" onClick={() => c().setHorizontalRule().run()} />}
        <Btn label="⌫" title="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { insertFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {s.image && (
        <div className="rx-bar rx-imgbar" role="toolbar" aria-label="Picture">
          <span className="rx-hint">PICTURE · drag a corner to resize · on the page, text wraps round left and right pictures</span>
          <Btn label="S" title="Small (240 wide)" onClick={() => imgWidth(240)} />
          <Btn label="M" title="Medium (400 wide)" onClick={() => imgWidth(400)} />
          <Btn label="L" title="Large (600 wide)" onClick={() => imgWidth(600)} />
          <Btn label="Full" title="As wide as the text" wide onClick={() => imgWidth(null)} />
          <span className="rx-sep" />
          <Btn label="◧" title="Sit on the left, text wraps round" on={s.imageAlign === "left"} onClick={() => c().updateAttributes("image", { align: "left" }).run()} />
          <Btn label="▣" title="Centre on its own line" on={s.imageAlign === "center"} onClick={() => c().updateAttributes("image", { align: "center" }).run()} />
          <Btn label="◨" title="Sit on the right, text wraps round" on={s.imageAlign === "right"} onClick={() => c().updateAttributes("image", { align: "right" }).run()} />
          <span className="rx-sep" />
          <Btn label="Remove" title="Remove the picture" wide onClick={() => c().deleteSelection().run()} />
        </div>
      )}
      {linkOpen && (
        <form className="rx-bar rx-linkbar" onSubmit={applyLink}>
          <input className="input input-sm" autoFocus placeholder="Paste a web address, or #codex/ranks for a Codex page" value={href} onChange={(e) => setHref(e.target.value)} />
          <button type="submit" className="btn btn-sm">{href.trim() ? "APPLY" : "REMOVE LINK"}</button>
          <button type="button" className="btn btn-sm" onClick={() => setLinkOpen(false)}>CANCEL</button>
        </form>
      )}
      <EditorContent editor={editor} />
      {busy && <div className="rx-busy" role="status">{busy}</div>}
    </div>
  );
}

// Small editor that opens when you click: keeps long forms quick to scroll.
export function RichField({ value, onChange, label, placeholder, minimal }) {
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => plain(value), [value]);
  if (open) return <RichEditor value={value} onChange={onChange} label={label} placeholder={placeholder} minimal={minimal} />;
  return (
    <button type="button" className={`rx-closed ${preview ? "" : "empty"}`} onClick={() => setOpen(true)} aria-label={`Edit ${label || "text"}`}>
      {value ? <Rich value={value} /> : <span>{placeholder || "Click to write…"}</span>}
      <span className="rx-closed-tag">✎ EDIT</span>
    </button>
  );
}
