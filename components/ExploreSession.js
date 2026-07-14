"use client";
import { useState, useRef, useEffect } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";

// Topic-first 自由探索:围绕一个知识点自由发问,AI 判断你懂多深并自适应引导(浅→苏格拉底追问,深→挑战题)。
// 结束时把你在探索里体现出的理解/误区沉淀进掌握度。
const DEPTH_LABEL = { shallow: "浅", medium: "进入状态", deep: "已想透" };
const DEPTH_PCT = { shallow: 25, medium: 60, deep: 95 };
const DEPTH_COLOR = { shallow: "bg-rose-400", medium: "bg-amber-400", deep: "bg-emerald-500" };

export default function ExploreSession({ kp, onBack }) {
  const t = useT();
  const aiFetch = useAiFetch();
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [depth, setDepth] = useState(null);
  const [note, setNote] = useState("");
  const [ended, setEnded] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [history, busy]);

  async function turn(hist) {
    setBusy(true);
    try {
      const d = await aiFetch("/api/kp/explore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kp.id, history: hist }) });
      setHistory([...hist, { role: "assistant", content: d.reply || "…" }]);
      if (d.depth) setDepth(d.depth);
    } catch {}
    setBusy(false);
  }
  useEffect(() => { turn([]); /* 开场 */ }, []); // eslint-disable-line

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;
    const hist = [...history, { role: "user", content: msg }];
    setHistory(hist); setInput("");
    await turn(hist);
  }
  async function finish() {
    if (busy || ended) return;
    setBusy(true);
    try {
      const d = await aiFetch("/api/kp/explore/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kp.id, history }) });
      const ups = d?.applied?.masteryUpdates || [];
      const seen = new Set(); const parts = [];
      for (const u of ups) { if (!u || !u.title || seen.has(u.kpId)) continue; seen.add(u.kpId); parts.push(`〈${u.title}〉${u.kind === "understanding" ? "↑" : "↓"}`); }
      setNote(parts.length ? t("已据此更新熟悉程度:") + parts.join("、") : t("这段探索已记录。"));
      setEnded(true);
    } catch {}
    setBusy(false);
  }

  return (
    <div className="space-y-3 md:mt-14">
      <button className="text-sm text-stone-500" onClick={onBack}>{t("← 返回知识点列表")}</button>
      <div className="card">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <h1 className="text-lg font-bold">🔍 {t("自由探索")} · <MD inline>{kp.title}</MD></h1>
        </div>
        <p className="mt-1 text-xs text-stone-500">{t("围着这个主题随便问、随便想,AI 顺着你的好奇心走,并按你懂的深浅自适应引导。")}</p>
        {depth && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-stone-500"><span>{t("理解深度")}</span><span>{t(DEPTH_LABEL[depth] || "")}</span></div>
            <div className="h-2 rounded-full bg-stone-200"><div className={`h-2 rounded-full transition-all ${DEPTH_COLOR[depth] || "bg-stone-300"}`} style={{ width: `${DEPTH_PCT[depth] || 20}%` }} /></div>
          </div>
        )}
        <div ref={boxRef} className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto">
          {history.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div className={`inline-block max-w-[92%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-800"}`}>
                <MD>{m.content}</MD>
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-stone-400 animate-pulse">{t("AI 正在思考…")}</div>}
        </div>
        {note && <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{note}</div>}
        {!ended && (
          <div className="mt-3 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("问点什么,或说说你的想法…")} className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400" disabled={busy} />
            <button onClick={send} disabled={busy || !input.trim()} className="btn px-4">{t("发送")}</button>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          {!ended ? <button type="button" className="btn-ghost text-xs" onClick={finish} disabled={busy || history.length < 2}>{t("结束探索并记录")}</button> : null}
          <a className="btn-ghost text-xs" href={`/practice?kp=${kp.id}&fresh=1`}>{t("✍️ 练几道题检验一下")}</a>
        </div>
      </div>
    </div>
  );
}
