import { useEffect, useState } from "react";
import { api, fmt } from "../../api";
import { Logo } from "../../components/ui";
import { SummaryView } from "../admin/Pages";
import { PrintFrame } from "./Print";

export default function SummaryPrint() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api("/api/summary").then(setS); }, []);
  return (
    <PrintFrame ready={!!s} title="InferSmart headmaster summary">
      {s && (
        <div>
          <div className="mb-5 flex items-start justify-between border-b-2 border-[#0F766E] pb-3">
            <div><h1 className="text-2xl font-bold">Summary for the headmaster</h1><p className="text-[#475467]">{s.school_name} · week of {fmt.date(Date.now() / 1000 - 6 * 86400)}</p></div>
            <Logo size={26} />
          </div>
          <SummaryView s={s} />
          <p className="mt-5 text-sm text-[#475467]">InferSmart is free, open-source software running on the school's own computer. It needs no internet and no subscription. It supports teachers; it does not replace them.</p>
        </div>
      )}
    </PrintFrame>
  );
}
