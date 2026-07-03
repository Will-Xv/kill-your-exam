"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

export default function Exams() {
  const t = useT();
  const [exams, setExams] = useState(null);
  const load = () => fetch("/api/exam/list").then((r) => r.json()).then((d) => setExams(d.exams));
  useEffect(() => { load(); }, []);
  async function switchTo(id) {
    await fetch("/api/exam/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: id }) });
    location.href = "/";
  }
  if (!exams) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  return (
    <div className="space-y-4 md:mt-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("我的考试")}</h1>
        <a href="/onboarding" className="btn py-2 text-sm">+ {t("新考试")}</a>
      </div>
      {exams.map((e) => (
        <div key={e.id} className={`card flex items-center justify-between ${e.status === "active" ? "border-emerald-400" : ""}`}>
          <div>
            <p className="font-bold">{e.name}</p>
            <p className="text-xs text-stone-400">{e.exam_date || t("未设日期")} · {e.status === "active" ? t("当前") : t("已归档")}</p>
          </div>
          {e.status !== "active" && <button className="btn-ghost py-2 text-sm" onClick={() => switchTo(e.id)}>{t("切换到这个")}</button>}
        </div>
      ))}
      {!exams.length && <p className="text-center text-stone-400 py-8">{t("还没有考试。")}</p>}
    </div>
  );
}
