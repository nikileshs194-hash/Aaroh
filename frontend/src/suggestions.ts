import { Atom, BookOpen, Calculator, Cpu, FlaskConical, Globe2, Landmark, Leaf, Lightbulb, Sigma, Sun, type LucideIcon } from "lucide-react";

/** Suggested questions under the question box. A fresh, varied set of four is drawn for every new chat. */
export type Suggestion = { subject: string; icon: LucideIcon; label: string; q: string };

const EN: Suggestion[] = [
  { subject: "biology", icon: Leaf, label: "Explain photosynthesis", q: "What is photosynthesis? Explain simply." },
  { subject: "biology", icon: Leaf, label: "How does the heart pump blood?", q: "How does the human heart pump blood around the body?" },
  { subject: "biology", icon: Leaf, label: "What do red blood cells do?", q: "What is the job of red blood cells?" },
  { subject: "biology", icon: Leaf, label: "Why do we need to sleep?", q: "Why does our body need sleep?" },
  { subject: "biology", icon: Leaf, label: "Plant cell vs animal cell", q: "What are the differences between a plant cell and an animal cell?" },
  { subject: "physics", icon: Atom, label: "Newton's three laws", q: "Explain Newton's three laws of motion with everyday examples." },
  { subject: "physics", icon: Atom, label: "Why is the sky blue?", q: "Why is the sky blue?" },
  { subject: "physics", icon: Atom, label: "How does a rainbow form?", q: "How does a rainbow form?" },
  { subject: "physics", icon: Atom, label: "What is Ohm's law?", q: "What is Ohm's law? Give a simple example." },
  { subject: "physics", icon: Atom, label: "How do magnets work?", q: "How do magnets work?" },
  { subject: "chemistry", icon: FlaskConical, label: "Acids, bases and salts", q: "What are acids, bases and salts? Give examples from daily life." },
  { subject: "chemistry", icon: FlaskConical, label: "Why does iron rust?", q: "Why does iron rust, and how can we stop it?" },
  { subject: "chemistry", icon: FlaskConical, label: "Balance a chemical equation", q: "How do I balance a chemical equation? Show one example step by step." },
  { subject: "chemistry", icon: FlaskConical, label: "What is the pH scale?", q: "What is the pH scale?" },
  { subject: "maths", icon: Calculator, label: "Practice fractions", q: "Give me 3 practice questions on fractions." },
  { subject: "maths", icon: Sigma, label: "Solve a quadratic equation", q: "Explain the steps to solve a quadratic equation using the formula." },
  { subject: "maths", icon: Sigma, label: "Pythagoras theorem", q: "What is the Pythagoras theorem? Show a worked example." },
  { subject: "maths", icon: Calculator, label: "Find a percentage", q: "How do I find 15% of 240? Explain the method." },
  { subject: "maths", icon: Calculator, label: "What is a prime number?", q: "What is a prime number? List the primes below 30." },
  { subject: "maths", icon: Sigma, label: "Area of a circle", q: "How do I find the area of a circle? Give an example." },
  { subject: "geography", icon: Sun, label: "Why do we have seasons?", q: "Why do we have seasons?" },
  { subject: "geography", icon: Globe2, label: "What causes the monsoon?", q: "What causes the monsoon in India?" },
  { subject: "geography", icon: Globe2, label: "Types of soil in India", q: "What are the main types of soil in India?" },
  { subject: "geography", icon: Globe2, label: "How do volcanoes erupt?", q: "How do volcanoes erupt?" },
  { subject: "history", icon: Landmark, label: "The Indian freedom struggle", q: "Give a short overview of India's freedom struggle." },
  { subject: "history", icon: Landmark, label: "Who was Ashoka?", q: "Who was Emperor Ashoka and why is he important?" },
  { subject: "civics", icon: Landmark, label: "What is democracy?", q: "What is democracy? Explain with the example of India." },
  { subject: "civics", icon: Landmark, label: "Fundamental Rights", q: "What are the Fundamental Rights in the Indian Constitution?" },
  { subject: "computers", icon: Cpu, label: "What is AI?", q: "What is artificial intelligence?" },
  { subject: "computers", icon: Cpu, label: "How does the internet work?", q: "How does the internet work, in simple words?" },
  { subject: "computers", icon: Cpu, label: "What is an algorithm?", q: "What is an algorithm? Give an everyday example." },
  { subject: "english", icon: BookOpen, label: "Active and passive voice", q: "Explain active and passive voice with examples." },
  { subject: "english", icon: BookOpen, label: "Write a short paragraph", q: "Help me write a short paragraph about my favourite festival." },
  { subject: "study", icon: Lightbulb, label: "Tips to remember better", q: "Give me tips to remember what I study." },
  { subject: "study", icon: Lightbulb, label: "Plan my exam revision", q: "Help me make a simple revision plan for my exams." },
];

const KN: Suggestion[] = [
  { subject: "biology", icon: Leaf, label: "ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಎಂದರೇನು?", q: "ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಎಂದರೇನು? ಸರಳವಾಗಿ ವಿವರಿಸಿ." },
  { subject: "biology", icon: Leaf, label: "ಹೃದಯ ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ?", q: "ಮಾನವನ ಹೃದಯ ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ?" },
  { subject: "biology", icon: Leaf, label: "ನಮಗೆ ನಿದ್ರೆ ಏಕೆ ಬೇಕು?", q: "ನಮ್ಮ ದೇಹಕ್ಕೆ ನಿದ್ರೆ ಏಕೆ ಬೇಕು?" },
  { subject: "physics", icon: Atom, label: "ಆಕಾಶ ನೀಲಿ ಏಕೆ?", q: "ಆಕಾಶ ನೀಲಿ ಬಣ್ಣದಲ್ಲಿ ಏಕೆ ಕಾಣುತ್ತದೆ?" },
  { subject: "physics", icon: Atom, label: "ಕಾಮನಬಿಲ್ಲು ಹೇಗೆ ಉಂಟಾಗುತ್ತದೆ?", q: "ಕಾಮನಬಿಲ್ಲು ಹೇಗೆ ಉಂಟಾಗುತ್ತದೆ?" },
  { subject: "physics", icon: Atom, label: "ನ್ಯೂಟನ್‌ನ ಚಲನೆಯ ನಿಯಮಗಳು", q: "ನ್ಯೂಟನ್‌ನ ಮೂರು ಚಲನೆಯ ನಿಯಮಗಳನ್ನು ಉದಾಹರಣೆಗಳೊಂದಿಗೆ ವಿವರಿಸಿ." },
  { subject: "chemistry", icon: FlaskConical, label: "ಕಬ್ಬಿಣ ತುಕ್ಕು ಹಿಡಿಯುವುದು ಏಕೆ?", q: "ಕಬ್ಬಿಣ ತುಕ್ಕು ಹಿಡಿಯುವುದು ಏಕೆ?" },
  { subject: "chemistry", icon: FlaskConical, label: "ಆಮ್ಲ ಮತ್ತು ಪ್ರತ್ಯಾಮ್ಲ", q: "ಆಮ್ಲಗಳು ಮತ್ತು ಪ್ರತ್ಯಾಮ್ಲಗಳು ಎಂದರೇನು? ಉದಾಹರಣೆ ಕೊಡಿ." },
  { subject: "maths", icon: Calculator, label: "ಭಿನ್ನರಾಶಿ ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳು", q: "ಭಿನ್ನರಾಶಿಗಳ ಬಗ್ಗೆ 3 ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೊಡಿ." },
  { subject: "maths", icon: Sigma, label: "ಪೈಥಾಗೊರಸ್ ಪ್ರಮೇಯ", q: "ಪೈಥಾಗೊರಸ್ ಪ್ರಮೇಯ ಎಂದರೇನು? ಒಂದು ಉದಾಹರಣೆ ಕೊಡಿ." },
  { subject: "maths", icon: Calculator, label: "ಅವಿಭಾಜ್ಯ ಸಂಖ್ಯೆ ಎಂದರೇನು?", q: "ಅವಿಭಾಜ್ಯ ಸಂಖ್ಯೆ ಎಂದರೇನು?" },
  { subject: "geography", icon: Sun, label: "ಋತುಗಳು ಏಕೆ ಬದಲಾಗುತ್ತವೆ?", q: "ಋತುಗಳು ಏಕೆ ಬದಲಾಗುತ್ತವೆ?" },
  { subject: "geography", icon: Globe2, label: "ಮುಂಗಾರು ಮಳೆ ಹೇಗೆ ಬರುತ್ತದೆ?", q: "ಭಾರತದಲ್ಲಿ ಮುಂಗಾರು ಮಳೆ ಹೇಗೆ ಬರುತ್ತದೆ?" },
  { subject: "civics", icon: Landmark, label: "ಪ್ರಜಾಪ್ರಭುತ್ವ ಎಂದರೇನು?", q: "ಪ್ರಜಾಪ್ರಭುತ್ವ ಎಂದರೇನು?" },
  { subject: "computers", icon: Cpu, label: "ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆ ಎಂದರೇನು?", q: "ಕೃತಕ ಬುದ್ಧಿಮತ್ತೆ ಎಂದರೇನು?" },
  { subject: "study", icon: Lightbulb, label: "ಓದಿದ್ದು ನೆನಪಿಡುವುದು ಹೇಗೆ?", q: "ಓದಿದ್ದನ್ನು ಚೆನ್ನಾಗಿ ನೆನಪಿಡಲು ಸಲಹೆಗಳನ್ನು ಕೊಡಿ." },
];

/** Four random suggestions, each from a different subject. */
export function pickSuggestions(lang: string, n = 4): Suggestion[] {
  const pool = [...(lang === "kn" ? KN : EN)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: Suggestion[] = [], seen = new Set<string>();
  for (const s of pool) {
    if (seen.has(s.subject)) continue;
    seen.add(s.subject);
    out.push(s);
    if (out.length === n) break;
  }
  return out;
}
