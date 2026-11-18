import { useEffect, type ReactNode } from "react";
import { Printer, X } from "lucide-react";
import { Logo } from "../../components/ui";

/** Shared frame for printable pages: light theme, A4 width, a print bar that does not print. */
export function PrintFrame({ children, ready = true, title }: { children: ReactNode; ready?: boolean; title: string }) {
  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
    document.title = title;
    return () => { document.documentElement.dataset.theme = prev; document.title = "InferSmart"; };
  }, []);
  return (
    <div className="min-h-[100dvh] bg-sunken print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <Logo size={24} />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={!ready} onClick={() => window.print()}><Printer size={18} />Print / save as PDF</button>
          <button className="btn-ghost" onClick={() => window.close()} aria-label="Close"><X size={20} /></button>
        </div>
      </div>
      <div className="mx-auto my-6 max-w-[210mm] bg-white p-[14mm] text-[#0E1726] shadow-float print:my-0 print:max-w-none print:p-0 print:shadow-none">{children}</div>
    </div>
  );
}
