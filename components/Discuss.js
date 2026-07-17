"use client";
import { useState, useEffect, useRef } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";

// 复用的「追问/争论」组件:对某道题和 AI 讨论,结束时提炼进掌握度(含跨知识点)、并在有理时改分。
export default function Discuss({ questionId, attemptId, userAnswer, onApplied }) {
  const t = useT();
  const aiFetch = useAiFetch();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [gmode, setGmode] = useState("discuss"); // discuss | socratic
  const historyRef = useRef([]); useEffect(() => { historyRef.current = history; }, [history]);
  const recordedRef = useRef(false);
  // 任何方式离开(切走/换题/关页)都把这段讨论沉淀进掌握度——用 sendBeacon,可靠且不阻塞导航;只记一次。
  useEffect(() => () => {
    if (recordedRef.current) return;
    const h = historyRef.current || [];
    if (h.length < 2) return;
    recordedRef.current = true;
    try { navigator.sendBeacon("/api/questions/discuss/finalize", new Blob([JSON.stringify({ questionId, attemptId, history: h })], { type: "application/json" })); } catch {}
  }, []); // eslint-disable-line
  async function askSocraticOpening() {
    setBusy(true);
    try {
      const d = await aiFetch("/api/questions/discuss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, userAnswer: userAnswer || "", history: [], mode: "socratic" }) });
      setHistory([{ role: "assistant", content: d.reply || "…" }]);
    } catch {}
    setBusy(false);
  }
  function openInMode(m) { setOpen(true); setGmode(m); if (m === "socratic" && history.length === 0) askSocraticOpening(); }
  function switchMode(m) { if (m === gmode) return; setGmode(m); if (m === "socratic" && history.length === 0) askSocraticOpening(); }

  function fmtMastery(ups) {
    if (!Array.isArray(ups) || !ups.length) return "";
    const seen = new Set(); const parts = [];
    for (const u of ups) { if (!u || !u.title || seen.has(u.kpId)) continue; seen.add(u.kpId); parts.push(`〈${u.title}〉${u.kind === "understanding" ? "↑" : "↓"}`); }
    return parts.length ? t("已据此更新熟悉程度:") + parts.join("、") : "";
  }

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;
    const hist = [...history, { role: "user", content: msg }];
    setHistory(hist); setInput(""); setBusy(true);
    try {
      const d = await aiFetch("/api/questions/discuss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, userAnswer: userAnswer || "", history: hist, mode: gmode }) });
      setHistory([...hist, { role: "assistant", content: d.reply || "(未生成回复)" }]);
    } catch { setHistory(hist); }
    setBusy(false);
  }

  async function finish() {
    if (history.length >= 2) {
      setBusy(true);
      try {
        const d = await aiFetch("/api/questions/discuss/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, attemptId, history }) });
        const parts = [];
        if (d.applied?.revised) parts.push(t("已按讨论修订评分为") + " " + d.applied.newScore + (d.applied.reason ? " · " + d.applied.reason : ""));
        const mn = fmtMastery(d.applied?.masteryUpdates);
        if (mn) parts.push(mn);
        setNote(parts.join(" · "));
        if (d.applied?.revised) { try { onApplied && onApplied(d.applied); } catch {} }
        recordedRef.current = true;
      } catch {}
      setBusy(false);
    }
    setOpen(false); setHistory([]); setInput("");
  }

  if (!open) return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost text-sm" onClick={() => openInMode("discuss")}>💬 {t("有疑问?追问/争论")}</button>
      <button type="button" className="btn-ghost text-sm" onClick={() => openInMode("socratic")}>🧭 {t("苏格拉底引导")}</button>
      {note && <p className="w-full text-sm mt-1 text-emerald-700">📊 <MD inline>{note}</MD></p>}
    </div>
  );

  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {[["discuss", "💬 " + t("追问/争论")], ["socratic", "🧭 " + t("苏格拉底引导")]].map(([k, lb]) => (
            <button key={k} type="button" onClick={() => switchMode(k)} className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${gmode === k ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-600 ring-slate-300"}`}>{lb}</button>
          ))}
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={finish} disabled={busy}>{t("结束讨论")}</button>
      </div>
      <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
        {history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-amber-500 text-white" : "bg-white ring-1 ring-slate-200"}`}>
              {m.role === "user" ? m.content : <MD className="prose-zh">{m.content}</MD>}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-slate-400">{t("思考中…")}</p>}
      </div>
      <div className="mt-2 space-y-2">
        <textarea className="input w-full" rows={2} placeholder={gmode === "socratic" ? t("顺着它的问题回答,不会就说不会…") : t("例如:我觉得我这样答也对,因为…")} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn px-5 w-full sm:w-auto sm:ml-auto sm:block" onClick={send} disabled={busy || !input.trim()}>{t("发送")}</button>
      </div>
    </div>
  );
}
