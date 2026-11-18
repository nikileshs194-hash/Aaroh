import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmt } from "../../api";
import { Markdown } from "../../components/ui";
import { langName } from "../../i18n";
import { PrintFrame } from "./Print";

/** Submission format: school header, class, subject, chapter, date, teacher and review fields (F12). */
export default function ItemPrint() {
  const { id } = useParams();
  const [it, setIt] = useState<any>(null);
  const [school, setSchool] = useState("");
  useEffect(() => { api(`/api/library/${id}`).then(setIt); api("/api/public").then((p) => setSchool(p.school_name)); }, [id]);
  const f = it?.fields || {};
  const kind: Record<string, string> = { lesson_plan: "LESSON PLAN", quiz: "QUIZ", worksheet: "WORKSHEET", explain: "EXPLANATION", translate: "TRANSLATION" };
  return (
    <PrintFrame ready={!!it} title={it?.title || "InferSmart"}>
      {it && (
        <div className="text-[11.5pt]">
          <div className="border-b-2 border-[#0B1B33] pb-2 text-center">
            <div className="text-xl font-bold uppercase tracking-wide">{school}</div>
            <div className="mt-0.5 text-sm font-semibold tracking-widest text-[#475467]">{kind[it.template] || ""}</div>
          </div>
          <table className="mt-3 w-full border-collapse text-sm">
            <tbody>
              <tr>
                <Cell k="Class" v={f.class} /><Cell k="Subject" v={f.subject} /><Cell k="Date" v={fmt.date(it.updated)} />
              </tr>
              <tr>
                <Cell k={it.template === "explain" ? "Topic" : "Chapter"} v={f.chapter || f.topic} /><Cell k={f.duration ? "Period" : "Language"} v={f.duration ? `${f.duration} minutes` : langName(it.language)} /><Cell k="Teacher" v={it.author} />
              </tr>
            </tbody>
          </table>
          <div className="mt-4" lang={it.language}><Markdown text={it.body} /></div>
          <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
            <div className="border-t border-[#999] pt-1">Teacher's signature</div>
            <div className="border-t border-[#999] pt-1">Checked by (Head of institution)</div>
          </div>
          <p className="mt-6 text-center text-[9pt] text-[#667085]">
            Prepared with InferSmart on the school computer · {it.reviewed ? "Reviewed by the teacher" : "Draft: not yet reviewed by the teacher"}
          </p>
        </div>
      )}
    </PrintFrame>
  );
}

function Cell({ k, v }: { k: string; v?: string }) {
  return <td className="border border-[#bbb] px-2 py-1.5"><span className="text-[#475467]">{k}: </span><b>{v || "–"}</b></td>;
}
