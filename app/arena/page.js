"use client";
import { useT } from "@/components/I18n";
import { useState, useRef, useEffect } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";
import MD from "@/components/MD";

const MODES = [
  { key: "boss", emoji: "🗡️", title: "错题 Boss 战", desc: "把你的错题变成一只 Boss,答对造成伤害,把它砍到 0 血。", meterLabel: "Boss 血量", down: true },
  { key: "trial", emoji: "⚖️", title: "知识点庭审", desc: "一个你薄弱的概念受审,你当辩方,证明你真懂,对方律师会犀利盘问。", meterLabel: "庭审优势", down: false },
  { key: "debate", emoji: "🎤", title: "辩论赛", desc: "AI 站你对面,就一个观点针锋相对,用知识把它辩倒。", meterLabel: "你的占优", down: false },
];

export default function ArenaPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [mode, setMode] = useState(null);
  const [scope, setScope] = useState("weak");
  const [msgs, setMsgs] = useState([]); // {role, content}
  const [meter, setMeter] = useState(null);
  const [done, setDone] = useState(null); // null | {win}
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const boxRef = useRef(null);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs, busy]);

  const modeObj = MODES.find((m) => m.key === mode);

  async function turn(history) {
    setBusy(true);
    try {
      const r = await aiFetch("/api/arena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, scope, history }) });
      const next = [...history, { role: "assistant", content: r.reply || "…" }];
      setMsgs(next);
      if (r.state && typeof r.state.meter === "number") setMeter(r.state.meter);
      if (r.state && r.state.done) setDone({ win: !!r.state.win });
    } catch {}
    setBusy(false);
  }
  function startMode(mk) { setMode(mk); setMsgs([]); setMeter(null); setDone(null); }
  useEffect(() => { if (mode && msgs.length === 0 && !busy) turn([]); }, [mode]); // eslint-disable-line
  function send() {
    if (!input.trim() || busy || done) return;
    const h = [...msgs, { role: "user", content: input.trim() }];
    setMsgs(h); setInput(""); turn(h);
  }

  if (!mode) return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">🎮 {t("竞技场")}</h1>
        <p className="text-sm text-stone-500">{t("把枯燥的复习变成对战。选一种玩法开始:")}</p>
      </div>
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="text-stone-500">{t("素材:")}</span>
        {[["weak", t("薄弱知识点")], ["wrong", t("我的错题")]].map(([k, lb]) => (
          <button key={k} onClick={() => setScope(k)} className={`rounded-full px-3 py-1 ring-1 ${scope === k ? "bg-[#2f2413] text-white ring-[#2f2413]" : "bg-white text-stone-600 ring-stone-300"}`}>{lb}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => startMode(m.key)} className="card text-left hover:ring-2 hover:ring-amber-400">
            <div className="text-3xl">{m.emoji}</div>
            <div className="mt-1 font-bold">{t(m.title)}</div>
            <div className="mt-1 text-xs text-stone-500">{t(m.desc)}</div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => setMode(null)} className="text-sm text-stone-500">← {t("换玩法")}</button>
        <div className="font-bold">{modeObj.emoji} {t(modeObj.title)}</div>
        <button onClick={() => startMode(mode)} className="text-sm text-stone-500">↻ {t("重来")}</button>
      </div>
      {meter != null && (
        <div>
          <div className="flex justify-between text-xs text-stone-500"><span>{t(modeObj.meterLabel)}</span><span>{meter}%</span></div>
          <div className="h-2.5 rounded-full bg-stone-200"><div className={`h-2.5 rounded-full transition-all ${modeObj.down ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></div>
        </div>
      )}
      <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-gradient-to-b from-stone-50 to-amber-50/40 p-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-[#2f2413] text-white" : "bg-white ring-1 ring-stone-200"}`}>
              {m.role === "user" ? m.content : <div className="prose-arena"><MD>{m.content}</MD></div>}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-stone-400">{t("对手正在思考…")}</div>}
      </div>
      {done ? (
        <div className={`card text-center ${done.win ? "bg-emerald-50 border-emerald-300" : "bg-rose-50 border-rose-300"}`}>
          <div className="text-2xl">{done.win ? "🏆" : "💀"}</div>
          <div className="font-bold">{done.win ? t("你赢了!") : t("这局输了,但你已经看清了要补的地方。")}</div>
          <button onClick={() => startMode(mode)} className="btn mt-2 py-1.5 text-sm">{t("再来一局")}</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={busy} placeholder={t("出招/应答…")} className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm" />
          <button onClick={send} disabled={busy || !input.trim()} className="btn px-4">{t("发送")}</button>
        </div>
      )}
    </div>
  );
}
