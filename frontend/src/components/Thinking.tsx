import { useEffect, useMemo, useState } from "react";

/** Shown the moment a question is sent, until the first word of the answer arrives.
 *  Friendly words change every ~1.6 s in a random order; real steps from the server ("textbooks", "found")
 *  are shown when they actually happen. */
const WORDS = [
  "Thinking", "Reading your question", "Pondering", "Connecting the dots", "Checking the facts",
  "Working it out", "Gathering ideas", "Recalling what I know", "Deliberating", "Putting it together",
  "Organising my thoughts", "Choosing the right words", "Weighing it up", "Making it simple",
];
const STAGE: Record<string, string> = {
  textbooks: "Looking through your textbooks",
  found: "Found something useful in your textbooks",
};

function shuffled(): string[] {
  const a = [...WORDS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const t = a.indexOf("Thinking");           // always open with a plain "Thinking"
  if (t > 0) [a[0], a[t]] = [a[t], a[0]];
  return a;
}

export function Thinking({ stage }: { stage?: string }) {
  const order = useMemo(shuffled, []);
  const [i, setI] = useState(0);
  const [shownStage, setShownStage] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setI((n) => n + 1), 1600);
    return () => window.clearInterval(id);
  }, []);
  // A real step is shown for a moment when it happens, then the friendly words continue.
  useEffect(() => {
    if (stage && STAGE[stage]) {
      setShownStage(STAGE[stage]);
      const id = window.setTimeout(() => setShownStage(null), 1800);
      return () => window.clearTimeout(id);
    }
  }, [stage]);

  const text = shownStage || order[i % order.length];
  return (
    <div className="flex items-center gap-2.5 py-0.5" role="status" aria-live="polite">
      <span className="thinking-mark" aria-hidden="true"><i /><i /><i /></span>
      <span key={text} className="thinking-text">{text}…</span>
    </div>
  );
}
