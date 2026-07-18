"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

// 用户有多门(未分组)考试时,主页/追杀计划主动提示:要不要把【你选的几门】建成一组,今日任务统一管理更方便。
export default function ExamGroupPrompt() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [ung, setUng] = useState([]);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let a = true;
    fetch("/api/exam-group").then((r) => r.json()).then((d) => {
      if (!a) return;
      setShow(!!d.shouldPrompt);
      const list = d.ungrouped || []; setUng(list);
      const init = {}; for (const e of list) init[e.id] = true; setSel(init);
    }).catch(() => {});
    return () => { a = false; };
  }, []);
  if (!show) return null;
  const chosen = ung.filter((e) => sel[e.id]).map((e) => e.id);
  async function create() {
    if (!chosen.length || busy) return;
    setBusy(true);
    try { const r = await fetch("/api/exam-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "group", examIds: chosen, name: name.trim() || t("我的考试") }) }).then((x) => x.json()); if (r && r.ok) { window.location.reload(); return; } } catch {}
    setBusy(false);
  }
  async function never() { try { await fetch("/api/exam-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss_forever" }) }); } catch {} setShow(false); }

  return (
    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
      {!picking ? (
        <>
          <p>📁 {t("你有好几门考试——要不要挑几门建成一组?今日任务统一看着更好管(各科知识树/掌握度仍各自独立,不合并)。")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => setPicking(true)} className="rounded-full bg-amber-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-amber-700">{t("好,我来挑几门建成一组")}</button>
            <button onClick={() => setShow(false)} className="rounded-full bg-white px-3.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50">{t("暂不")}</button>
            <button onClick={never} className="px-2 py-1 text-xs text-amber-700 underline hover:opacity-80">{t("不再提醒")}</button>
          </div>
        </>
      ) : (
        <>
          <p className="font-medium">📁 {t("选要放进这一组的考试:")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ung.map((e) => (
              <button key={e.id} onClick={() => setSel((x) => ({ ...x, [e.id]: !x[e.id] }))}
                className={"rounded-full px-3 py-1 text-xs ring-1 transition " + (sel[e.id] ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-amber-800 ring-amber-300 hover:bg-amber-50")}>
                {sel[e.id] ? "✓ " : ""}{e.name}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("分组名(可选,如「本学期」)")} className="mt-2 w-full max-w-xs rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={create} disabled={busy || !chosen.length} className="rounded-full bg-amber-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{busy ? t("处理中…") : t("创建分组") + (chosen.length ? ` (${chosen.length})` : "")}</button>
            <button onClick={() => setPicking(false)} className="rounded-full bg-white px-3.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50">{t("取消")}</button>
          </div>
        </>
      )}
    </div>
  );
}
