import { useEffect, useState } from "react";
import { api, fmt } from "../../api";
import { Logo } from "../../components/ui";
import { PrintFrame } from "./Print";

export default function PrivacyReport() {
  const [r, setR] = useState<any>(null);
  const [school, setSchool] = useState("");
  useEffect(() => { api("/api/privacy/report").then(setR); api("/api/public").then((p) => setSchool(p.school_name)); }, []);
  return (
    <PrintFrame ready={!!r} title="InferSmart privacy report">
      {r && (
        <div className="text-[11pt] leading-relaxed">
          <div className="flex items-start justify-between border-b-2 border-[#0F766E] pb-3">
            <div><h1 className="text-2xl font-bold">Privacy and offline report</h1><p className="text-[#475467]">{school}</p></div>
            <div className="text-right"><Logo size={26} /><p className="mt-1 text-sm text-[#475467]">Generated {fmt.dateTime(r.generated)}</p></div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Box label="Outside connections (this session)" value={String(r.watcher.outside_count)} />
            <Box label="Outside connections (all time)" value={String(r.outside_total_all_time)} />
            <Box label="Chats stored on this computer" value="None" />
          </div>
          <p className="mt-3 text-sm">Watched every second since {fmt.dateTime(r.watcher.watching_since)}. The watcher reads the operating system's own list of network connections opened by InferSmart's programs and counts any that go outside this computer or the school's private network. It counts connections, not bytes. Watcher self-tests that caught a deliberate outside connection: {r.watcher.selftest_caught}.</p>
          <h2 className="mt-6 text-lg font-bold">What is stored on this computer</h2>
          <ul className="mt-1 list-disc pl-5">{r.stored.map((x: string) => <li key={x}>{x}</li>)}</ul>
          <h2 className="mt-4 text-lg font-bold">What is not stored or sent</h2>
          <ul className="mt-1 list-disc pl-5">{r.not_stored.map((x: string) => <li key={x}>{x}</li>)}</ul>
          <h2 className="mt-4 text-lg font-bold">Offline checks</h2>
          {r.offline_checks.length ? (
            <table className="mt-2 w-full border-collapse text-sm">
              <thead><tr className="border-b border-[#bbb] text-left"><th className="py-1">Time</th><th>Result</th><th>Internet present</th><th>Detail</th></tr></thead>
              <tbody>{r.offline_checks.map((c: any) => <tr key={c.id} className="border-b border-[#ddd]"><td className="py-1 pr-2">{fmt.dateTime(c.ts)}</td><td>{c.passed ? "Passed" : "Failed"}</td><td>{c.internet ? "Yes" : "No"}</td><td>{c.detail}</td></tr>)}</tbody>
            </table>
          ) : <p>No offline check run yet.</p>}
          {r.privacy_log.length > 0 && <>
            <h2 className="mt-4 text-lg font-bold">Connection log</h2>
            <table className="mt-2 w-full text-sm"><tbody>{r.privacy_log.map((l: any) => <tr key={l.id}><td className="pr-3">{fmt.dateTime(l.ts)}</td><td className="pr-3">{l.kind === "selftest" ? "Self-test (deliberate)" : "Outside connection"}</td><td className="pr-3">{l.process}</td><td>{l.remote}</td></tr>)}</tbody></table>
          </>}
          <h2 className="mt-4 text-lg font-bold">Software versions</h2>
          <p>{Object.entries(r.versions).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
          <p className="mt-6 border-t border-[#ccc] pt-2 text-sm text-[#475467]">{r.note} Students have no accounts or logins. Teachers' templates never ask for student names.</p>
          <div className="mt-10 grid grid-cols-2 gap-10 text-sm"><div className="border-t border-[#999] pt-1">Lab in-charge</div><div className="border-t border-[#999] pt-1">Head of institution</div></div>
        </div>
      )}
    </PrintFrame>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#ccc] p-3"><div className="text-xs font-semibold uppercase text-[#475467]">{label}</div><div className="mt-1 text-3xl font-bold text-[#15803D]">{value}</div></div>;
}
