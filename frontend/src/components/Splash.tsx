import { useEffect, useState } from "react";
import wordmark from "../assets/aaroh-wordmark.png";
import { safeGet, safeSet } from "../api";

/** Opening animation of the AAROH wordmark (follows the brand video, logo only, about 7 s):
 *  quiet start -> logo fades in from a soft blur -> a shine sweeps across the letters -> a light streak runs along
 *  the swoosh and under the word, ending in a sparkle -> hold -> fade into the page.
 *  Shown once per browser tab; a click or key press skips it. */
const TOTAL_MS = 7000;
const ss = typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
const KEY = "aaroh_splash_seen";

export function Splash() {
  const [show, setShow] = useState(() => !safeGet(ss, KEY));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    safeSet(ss, KEY, "1");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const total = reduce ? 1500 : TOTAL_MS;
    const out = window.setTimeout(() => setLeaving(true), total - 650);
    const done = window.setTimeout(() => setShow(false), total);
    const skip = () => { setLeaving(true); window.setTimeout(() => setShow(false), 450); };
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      window.clearTimeout(out); window.clearTimeout(done);
      window.removeEventListener("keydown", skip); window.removeEventListener("pointerdown", skip);
    };
  }, [show]);

  if (!show) return null;
  return (
    <div className={`splash ${leaving ? "is-leaving" : ""}`} role="img" aria-label="Aaroh">
      <div className="splash-stage">
        <img src={wordmark} alt="" className="splash-logo" draggable={false} />
        {/* shine across the letters only: the logo itself is the mask */}
        <span className="splash-glint" style={{ WebkitMaskImage: `url(${wordmark})`, maskImage: `url(${wordmark})` }} aria-hidden="true" />
        {/* light streak along the swoosh and under the word */}
        <svg className="splash-streak" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="streakGrad" x1="0" x2="1">
              <stop offset="0" stopColor="#1f7a6d" stopOpacity="0" />
              <stop offset="0.45" stopColor="#2fa391" stopOpacity="0.85" />
              <stop offset="0.8" stopColor="#7fdccb" stopOpacity="1" />
              <stop offset="1" stopColor="#e9fffa" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M40 200 C 260 70, 520 40, 700 120 S 930 210, 990 150" fill="none" stroke="url(#streakGrad)" strokeWidth="7" strokeLinecap="round" />
        </svg>
        <span className="splash-spark" aria-hidden="true" />
        <span className="splash-shadow" aria-hidden="true" />
      </div>
    </div>
  );
}
