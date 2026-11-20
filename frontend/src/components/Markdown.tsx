import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** AI answers: headings, bold, lists, tables, code and maths formulas (KaTeX, bundled, works offline).
 *  Raw HTML from the model is never rendered. */
function normalise(text: string): string {
  return text
    .replace(/\r/g, "")
    // \[ ... \] and \( ... \) are common LaTeX delimiters; the maths plug-in understands $$ ... $$ and $ ... $
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`)
    // a display formula written on one line ("$$ E = mc^2 $$") gets its own lines so it is centred
    .replace(/^\s*\$\$([^\n]+?)\$\$\s*$/gm, (_, m) => `$$\n${m.trim()}\n$$`)
    // bullets written as "•" become normal list items
    .replace(/^(\s*)•\s+/gm, "$1- ");
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`prose-plan ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore", output: "html" }]]}
        components={{
          a: ({ children }) => <span className="underline decoration-dotted">{children}</span>,  // no outside links offline
          table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
        }}
      >
        {normalise(text)}
      </ReactMarkdown>
    </div>
  );
}
