"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import PlanSetup from "@/components/PlanSetup";

// 本周计划表:按周显示的排期日历,可 ← → 前后翻周。凡是带日期的都排进来(排期条目+带截止的作业),当前周顶部显示逾期顺延。
export default function PlanPage() {
  const t = useT();
  const [dayPlan, setDayPlan] = useState(undefined); // undefined=加载中, null=没有排期
  const [taskItems, setTaskItems] = useState([]);    // 带截止日期的作业(只读并进周历)
  const [dpEdit, setDpEdit] = useState(false);
  const [dpDraft, setDpDraft] = useState([]);
  const [wk, setWk] = useState(0); // 周偏移:0=本周
  const [setupOpen, setSetupOpen] = useState(false);
  const loadDayPlan = () => fetch("/api/day-plan").then((r) => (r.ok ? r.json() : null)).then((d) => { setDayPlan(d ? d.view : null); setTaskItems(d && d.tasks ? d.tasks : []); }).catch(() => setDayPlan(null));
  const dpMark = (seq, done) => fetch("/api/day-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark", seq, done }) }).then((r) => r.json()).then((d) => setDayPlan(d.view)).catch(() => {});
  const dpSaveEdit = () => fetch("/api/day-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", items: dpDraft }) }).then((r) => r.json()).then((d) => { setDayPlan(d.view); setDpEdit(false); }).catch(() => {});
  const dpClear = () => { if (!confirm(t("确定清空整份排期?"))) return; fetch("/api/day-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear" }) }).then((r) => r.json()).then(() => setDayPlan(null)).catch(() => {}); };
  useEffect(() => { loadDayPlan(); try { if (new URLSearchParams(window.location.search).get("setup") === "1") setSetupOpen(true); } catch {} }, []);

  const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const view = dayPlan || { today: ymd(new Date()), dueNow: [], future: [], done: [], overdueCount: 0 };
  const today = view.today;
  const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() + wk * 7);
  const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return ymd(d); });
  const WD = [t("周一"), t("周二"), t("周三"), t("周四"), t("周五"), t("周六"), t("周日")];
  const weekLabel = `${weekDays[0].slice(5)} – ${weekDays[6].slice(5)}`;

  const undone = [...(view.dueNow || []), ...((view.future || []).flatMap((f) => f.items))];
  const done = view.done || [];
  const all = [...undone.map((x) => ({ ...x, done: false })), ...done.map((x) => ({ ...x, done: true }))];
  const onDay = (dstr) => all.filter((x) => x.date === dstr).sort((a, b) => a.seq - b.seq);
  const overdue = wk === 0 ? undone.filter((x) => x.date < today).sort((a, b) => a.day - b.day || a.seq - b.seq) : [];
  const tasksOnDay = (dstr) => taskItems.filter((x) => x.date === dstr);
  const overdueTasks = wk === 0 ? taskItems.filter((x) => x.date < today) : [];

  const goLink = (it) => it.taskId ? `/tasks?task=${it.taskId}` : (it.href || null);
  const row = (it) => {
    const link = goLink(it);
    return (
      <label key={it.seq} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
        <input type="checkbox" checked={!!it.done} onChange={() => dpMark(it.seq, !it.done)} />
        <span className={"min-w-0 flex-1 " + (it.done ? "text-slate-400 line-through" : "")}>{it.title}{link ? <a href={link} className="ml-1 text-xs text-teal-600 underline">{t("去做")}</a> : null}</span>
      </label>
    );
  };
  const taskRow = (tk) => (
    <a key={"tk" + tk.taskId} href={`/tasks?task=${tk.taskId}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
      <span className="shrink-0 text-teal-600">📝</span>
      <span className="min-w-0 flex-1 truncate"><span className="text-[#8a6a2c]">{tk.examName} · </span>{tk.title}{tk.kind === "assignment" ? <span className="ml-1 rounded bg-teal-100 px-1 text-[10px] text-teal-700">{t("作业")}</span> : null}</span>
      <span className="shrink-0 text-xs text-teal-600 underline">{t("去做")}</span>
    </a>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-[#2f2413]">📅 {t("本周计划表")}</h1>
        <button onClick={() => setSetupOpen(true)} className="rounded-full bg-[#2f2413] px-3 py-1.5 text-xs font-semibold text-[#f6efdd] hover:opacity-90">🗓️ {t("排学习计划")}</button>
        {dayPlan && !dpEdit && (
          <div className="flex items-center gap-2 text-xs">
            <button onClick={() => { setDpDraft(all.map((i) => ({ seq: i.seq, day: i.day, title: i.title, examId: i.examId, taskId: i.taskId, href: i.href, done: i.done }))); setDpEdit(true); }} className="rounded-full bg-stone-100 px-2.5 py-1 ring-1 ring-stone-300 hover:bg-stone-50">✎ {t("编辑")}</button>
            <button onClick={dpClear} className="rounded-full px-2 py-1 text-rose-500 hover:underline">{t("清空")}</button>
          </div>
        )}
      </div>

      {dayPlan === undefined ? (
        <div className="shimmer h-24 rounded-2xl" />
      ) : (!dayPlan && taskItems.length === 0) ? (
        <div className="card text-sm text-stone-500">{t("还没有排期。")}<button onClick={() => setSetupOpen(true)} className="font-semibold text-[#2f2413] underline">{t("排一份学习计划")}</button>{t(",或对杀手说「帮我把任务按天排开」/发一份 syllabus。")}</div>
      ) : dpEdit ? (
        <div className="card space-y-1.5">
          <div className="flex items-center justify-between"><p className="text-[11px] text-stone-400">{t("改「第几天」就能调整顺序/顺延;要大改直接让杀手重排。这里编辑的是【整份】排期。")}</p><div className="flex gap-2"><button onClick={dpSaveEdit} className="rounded-full bg-[#2f2413] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">{t("保存")}</button><button onClick={() => setDpEdit(false)} className="rounded-full px-2 py-1 text-xs text-stone-500">{t("取消")}</button></div></div>
          {dpDraft.map((it, i) => (
            <div key={i} className="flex items-center gap-1.5 text-sm">
              <span className="text-[11px] text-stone-400">{t("第")}</span>
              <input type="number" min="0" value={it.day} onChange={(e) => setDpDraft((d) => d.map((x, j) => (j === i ? { ...x, day: Math.max(0, parseInt(e.target.value || "0", 10)) } : x)))} className="w-14 rounded border border-stone-300 px-1 py-0.5 text-center" />
              <span className="text-[11px] text-stone-400">{t("天")}</span>
              <input value={it.title} onChange={(e) => setDpDraft((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-0.5" />
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-stone-500"><input type="checkbox" checked={it.done} onChange={(e) => setDpDraft((d) => d.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />{t("完成")}</label>
              <button onClick={() => setDpDraft((d) => d.filter((_, j) => j !== i))} className="shrink-0 text-rose-400 hover:text-rose-600">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setWk((w) => w - 1)} className="rounded-full bg-[#2f2413] px-3 py-1 text-sm font-semibold text-[#f6efdd] hover:opacity-90">← {t("上一周")}</button>
            <div className="text-center">
              <div className="text-sm font-bold text-[#2f2413]">{wk === 0 ? t("本周") : wk === -1 ? t("上周") : wk === 1 ? t("下周") : weekLabel}</div>
              <div className="text-[11px] text-stone-400">{weekLabel}{wk !== 0 && <button onClick={() => setWk(0)} className="ml-2 underline hover:opacity-80">{t("回本周")}</button>}</div>
            </div>
            <button onClick={() => setWk((w) => w + 1)} className="rounded-full bg-[#2f2413] px-3 py-1 text-sm font-semibold text-[#f6efdd] hover:opacity-90">{t("下一周")} →</button>
          </div>

          {(overdue.length > 0 || overdueTasks.length > 0) && (
            <div className="card border-rose-200 bg-rose-50/50">
              <div className="mb-1 text-xs font-semibold text-rose-700">⚠️ {t("逾期顺延(原定更早、还没做)")}</div>
              <div className="space-y-0.5">
                {overdueTasks.map(taskRow)}
                {overdue.map((it) => {
                  const link = goLink(it);
                  return (
                    <label key={it.seq} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white/60">
                      <input type="checkbox" checked={false} onChange={() => dpMark(it.seq, true)} />
                      <span className="min-w-0 flex-1">{it.title}{link ? <a href={link} className="ml-1 text-xs text-teal-600 underline">{t("去做")}</a> : null}</span>
                      <span className="shrink-0 text-[10px] text-rose-500">{t("原定")} {it.date.slice(5)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {weekDays.map((dstr, i) => {
              const items = onDay(dstr); const tks = tasksOnDay(dstr); const isToday = dstr === today;
              return (
                <div key={dstr} className={"card " + (isToday ? "border-amber-300 bg-amber-50/40" : "")}>
                  <div className="mb-0.5 flex items-center gap-2 text-xs font-semibold text-[#8a6a2c]">{WD[i]} <span className="text-stone-400">{dstr.slice(5)}</span>{isToday && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">{t("今天")}</span>}</div>
                  {(items.length === 0 && tks.length === 0) ? <p className="text-xs text-stone-300">—</p> : <div>{items.map(row)}{tks.map(taskRow)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
      <PlanSetup open={setupOpen} onClose={() => setSetupOpen(false)} defaults={{ examDate: (view && view.examDate) || "" }} onDone={() => { setSetupOpen(false); loadDayPlan(); }} />
    </div>
  );
}
