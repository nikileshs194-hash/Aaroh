import { useEffect, useRef } from "react";

/** Light dot-grid background behind the chat. Dots near the pointer swell and are pushed outward in a soft
 *  ripple, then ease back. Idle when the pointer is still (no animation loop), and static if the device asks
 *  for reduced motion. */
const GAP = 22;          // distance between dots (px)
const R = 1.1;           // dot radius at rest
const REACH = 130;       // how far the wave reaches from the pointer
const PUSH = 9;          // how far dots move at the centre of the wave

export function DotField({ className = "" }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const host = cv.parentElement!;
    const g = cv.getContext("2d")!;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.classList.contains("reduce-motion");
    let w = 0, h = 0, dpr = 1, raf = 0, phase = 0;
    let px = -9999, py = -9999, energy = 0;     // pointer position and wave strength (0..1)
    let tx = -9999, ty = -9999;                 // smoothed pointer

    const colors = () => {
      const css = getComputedStyle(document.documentElement);
      const tri = (v: string, fb: string) => (css.getPropertyValue(v).trim() || fb).split(/\s+/).join(",");
      return { dot: `rgba(${tri("--muted", "102 112 133")},0.28)`, hot: `rgba(${tri("--accent", "15 118 110")},0.55)` };
    };
    let col = colors();

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = host.clientWidth; h = host.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      draw();
    };

    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) {
          let dx = x - tx, dy = y - ty;
          const d = Math.hypot(dx, dy);
          if (energy > 0.01 && d < REACH) {
            const f = (1 - d / REACH);                          // 1 at the pointer, 0 at the edge
            const wave = Math.sin(d / 14 - phase) * 0.5 + 0.5;  // travelling ripple
            const k = f * f * energy;
            const m = (PUSH * k * (0.6 + 0.4 * wave)) / (d || 1);
            g.fillStyle = k > 0.15 ? col.hot : col.dot;
            g.globalAlpha = 0.55 + 0.45 * Math.min(1, k * 1.6);
            g.beginPath();
            g.arc(x + dx * m, y + dy * m, R + 1.6 * k * wave, 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
          } else {
            g.fillStyle = col.dot;
            g.fillRect(x - R, y - R, R * 2, R * 2);
          }
        }
      }
    };

    const tick = () => {
      tx += (px - tx) * 0.25; ty += (py - ty) * 0.25;
      phase += 0.18;
      energy *= 0.965;                                       // the wave fades when the pointer rests
      draw();
      raf = energy > 0.01 ? requestAnimationFrame(tick) : 0;
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top;
      if (tx < -999) { tx = px; ty = py; }
      if (still) return;
      energy = 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { px = py = -9999; };
    const onTheme = () => { col = colors(); draw(); };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    resize();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect();
      host.removeEventListener("pointermove", onMove); host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`} />;
}
