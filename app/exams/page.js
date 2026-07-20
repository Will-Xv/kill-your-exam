"use client";
import { alertDialog } from "@/components/ui/dialog";
import { openKiller } from "@/lib/killerUi";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/I18n";

export default function Exams() {
  const t = useT();
  const [exams, setExams] = useState(null);
  const [confirmAsk, setConfirmAsk] = useState(null); // {action, examId, msg} 站内确认
  const load = () => fetch("/api/exam/list").then((r) => (r.ok ? r.json() : null)).then((d) => setExams(Array.isArray(d && d.exams) ? d.exams : [])).catch(() => setExams([])); // 响应异常(401/错误)也稳成空列表,不卡在"加载中…"
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!exams?.some((e) => e.setup_state === "generating")) return; const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [exams]);
  async function switchTo(id) {
    await fetch("/api/exam/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: id }) });
    try { Object.keys(localStorage).filter((k) => k.startsWith("kye_practice:")).forEach((k) => localStorage.removeItem(k)); } catch {}
    location.href = "/";
  }
  function manage(action, examId, msg) {
    if (msg) { setConfirmAsk({ action, examId, msg }); return; }
    doManage(action, examId);
  }
  async function doManage(action, examId) {
    try {
      const r = await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, examId }) });
      if (!r.ok) { const tx = await r.text().catch(() => ""); alertDialog("HTTP " + r.status + " " + tx); }
    } catch (e) { alertDialog(String((e && e.message) || e)); }
    load();
  }
  if (!exams) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  const live = exams.filter((e) => !e.deleted_at);
  const trashed = exams.filter((e) => e.deleted_at);
  const daysLeft = (d) => Math.max(0, 60 - Math.floor((Date.now() - new Date(d + "Z")) / 86400000));
  const STATUS = { active: t("当前"), archived: t("已归档"), completed: t("已完成") };
  return (
    <div className="space-y-4 md:mt-14">
      {confirmAsk && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" onClick={() => setConfirmAsk(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-stone-700">{confirmAsk.msg}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-600" onClick={() => setConfirmAsk(null)}>{t("取消")}</button>
              <button className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white" onClick={() => { const a = confirmAsk; setConfirmAsk(null); doManage(a.action, a.examId); }}>{t("确认")}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("追杀计划")}</h1>
      </div>
      {/* 手动建考试已下线:告诉主人去找杀手建 */}
      <button onClick={openKiller} className="w-full rounded-2xl border border-dashed border-[#dbc999] bg-[#f6efdc]/60 px-4 py-3 text-left text-sm text-[#8a6a2c] transition hover:bg-[#f3ecda]">
        ➕ {t("要加新考试?直接跟杀手说你要考什么,它会帮你建好。")}
      </button>
      {live.map((e) => {
        const setup = e.status === "setup";
        const generating = e.setup_state === "generating";
        return (
        <div key={e.id} className={`card ${e.status === "active" ? "border-amber-500" : setup ? "border-dashed border-stone-300" : ""}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">{e.name} {e.completed_at && <span className="badge-material">✅ {t("已完成")}</span>}</p>
              <p className="text-xs text-stone-400">{generating ? "⏳ " + (e.setup_progress ? t(e.setup_progress) : t("生成中…")) : setup ? "🚧 " + t("这门还没建完") : e.completed_at ? "✅ " + t("已完成") : (e.exam_date || t("未设日期")) + " · " + (STATUS[e.status] || e.status)}</p>
            </div>
            {generating ? <span className="text-xs text-amber-600 animate-pulse">{t("AI 后台生成中")}</span>
              : setup ? <button className="btn py-2 text-sm" onClick={openKiller}>{t("让杀手补完")}</button>
              : e.status !== "active" ? <button className="btn-ghost py-2 text-sm" onClick={() => switchTo(e.id)}>{t("切换到这个")}</button> : null}
          </div>
          <div className="mt-2 flex gap-3 text-xs">
            {!setup && !e.completed_at && <button className="text-stone-500 underline" onClick={() => manage("complete", e.id, t("标记为已完成?记录会保留,这门考试仍可正常练习/切换,只是不再显示倒计时。"))}>{t("标记为已完成")}</button>}
            {e.completed_at && <button className="text-stone-500 underline" onClick={() => manage("uncomplete", e.id)}>{t("取消完成")}</button>}
            <button className="text-red-500 underline" onClick={() => manage("delete", e.id, setup ? t("删除这个未完成的设置?") : t("删除这门考试?60 天内可恢复,之后永久删除全部记录。"))}>{t("删除")}</button>
          </div>
        </div>
      );})}
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
                  <button className="text-amber-600 underline" onClick={() => manage("restore", e.id)}>{t("恢复")}</button>
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
