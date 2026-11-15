import { useEffect, useRef } from "react";
import logo from "../assets/41st_logo.png";
import { PORTAL_LINKS } from "../portal.js";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// A title that can be shown in Aurebesh. Each letter is its own span so the
// animation can switch letters one at a time. Screen readers get the plain text.
function Aur({ text }) {
  const start = reduceMotion() ? "al" : "al aur";
  return (
    <span data-aur="">
      <span className="lp-sr">{text}</span>
      <span aria-hidden="true">
        {text.split(/(\s+)/).map((part, w) =>
          /^\s+$/.test(part) ? part : (
            <span key={w} className="aw">
              {[...part].map((ch, i) => <span key={i} className={start}>{ch}</span>)}
            </span>
          )
        )}
      </span>
    </span>
  );
}

// Titles load in Aurebesh, translate to English letter by letter, then
// now and then glitch back and translate again. Codex does it most often.
function useAurebesh(rootRef) {
  useEffect(() => {
    if (reduceMotion()) return;
    const root = rootRef.current;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const titles = [...root.querySelectorAll("[data-aur]")].map((el) => ({
      el,
      letters: [...el.querySelectorAll(".al")],
      big: !!el.closest("h1, h2"),
      locked: !!el.closest(".lp-card.soon h2"),
      busy: false,
    }));

    // keep each letter at its English width so switching fonts doesn't move anything
    const lockWidths = () => titles.forEach((t) => t.letters.forEach((s) => {
      const was = s.classList.contains("aur");
      s.style.width = ""; s.classList.remove("aur");
      s.style.width = `${s.getBoundingClientRect().width}px`;
      if (was) s.classList.add("aur");
    }));

    const translate = (t, delay) => {
      t.busy = true;
      let left = t.letters.length;
      t.letters.forEach((s, i) => {
        const flips = 2 + Math.floor(Math.random() * 3);
        const at = delay + i * 45;
        for (let k = 0; k < flips; k++) later(() => s.classList.toggle("aur"), at + k * 70);
        later(() => { s.classList.remove("aur"); if (--left === 0) t.busy = false; }, at + flips * 70 + 40);
      });
    };
    const flicker = (t) => {
      if (!t || t.busy) return;
      t.letters.forEach((s) => s.classList.add("aur"));
      translate(t, 160);
    };

    let stopped = false;
    const onResize = () => { if (!titles.some((t) => t.busy)) lockWidths(); };
    const fonts = document.fonts?.load
      ? Promise.all(["500 16px Orbitron", "700 16px Orbitron", "900 16px Orbitron", "16px Aurebesh"].map((f) => document.fonts.load(f)))
      : Promise.resolve();
    const begin = () => {
      if (stopped) return;
      lockWidths();
      titles.forEach((t, i) => translate(t, 500 + i * 110));
      const loop = () => {
        const big = titles.filter((t) => t.big);
        const pool = Math.random() < 0.45 ? titles.filter((t) => t.locked) : titles;
        const from = pool.length ? pool : big;
        flicker(from[Math.floor(Math.random() * from.length)]);
        later(loop, 1800 + Math.random() * 2200);
      };
      later(loop, 500 + titles.length * 110 + 2400);
      window.addEventListener("resize", onResize);
    };
    fonts.then(begin, begin);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      titles.forEach((t) => t.letters.forEach((s) => s.classList.remove("aur")));
    };
  }, [rootRef]);
}

export default function Landing({ me, onStaffSignIn }) {
  const rootRef = useRef(null);
  useAurebesh(rootRef);
  return (
    <div className="lp" ref={rootRef}>
      <header className="topbar">
        <div className="topbar-inner">
          <img src={logo} alt="41st emblem" width="40" height="40" style={{ objectFit: "contain" }} />
          <div className="lp-brand">
            <b><Aur text="41ST ELITE CORPS" /></b>
            <span>UNIT PORTAL</span>
          </div>
          <div style={{ flex: "1 1 auto" }} />
          {me
            ? <a className="btn btn-sm" href="#orbat">CONSOLE · {me.username}</a>
            : <button type="button" className="btn btn-sm" onClick={onStaffSignIn}>STAFF SIGN IN</button>}
        </div>
      </header>

      <section className="lp-hero">
        <div className="scan" aria-hidden="true" />
        <div className="lp-wrap lp-hero-inner">
          <div className="holo">
            <div className="lp-corner">GAR // COMNET NODE 41-E · SECURE CHANNEL</div>
            <h1 className="lp-h1"><Aur text="41ST ELITE CORPS" /></h1>
            <div className="lp-sub"><Aur text="UNIT PORTAL" /></div>
            <p className="lp-lede">Everything the 41st runs on, in one place. Check the order of battle, look up a trooper, or open the unit's reference library.</p>
          </div>
          <div className="lp-emblem holo" aria-hidden="true">
            <svg className="sweep-rev" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r="124" fill="none" stroke="#2f7a4f" strokeWidth="1" strokeDasharray="2 6" />
              <circle cx="130" cy="130" r="112" fill="none" stroke="#5fd38a" strokeWidth="2" strokeDasharray="60 24 8 24" />
            </svg>
            <svg className="sweep" viewBox="0 0 260 260">
              <path d="M130 130 L130 18 A112 112 0 0 1 224 72 Z" fill="#5fd38a" opacity="0.14" />
              <line x1="130" y1="130" x2="130" y2="18" stroke="#a8f0c8" strokeWidth="1.5" />
            </svg>
            <img src={logo} alt="" />
          </div>
        </div>
      </section>

      <main className="lp-wrap lp-terminals">
        <div className="lp-label"><Aur text="SELECT TERMINAL" /></div>
        <div className="lp-grid">
          {PORTAL_LINKS.map((link) => {
            const live = link.status === "live";
            return (
              <article key={link.key} className={`lp-card holo ${live ? "live" : "soon"}`} aria-labelledby={`lp-${link.key}`}>
                <div className="lp-card-head">
                  <span className="lp-term">{link.terminal}</span>
                  <span className={`lp-status ${live ? "on" : "dev"}`}>{live ? "ONLINE" : "IN DEVELOPMENT"}</span>
                </div>
                <h2 id={`lp-${link.key}`}><Aur text={link.title} /></h2>
                <p>{link.blurb}</p>
                {link.inside?.length > 0 && (
                  <ul className="lp-inside">
                    {link.inside.map(([name, desc]) => (
                      <li key={name}><b><Aur text={name} /></b><span>{desc}</span></li>
                    ))}
                  </ul>
                )}
                <div className="lp-card-foot">
                  <span className="lp-foot-note">{link.foot}</span>
                  {live
                    ? <a className="btn btn-primary" href={link.href}>{link.cta} <span aria-hidden="true">›</span></a>
                    : <span className="btn lp-locked" role="link" aria-disabled="true">COMING SOON</span>}
                </div>
              </article>
            );
          })}
        </div>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <span>41ST ELITE CORPS · GRAND ARMY OF THE REPUBLIC</span>
        </div>
      </footer>
    </div>
  );
}
