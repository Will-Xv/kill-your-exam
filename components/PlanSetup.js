"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";

// 排学习计划弹窗:把该确定的都问完(时间要求/每天学多久/排哪些天)→ 一次性生成学习进程,写进按天排期。
// props: { open, onClose, defaults:{examDate, dailyMinutes}, onDone(result) }
export default function PlanSetup({ open, onClose, defaults = {}, onDone }) {
  const t = useT();
  const [mode, setMode] = useState(defaults.examDate ? "deadline" : "open"); // deadline/until/weeks/open
  const [examDate, setExamDate] = useState(defaults.examDate || "");
  const [targetDate, setTargetDate] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [dailyMinutes, setDailyMinutes] = useState(defaults.dailyMinutes || 60);
  const [days, setDays] = useState("all"); // all / noweekend / custom
  const [skip, setSkip] = useState([]); // 自定义:要跳过的周几 0..6
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [showTimeOpts, setShowTimeOpts] = useState(!defaults.examDate); // 已知考试日期→默认收起时间要求,只让改真正需要的
  if (!open) return null;

  const WD = [[1, t("周一")], [2, t("周二")], [3, t("周三")], [4, t("周四")], [5, t("周五")], [6, t("周六")], [0, t("周日")]];
  async function generate() {
    setBusy(true);
    const body = { mode, dailyMinutes: Number(dailyMinutes) || 60 };
    if (mode === "deadline") body.examDate = examDate;
    else if (mode === "until") body.targetDate = targetDate;
    else if (mode === "weeks") body.weeks = Number(weeks) || 4;
    if (days === "noweekend") body.skipWeekends = true;
    else if (days === "custom") body.skipDays = skip;
    try { const r = await fetch("/api/study-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()); setResult(r); if (r.ok && onDone) onDone(r); } catch { setResult({ ok: false }); }
    setBusy(false);
  }
  const Radio = ({ v, label }) => (
    <label className={"flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm text-[#2f2413] " + (mode === v ? "border-[#2f2413] bg-[#2f2413]/[0.08] font-semibold" : "border-stone-300")}>
      <input type="radio" checked={mode === v} onChange={() => setMode(v)} /> {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#fbf6e9] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-[#2f2413]">🗓️ {t("排一份学习计划")}</h2>
        {!result ? (
          <>
            <p className="mt-1 text-xs text-stone-600">{t("先把这几项定好,我一次给你排出学习进程(排好后在「本周计划表」里可以再改)。")}</p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-[#8a6a2c]">{t("时间要求")}</div>
                {defaults.examDate && !showTimeOpts ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[#2f2413]">
                    <span>📅 {t("按你的考试日期")} <span className="font-semibold">{defaults.examDate}</span> {t("排")}</span>
                    <button onClick={() => setShowTimeOpts(true)} className="text-xs text-[#8a6a2c] underline hover:opacity-80">{t("换个时间要求")}</button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Radio v="deadline" label={t("有考试日期")} />
                    {mode === "deadline" && <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="ml-6 rounded-lg border border-stone-300 px-2 py-1 text-sm text-[#2f2413]" />}
                    <Radio v="until" label={t("想学到某一天")} />
                    {mode === "until" && <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="ml-6 rounded-lg border border-stone-300 px-2 py-1 text-sm text-[#2f2413]" />}
                    <Radio v="weeks" label={t("想用几周学完")} />
                    {mode === "weeks" && <div className="ml-6 flex items-center gap-1 text-sm"><input type="number" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-[#2f2413]" /> {t("周")}</div>}
                    <Radio v="open" label={t("没有时间要求(我来估个大概)")} />
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-[#8a6a2c]">{t("每天大约能学多久(分钟)")}</div>
                <input type="number" min="10" step="10" value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} className="w-28 rounded-lg border border-stone-300 px-2 py-1 text-sm text-[#2f2413]" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-[#8a6a2c]">{t("排哪些天")}</div>
                <div className="space-y-1.5">
                  {[["all", t("每天都排")], ["noweekend", t("跳过周末")], ["custom", t("自定义(选要跳过的日子)")]].map(([v, label]) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-[#2f2413]"><input type="radio" checked={days === v} onChange={() => setDays(v)} /> {label}</label>
                  ))}
                  {days === "custom" && (
                    <div className="ml-6 flex flex-wrap gap-1">
                      {WD.map(([n, label]) => (
                        <button key={n} onClick={() => setSkip((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n])} className={"rounded-full px-2 py-0.5 text-xs ring-1 " + (skip.includes(n) ? "bg-rose-100 text-rose-700 ring-rose-300" : "bg-white text-stone-500 ring-stone-300")}>{label}{skip.includes(n) ? " ✕" : ""}</button>
                      ))}
                      <span className="ml-1 self-center text-[10px] text-stone-400">{t("(标红=跳过)")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-full px-4 py-1.5 text-sm text-stone-500">{t("取消")}</button>
              <button onClick={generate} disabled={busy || (mode === "deadline" && !examDate) || (mode === "until" && !targetDate)} className="rounded-full bg-[#2f2413] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? t("生成中…") : t("生成计划")}</button>
            </div>
          </>
        ) : result.ok ? (
          <div className="mt-3">
            <p className="text-sm text-[#2f2413]">✅ {t("学习计划排好了!")}</p>
            <div className="mt-2 rounded-xl bg-white/60 p-3 text-sm text-stone-700 ring-1 ring-[#e4d5af]">
              {t("共")} {result.unitCount} {t("个知识点,每天约")} {result.perDay} {t("个,到")} <span className="font-semibold">{result.endDate}</span> {t("学完")}{!result.hadDeadline && <> · {t("大概")} <span className="font-semibold">{result.weeksApprox}</span> {t("周")}</>}。
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <a href="/plan" className="rounded-full bg-[#2f2413] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">{t("去看/改计划")}</a>
              <button onClick={onClose} className="rounded-full px-4 py-1.5 text-sm text-stone-500">{t("好")}</button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-rose-600">{result.note || t("没能生成计划。")}</p>
            <div className="mt-4 flex justify-end"><button onClick={() => setResult(null)} className="rounded-full px-4 py-1.5 text-sm text-stone-500">{t("返回")}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
