"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import MD from "@/components/MD";

export default function Mistakes() {
  const t = useT();
  const [list, setList] = useState(null);
  const load = () => fetch("/api/mistakes").then((r) => r.json()).then((d) => setList(d.mistakes));
  useEffect(() => { load(); }, []);
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
      {!list.length && <p className="text-center text-stone-400 py-10">{t("没有错题,漂亮!答错的题会自动收进来,按 1/3/7/15/30 天安排重练。")}</p>}
      {list.map((m) => (
        <div key={m.id} className="card">
          <div className="flex justify-between gap-2 text-xs text-stone-400 mb-1">
            <span>{m.kp_title || ""}</span>
            <span>{m.due_date ? t("下次重练:") + m.due_date : t("已完成重练周期")}</span>
          </div>
          <MD className="text-sm font-medium">{m.body.stem}</MD>
          {Array.isArray(m.body.options) && m.body.options.length > 0 && (
            <div className="mt-2 space-y-1">
              {m.body.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const isCorrect = String(m.answer.answer ?? "").toUpperCase().includes(letter);
                const isPicked = String(m.user_answer ?? "").toUpperCase().includes(letter);
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : isPicked ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "text-stone-600"}`}>
                    <span className="shrink-0 font-semibold">{letter}.</span>
                    <span className="min-w-0 flex-1"><MD inline>{String(opt)}</MD></span>
                    {isCorrect ? <span className="shrink-0 text-xs">✓ {t("正确")}</span> : isPicked ? <span className="shrink-0 text-xs">✗ {t("你选的")}</span> : null}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-sm mt-2"><span className="text-red-600">{t("你的答案:")}<MD inline>{m.user_answer || t("(空)")}</MD></span> · {t("正确:")}<MD inline>{String(m.answer.answer ?? "")}</MD></p>
          {m.answer.explanation && <details className="text-sm text-stone-600 mt-1"><summary className="cursor-pointer text-stone-400">{t("解析")}</summary><MD className="mt-1">{m.answer.explanation}</MD></details>}
          <button className="text-xs text-stone-400 underline mt-2" onClick={() => resolve(m.id)}>{t("我已理解,移出错题本")}</button>
        </div>
      ))}
    </div>
  );
}
