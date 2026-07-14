"use client";
import { useT } from "@/components/I18n";
import { useState, useRef, useEffect } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";
import MD from "@/components/MD";

const PRESETS = [
  { key: "boss", emoji: "🗡️", title: "错题 Boss 战", desc: "把你的错题变成一只 Boss,答对造成伤害,把它砍到 0 血。", meterLabel: "Boss 血量", down: true },
  { key: "trial", emoji: "⚖️", title: "知识点庭审", desc: "一个你薄弱的概念受审,你当辩方,证明你真懂,对方律师会犀利盘问。", meterLabel: "庭审优势", down: false },
  { key: "debate", emoji: "🎤", title: "辩论赛", desc: "AI 站你对面,就一个观点针锋相对,用知识把它辩倒。", meterLabel: "你的占优", down: false },
];

export default function ArenaPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [launch, setLaunch] = useState(null);
  const [scope, setScope] = useState("weak");
  const [msgs, setMsgs] = useState([]);
  const [meter, setMeter] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [custom, setCustom] = useState({ play: [], exam_form: [] });
  const [creatorOpen, setCreatorOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs, busy]);
  const loadModes = () => fetch("/api/arena/modes").then((r) => r.json()).then((d) => setCustom({ play: d.play || [], exam_form: d.exam_form || [] })).catch(() => {});
  useEffect(() => { loadModes(); }, []);

  async function turn(history, l) {
    setBusy(true);
    try {
      const r = await aiFetch("/api/arena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: (l || launch).key, scope, history }) });
      const next = [...history, { role: "assistant", content: r.reply || "…" }];
      setMsgs(next);
      if (r.state && typeof r.state.meter === "number") setMeter(r.state.meter);
      if (r.state && r.state.done) setDone({ win: !!r.state.win });
    } catch {}
    setBusy(false);
  }
  function start(l) { setLaunch(l); setMsgs([]); setMeter(null); setDone(null); setTimeout(() => turn([], l), 0); }
  function send() {
    if (!input.trim() || busy || done) return;
    const h = [...msgs, { role: "user", content: input.trim() }];
    setMsgs(h); setInput(""); turn(h);
  }
  const launchCustom = (m) => start({ key: "custom:" + m.id, emoji: m.emoji, title: m.name, meterLabel: m.meter_label || "进度", down: m.meter_dir === "down" });
  async function del(id) {
    if (!confirm(t("删除这个自定义模式?"))) return;
    try { await fetch("/api/arena/modes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: id }) }); loadModes(); } catch {}
  }

  if (!launch) return (
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
        {PRESETS.map((m) => (
          <button key={m.key} onClick={() => start(m)} className="card text-left hover:ring-2 hover:ring-amber-400">
            <div className="text-3xl">{m.emoji}</div>
            <div className="mt-1 font-bold">{t(m.title)}</div>
            <div className="mt-1 text-xs text-stone-500">{t(m.desc)}</div>
          </button>
        ))}
      </div>

      {custom.exam_form.length > 0 && (
        <div>
          <h2 className="mt-2 text-sm font-bold text-stone-600">🎯 {t("本考试的自定义考核")}</h2>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {custom.exam_form.map((m) => <CustomCard key={m.id} m={m} onStart={() => launchCustom(m)} onDel={() => del(m.id)} t={t} />)}
          </div>
        </div>
      )}
      {custom.play.length > 0 && (
        <div>
          <h2 className="mt-2 text-sm font-bold text-stone-600">🎲 {t("自定义玩法")}</h2>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {custom.play.map((m) => <CustomCard key={m.id} m={m} onStart={() => launchCustom(m)} onDel={() => del(m.id)} t={t} />)}
          </div>
        </div>
      )}

      <button onClick={() => setCreatorOpen((v) => !v)} className="text-sm text-indigo-600">{creatorOpen ? t("收起") : "➕ " + t("自定义一个玩法/考核")}</button>
      {creatorOpen && <Creator t={t} aiFetch={aiFetch} onCreated={() => { setCreatorOpen(false); loadModes(); }} />}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => { setLaunch(null); loadModes(); }} className="text-sm text-stone-500">← {t("换玩法")}</button>
        <div className="font-bold">{launch.emoji} {launch.key.startsWith("custom:") ? launch.title : t(launch.title)}</div>
        <button onClick={() => start(launch)} className="text-sm text-stone-500">↻ {t("重来")}</button>
      </div>
      {meter != null && (
        <div>
          <div className="flex justify-between text-xs text-stone-500"><span>{launch.key.startsWith("custom:") ? launch.meterLabel : t(launch.meterLabel)}</span><span>{meter}%</span></div>
          <div className="h-2.5 rounded-full bg-stone-200"><div className={`h-2.5 rounded-full transition-all ${launch.down ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></div>
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
          <button onClick={() => start(launch)} className="btn mt-2 py-1.5 text-sm">{t("再来一局")}</button>
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

function CustomCard({ m, onStart, onDel, t }) {
  return (
    <div className="card text-left hover:ring-2 hover:ring-indigo-300">
      <div className="flex items-start justify-between">
        <button onClick={onStart} className="flex-1 text-left">
          <div className="text-2xl">{m.emoji}</div>
          <div className="mt-1 font-bold">{m.name}</div>
          {m.win_desc && <div className="mt-0.5 text-xs text-stone-500 line-clamp-2">{m.win_desc}</div>}
        </button>
        <button onClick={onDel} title={t("删除")} className="text-xs text-stone-400 hover:text-rose-500">✕</button>
      </div>
    </div>
  );
}

function Creator({ t, aiFetch, onCreated }) {
  const [kind, setKind] = useState("play");
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [meterLabel, setMeterLabel] = useState("");
  const [winDesc, setWinDesc] = useState("");
  const [dir, setDir] = useState("up");
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim() || !spec.trim()) return;
    setBusy(true);
    try { await aiFetch("/api/arena/modes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name, spec, meterLabel, winDesc, meterDir: dir }) }); onCreated(); } catch {}
    setBusy(false);
  }
  return (
    <div className="card space-y-2">
      <div className="flex gap-2 text-xs">
        {[["play", t("学习玩法")], ["exam_form", t("考核形式")]].map(([k, lb]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ring-1 ${kind === k ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-stone-600 ring-stone-300"}`}>{lb}</button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("名字,如 苏格拉底答辩 / 模拟王国")} className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
      <textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={4} placeholder={t("用大白话写清楚:这个玩法/考核怎么进行、怎么算赢或满分。例:你要接住我抛出的所有质疑,并反过来把我问倒才算满分。")} className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={meterLabel} onChange={(e) => setMeterLabel(e.target.value)} placeholder={t("计分条含义,如 说服力/王国存续度")} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
        <input value={winDesc} onChange={(e) => setWinDesc(e.target.value)} placeholder={t("达成/满分条件(可选)")} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-stone-500">{t("计分条")}:</span>
        {[["up", t("越高越好")], ["down", t("越低越好")]].map(([k, lb]) => (
          <button key={k} onClick={() => setDir(k)} className={`rounded-full px-2.5 py-0.5 ring-1 ${dir === k ? "bg-stone-700 text-white ring-stone-700" : "bg-white text-stone-600 ring-stone-300"}`}>{lb}</button>
        ))}
        <button onClick={create} disabled={busy || !name.trim() || !spec.trim()} className="btn ml-auto px-4 py-1.5 text-sm">{busy ? t("创建中…") : t("创建")}</button>
      </div>
    </div>
  );
}
