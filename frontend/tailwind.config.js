/** Design tokens from dossier C4, as CSS variables so light, dark and high-contrast share one system. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        sunken: "rgb(var(--sunken) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        teacher: "rgb(var(--teacher) / <alpha-value>)",
        "teacher-soft": "rgb(var(--teacher-soft) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Kannada", "Noto Sans Devanagari", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "12px", ctl: "8px" },
      boxShadow: { float: "0 8px 24px -8px rgb(11 27 51 / 0.18), 0 2px 6px -2px rgb(11 27 51 / 0.08)" },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
  },
  plugins: [],
};
