"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

// 用户有多门(未分组)考试时,主页/追杀计划主动提示:要不要建成一组,今日任务统一管理更方便。是/暂不/不再提醒。
export default function ExamGroupPrompt() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let a = true; fetch("/api/exam-group").then((r) => r.json()).then((d) => { if (a) setShow(!!d.shouldPrompt); }).catch(() => {}); return () => { a = false; }; }, []);
  if (!show) return null;
  async function yes() {
    setBusy(true);
    try { const r = await fetch("/api/exam-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "group_all" }) }).then((x) => x.json()); if (r && r.ok) { window.location.reload(); return; } } catch {}
    setBusy(false);
  }
  async function never() { try { await fetch("/api/exam-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss_forever" }) }); } catch {} setShow(false); }
  return (
    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
      <p>📁 {t("你有好几门考试——要不要把它们建成一组?今日任务统一看着更好管(各科知识树/掌握度仍各自独立,不合并)。")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={yes} disabled={busy} className="rounded-full bg-amber-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{busy ? t("处理中…") : t("好,建一组")}</button>
        <button onClick={() => setShow(false)} className="rounded-full bg-white px-3.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50">{t("暂不")}</button>
        <button onClick={never} className="px-2 py-1 text-xs text-amber-700 underline hover:opacity-80">{t("不再提醒")}</button>
      </div>
    </div>
  );
}
