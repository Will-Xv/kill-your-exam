"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import MD from "@/components/MD";

export default function Mistakes() {
  const t = useT();
  const [list, setList] = useState(null);
  const load = () => fetch("/api/mistakes").then((r) => r.json()).then((d) => setList(d.mistakes));
  useEffect(() => { load(); }, []);
  const [diag, setDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagReason, setDiagReason] = useState("");
  const runDiag = async () => {
    setDiagBusy(true); setDiagReason("");
    try {
      const d = await fetch("/api/diagnose").then((r) => r.json());
      if (d.diagnosis) setDiag(d.diagnosis); else setDiagReason(d.reason || "err");
    } catch { setDiagReason("err"); }
    setDiagBusy(false);
  };
  async function resolve(id) {
    await fetch("/api/mistakes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: id }) });
    load();
  }
  if (!list) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  return (
    <div className="space-y-3 md:mt-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("错题本")}</h1>
        <a className="btn-ghost text-sm py-2" href="/practice?mode=review">{t("✍️ 重练到期错题")}</a>
      </div>
      <div className="card">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm">🔍 {t("根因诊断")}</h2>
            <p className="text-xs text-stone-400">{t("不看表面频率,找出真正拖垮你的根因知识点、反复的错误模式,以及你是不是在躲最难的内容。")}</p>
          </div>
          {!diag && <button className="btn-ghost py-2 text-xs shrink-0" onClick={runDiag} disabled={diagBusy}>{diagBusy ? t("分析中…") : t("诊断我的错题")}</button>}
        </div>
        {diagReason === "no_data" && <p className="mt-2 text-xs text-stone-400">{t("先做一些练习,才能诊断根因。")}</p>}
        {diagReason && diagReason !== "no_data" && <p className="mt-2 text-xs text-stone-400">{t("诊断失败,稍后再试。")}</p>}
        {diag && (
          <div className="mt-3 space-y-3 text-sm">
            {diag.summary && <div className="rounded-xl bg-amber-50 px-3 py-2 font-semibold text-[#5a2d0c]">🎯 {diag.summary}</div>}
            {diag.rootCauses?.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-rose-700">{t("根因知识点")}</div>
                <div className="mt-1 space-y-1.5">
                  {diag.rootCauses.map((r, i) => (
                    <div key={i} className="rounded-xl bg-rose-50 px-3 py-2">
                      <div className="font-semibold text-[#2f2413]">{r.chapter ? r.chapter + " · " : ""}{r.title}</div>
                      <div className="text-xs text-stone-600">{r.why}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diag.errorPatterns?.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("反复的错误模式")}</div>
                <div className="mt-1 space-y-1.5">
                  {diag.errorPatterns.map((p, i) => (
                    <div key={i} className="rounded-xl bg-amber-50 px-3 py-2">
                      <div className="font-semibold text-[#2f2413]">{p.name}</div>
                      {p.evidence && <div className="text-xs text-stone-500">{p.evidence}</div>}
                      <div className="mt-0.5 text-xs text-emerald-800">🛠 {p.drill}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diag.avoidance?.avoiding && (
              <div className="rounded-xl bg-stone-100 px-3 py-2">
                <div className="text-xs font-bold uppercase tracking-wide text-stone-600">{t("你在躲最难的内容")}</div>
                <div className="text-xs text-stone-600">{diag.avoidance.detail}</div>
              </div>
            )}
            <button className="text-xs text-stone-400 underline" onClick={runDiag} disabled={diagBusy}>{diagBusy ? t("分析中…") : t("重新诊断")}</button>
          </div>
        )}
      </div>
      {!list.length && <p className="text-center text-stone-400 py-10">{t("没有错题,漂亮!答错的题会自动收进来,按 1/3/7/15/30 天安排重练。")}</p>}
      {list.map((m) => (
        <div key={m.id} className="card">
          <div className="flex justify-between gap-2 text-xs text-stone-400 mb-1">
            <span>{m.kp_title || ""}</span>
            <span>{m.due_date ? t("下次重练:") + m.due_date : t("已完成重练周期")}</span>
          </div>
          <MD className="text-sm font-medium">{m.body.stem}</MD>
          <p className="text-sm mt-2"><span className="text-red-600">{t("你的答案:")}<MD inline>{m.user_answer || t("(空)")}</MD></span> · {t("正确:")}<MD inline>{String(m.answer.answer ?? "")}</MD></p>
          {m.answer.explanation && <details className="text-sm text-stone-600 mt-1"><summary className="cursor-pointer text-stone-400">{t("解析")}</summary><MD className="mt-1">{m.answer.explanation}</MD></details>}
          <button className="text-xs text-stone-400 underline mt-2" onClick={() => resolve(m.id)}>{t("我已理解,移出错题本")}</button>
        </div>
      ))}
    </div>
  );
}
