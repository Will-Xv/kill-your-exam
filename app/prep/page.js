"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";

const CAT = { bring: ["🎒", "要带的"], logistics: ["🕐", "时间地点"], mindset: ["🧘", "心态"], rule: ["📋", "考场规则"] };

export default function Prep() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [prep, setPrep] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [reveal, setReveal] = useState({});

  useEffect(() => { fetch("/api/prep").then((r) => r.json()).then((d) => setPrep(d.prep)); }, []);
  async function gen() {
    setBusy(true);
    try { const d = await aiFetch("/api/prep", { method: "POST" }); setPrep(d.prep); } catch {}
    setBusy(false);
  }
  if (prep === undefined) return <div className="shimmer h-40 rounded-3xl" />;

  if (!prep) return (
    <div className="mt-16 text-center space-y-4">
      <div className="text-5xl">🎒</div>
      <h1 className="text-2xl font-black">{t("考前准备与自测")}</h1>
      <p className="text-slate-500">{t("考前该带什么、考场规则、应试技巧——这些不该混进平时知识练习,放在这里,考前再看。")}</p>
      <button className="btn" onClick={gen} disabled={busy}>{busy ? t("生成中…") : t("生成考前准备")}</button>
    </div>
  );

  const byCat = {};
  for (const r of prep.reminders || []) (byCat[r.category] ||= []).push(r.text);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">🎒 {t("考前准备与自测")}</h1>
        <button className="btn-ghost py-2 text-xs" onClick={gen} disabled={busy}>{busy ? "…" : t("重新生成")}</button>
      </div>

      {Object.entries(byCat).map(([cat, items]) => (
        <div key={cat} className="card">
          <h2 className="font-bold mb-2">{CAT[cat]?.[0]} {t(CAT[cat]?.[1] || cat)}</h2>
          <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-sm"><span className="text-emerald-500">✓</span>{x}</li>)}</ul>
        </div>
      ))}

      {prep.knowledgeCheck && (
        <div className="card border-emerald-200">
          <h2 className="font-bold text-emerald-900">📖 {t("知识性考前自测")}</h2>
          <div className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">{prep.knowledgeCheck.summary}</div>
          <div className="mt-3 space-y-3">
            {(prep.knowledgeCheck.questions || []).map((q, i) => {
              const RE = { weak: t("薄弱"), unreviewed: t("未复习"), key: t("重点"), likely: t("大概率考") };
              return (
                <div key={i} className="rounded-xl bg-white border border-slate-100 p-3">
                  <p className="text-xs text-slate-400">{q.topic} · <span className="text-emerald-600">{RE[q.reason] || q.reason}</span></p>
                  <p className="text-sm font-medium mt-0.5">{q.stem}</p>
                  {q.options?.length > 0 && <ul className="mt-1 text-sm text-slate-600">{q.options.map((o, j) => <li key={j}>{o}</li>)}</ul>}
                  <button className="text-xs text-emerald-700 underline mt-1" onClick={() => setReveal({ ...reveal, ["k" + i]: !reveal["k" + i] })}>{reveal["k" + i] ? t("隐藏答案") : t("看答案")}</button>
                  {reveal["k" + i] && <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{q.answer}<br /><span className="text-slate-600">{q.explanation}</span></p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card border-amber-200 bg-amber-50/60">
        <div className="flex items-center justify-between">
          <div><h2 className="font-bold text-amber-900">🧪 {t("考前自测(可选)")}</h2>
            <p className="text-xs text-amber-800">{t("应试技巧与考试规则,考前扫一眼即可,不计入知识掌握度。")}</p></div>
          <button className="btn-ghost py-2 text-xs" onClick={() => setShowCheck(!showCheck)}>{showCheck ? t("收起") : t("展开")}</button>
        </div>
        {showCheck && (
          <div className="mt-3 space-y-3">
            {(prep.selfcheck || []).map((q, i) => (
              <div key={i} className="rounded-xl bg-white p-3">
                <p className="text-xs text-slate-400">{q.area === "rule" ? t("考试规则") : t("应试技巧")}</p>
                <p className="text-sm font-medium mt-0.5">{q.stem}</p>
                {q.options?.length > 0 && <ul className="mt-1 text-sm text-slate-600">{q.options.map((o, j) => <li key={j}>{o}</li>)}</ul>}
                <button className="text-xs text-emerald-700 underline mt-1" onClick={() => setReveal({ ...reveal, [i]: !reveal[i] })}>{reveal[i] ? t("隐藏答案") : t("看答案")}</button>
                {reveal[i] && <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{q.answer}<br /><span className="text-slate-600">{q.explanation}</span></p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
