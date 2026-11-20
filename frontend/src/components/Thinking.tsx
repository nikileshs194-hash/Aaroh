import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

/** Shown while waiting for the first word of an answer, as a growing list of steps:
 *    ✓ Thinking
 *    ✓ Recalling what I know
 *    • Putting it together…   (current step, shimmering)
 *  Nothing appears if the answer starts within ~0.3 s. Real server steps are mapped to neutral words, and the
 *  remaining words come in a random order, so it is different every time. */
const FIRST = "Reading your question";          // always the second step, right after "Thinking"
const WORDS = [
  "Recalling what I know", "Gathering ideas", "Connecting the dots", "Checking the facts",
  "Working it out", "Weighing it up", "Putting it together", "Organising my thoughts", "Choosing the right words",
  "Making it simple", "Deliberating",
];
const STAGE: Record<string, string> = { textbooks: "Reading your question", found: "Gathering ideas" };
const STEP_MS = 1700;
const SHOW_AFTER_MS = 300;
const VISIBLE = 4;

function shuffled(): string[] {
  const a = [...WORDS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Thinking({ stage }: { stage?: string }) {
  const pool = useMemo(shuffled, []);
  const next = useRef(0);
  const [steps, setSteps] = useState<string[]>(["Thinking"]);
  const [visible, setVisible] = useState(false);

  const push = (word: string) => setSteps((s) => (s.includes(word) ? s : [...s, word]));

  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const id = window.setInterval(() => {
      setSteps((s) => {
        if (!s.includes(FIRST)) return [...s, FIRST];
        let w = pool[next.current % pool.length];
        for (let tries = 0; s.includes(w) && tries < pool.length; tries++) { next.current++; w = pool[next.current % pool.length]; }
        next.current++;
        return s.includes(w) ? s : [...s, w];
      });
    }, STEP_MS);
    return () => { window.clearTimeout(show); window.clearInterval(id); };
  }, []);
  useEffect(() => { if (stage && STAGE[stage]) push(STAGE[stage]); }, [stage]);

  if (!visible) return <span className="sr-only">Thinking</span>;
  const shown = steps.slice(-VISIBLE);
  return (
    <ol className="thinking-steps" role="status" aria-live="polite">
      {shown.map((w, i) => {
        const current = i === shown.length - 1;
        return (
          <li key={w} className={current ? "is-current" : "is-done"}>
            {current ? <span className="thinking-mark" aria-hidden="true"><i /><i /><i /></span>
              : <Check size={14} className="text-accent" aria-hidden="true" />}
            <span className={current ? "thinking-text" : ""}>{w}{current ? "…" : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
