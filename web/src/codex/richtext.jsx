import { createContext } from "react";
import DOMPurify from "dompurify";

// Rich text for the Codex. Text from the sheet is plain (line breaks kept);
// text written in the editor is HTML. Both show through <Rich>.

const HTML_RE = /<\/?(p|br|b|strong|i|em|u|s|h[1-6]|ul|ol|li|a|img|span|div|table|thead|tbody|tr|td|th|blockquote|hr|mark|figure)\b[^>]*>/i;
export const isHtml = (s) => typeof s === "string" && HTML_RE.test(s);

let hooked = false;
export function sanitize(html) {
  if (!hooked) {
    hooked = true;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName !== "A") return;
      const href = node.getAttribute("href") || "";
      if (/^(#|\/)/.test(href)) node.removeAttribute("target");
      else { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
    });
  }
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "data-align", "colspan", "rowspan", "colwidth"],
    FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button", "textarea", "select", "object", "embed"],
  });
}

// Plain text of a value, for search, labels and the short previews in the editor.
export function plain(s) {
  if (s == null) return "";
  if (!isHtml(s)) return String(s);
  const d = document.createElement("div");
  d.innerHTML = sanitize(String(s).replace(/<\/(p|h[1-6]|li|tr|blockquote)>/gi, "$&\n").replace(/<br\s*\/?>/gi, "\n"));
  return (d.textContent || "").replace(/\n{2,}/g, "\n").trim();
}

// Shows sheet text (keeping line breaks) or editor HTML.
export function Rich({ children, value, as: Tag = "span", className = "" }) {
  const v = value !== undefined ? value : children;
  if (isHtml(v)) return <div className={`cx-rich ${className}`} dangerouslySetInnerHTML={{ __html: sanitize(v) }} />;
  return <Tag className={`cx-pre ${className}`}>{v}</Tag>;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// sheet text → editor HTML: one paragraph per line
export function toHtml(v) {
  if (!v) return "";
  if (isHtml(v)) return v;
  return String(v).split("\n").map((l) => `<p>${esc(l)}</p>`).join("");
}


// Turns a stored picture name or address into something an <img> can show.
export const ImgCtx = createContext((v) => v);
