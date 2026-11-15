import { useEffect, useRef } from "react";

// A modal panel: Escape or a click outside closes it.
export default function Dialog({ title, onClose, children, wide }) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    box.current?.querySelector("input, button")?.focus();
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); prev?.focus?.(); };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`dialog panel stack${wide ? " dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h2">{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose}>CLOSE</button>
        </div>
        {children}
      </div>
    </div>
  );
}
