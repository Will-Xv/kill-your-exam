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
  async function manage(action, examId, msg) {
    if (msg && !confirm(msg)) return;
    await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, examId }) });
    load();
  }
  if (!exams) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  const live = exams.filter((e) => !e.deleted_at);
  const trashed = exams.filter((e) => e.deleted_at);
  const daysLeft = (d) => Math.max(0, 60 - Math.floor((Date.now() - new Date(d + "Z")) / 86400000));
  const STATUS = { active: t("当前"), archived: t("已归档"), completed: t("已完成") };
  return (
    <div className="space-y-4 md:mt-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("我的考试")}</h1>
        <a href="/onboarding" className="btn py-2 text-sm">+ {t("新考试")}</a>
      </div>
      {live.map((e) => (
        <div key={e.id} className={`card ${e.status === "active" ? "border-emerald-400" : ""}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">{e.name} {e.status === "completed" && <span className="badge-material">{t("已完成")}</span>}</p>
              <p className="text-xs text-stone-400">{e.exam_date || t("未设日期")} · {STATUS[e.status] || e.status}</p>
            </div>
            {e.status !== "active" && <button className="btn-ghost py-2 text-sm" onClick={() => switchTo(e.id)}>{t("切换到这个")}</button>}
          </div>
          <div className="mt-2 flex gap-3 text-xs">
            {e.status !== "completed" && <button className="text-stone-500 underline" onClick={() => manage("complete", e.id, t("标记为已完成?记录会保留,之后仍可切换回来或迁移资料。"))}>{t("标记为已完成")}</button>}
            <button className="text-red-500 underline" onClick={() => manage("delete", e.id, t("删除这门考试?60 天内可恢复,之后永久删除全部记录。"))}>{t("删除")}</button>
          </div>
        </div>
      ))}
      {trashed.length > 0 && (
        <div className="pt-2">
          <h2 className="text-sm font-semibold text-stone-500 mb-2">🗑️ {t("回收站")}</h2>
          {trashed.map((e) => (
            <div key={e.id} className="card opacity-70 mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold line-through">{e.name}</p>
                  <p className="text-xs text-amber-700">{daysLeft(e.deleted_at)} {t("天后永久清除")}</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <button className="text-emerald-600 underline" onClick={() => manage("restore", e.id)}>{t("恢复")}</button>
                  <button className="text-red-500 underline" onClick={() => manage("purge_now", e.id, t("立即永久删除?此操作不可撤销。"))}>{t("立即删除")}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!live.length && !trashed.length && <p className="text-center text-stone-400 py-8">{t("还没有考试。")}</p>}
    </div>
  );
}
