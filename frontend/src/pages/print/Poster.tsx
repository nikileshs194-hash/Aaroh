import { useEffect, useState } from "react";
import { api } from "../../api";
import { Logo } from "../../components/ui";
import QR from "../../components/QR";
import { PrintFrame } from "./Print";

export default function Poster() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api("/api/share").then(setS); }, []);
  return (
    <PrintFrame ready={!!s} title="Aaroh lab poster">
      {s && (
        <div className="flex min-h-[250mm] flex-col items-center text-center">
          <Logo size={56} />
          <p className="mt-2 text-lg text-[#475467]">{s.school_name}</p>
          <h1 className="mt-10 text-5xl font-bold leading-tight text-[#0B1B33]">Ask Aaroh</h1>
          <p className="mt-3 text-3xl" lang="kn">ಪ್ರಶ್ನೆ ಕೇಳಿ</p>
          <div className="mt-10"><QR text={s.url} size={300} className="border-4 border-[#0F766E] p-3" /></div>
          <ol className="mt-10 space-y-3 text-left text-xl">
            <li><b>1.</b> Connect to the Wi-Fi: <b>{s.wifi_name}</b></li>
            <li><b>2.</b> Scan the code with your phone camera, or type:</li>
          </ol>
          <p className="mt-3 rounded-2xl border-2 border-[#0F766E] px-6 py-3 font-mono text-4xl font-bold text-[#0F766E]">{s.url.replace("http://", "")}</p>
          <div className="mt-auto pt-10 text-base text-[#475467]">
            <p>Private AI running on this school's computer. Works without internet. Your chat stays on your device.</p>
            <p className="mt-1 font-semibold">AI can make mistakes. Check important answers with your teacher.</p>
          </div>
        </div>
      )}
    </PrintFrame>
  );
}
