"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18n";

export default function PlanPage() {
  const t = useT();
  const topText = (tt) => !tt ? "" : tt.action === "review" ? `${t("复习")}「${tt.exam}」${t("的到期题")}(${tt.count})` : tt.action === "weak" ? `${t("攻")}「${tt.exam}」${t("的薄弱点")}:${tt.title}` : `${t("练一练")}「${tt.exam}」`;
  const taskText = (tk) => tk.type === "review" ? `🔁 ${t("复习到期题")}(${tk.count})` : tk.type === "kp" ? `🎯 ${tk.title}` : `✏️ ${t("自由练习")}`;
  const [data, setData] = useState(null);
  const [minutes, setMinutes] = useState("");
  const [sprint, setSprint] = useState(false);
  const [review, setReview] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");
  const applyPlan = (mins) => {
    setApplyMsg("");
    fetch("/api/plan/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes: mins ? Number(mins) : (minutes ? Number(minutes) : undefined), mode: sprint ? "sprint" : undefined }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => setApplyMsg(d && d.ok ? t("已采用为今日任务 ✓ 回首页查看") : t("采用失败,稍后再试"))).catch(() => setApplyMsg(t("采用失败,稍后再试")));
  };
  const runReview = () => {
    setReviewBusy(true); setReview(null);
    const q = new URLSearchParams(); if (minutes) q.set("minutes", minutes); if (sprint) q.set("mode", "sprint");
    fetch("/api/plan-review?" + q.toString()).then((r) => (r.ok ? r.json() : null)).then((d) => setReview(d || { err: 1 })).catch(() => setReview({ err: 1 })).finally(() => setReviewBusy(false));
  };
  const load = (m, sp) => {
    const q = new URLSearchParams();
    if (m) q.set("minutes", m);
    if (sp) q.set("mode", "sprint");
    fetch("/api/plan?" + q.toString()).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  };
  // 本周按天排期(类13.3)
  const [weekOpen, setWeekOpen] = useState(false);
  const [weekCaps, setWeekCaps] = useState(["60","60","60","60","60","60","60"]);
  const [weekData, setWeekData] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [variant, setVariant] = useState("conservative");
  const loadCmp = () => { setCmpOpen(true); if (cmp) return; fetch("/api/plan-compare").then((r) => (r.ok ? r.json() : null)).then((d) => setCmp(d || { err: 1 })).catch(() => setCmp({ err: 1 })); };
  const WD = [t("周日"), t("周一"), t("周二"), t("周三"), t("周四"), t("周五"), t("周六")];
  const dayLabel = (i) => { const d = new Date(); d.setDate(d.getDate() + i); return WD[d.getDay()]; };
  const setCap = (i, v) => setWeekCaps((cs) => cs.map((x, j) => (j === i ? v.replace(/\D/g, "") : x)));
  const weekTaskLabel = (top) => !top ? t("练一练") : top.type === "review" ? `${t("复习到期")}${top.count ? ` (${top.count})` : ""}` : top.type === "kp" ? `${t("攻薄弱点:")}${top.title || ""}` : t("自由练习一组");
  const loadWeek = () => {
    const caps = weekCaps.map((x) => parseInt(x, 10) || 0).join(",");
    const q = new URLSearchParams({ week: "1", caps });
    if (sprint) q.set("mode", "sprint");
    fetch("/api/plan?" + q.toString()).then((r) => (r.ok ? r.json() : null)).then(setWeekData).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const exams = data?.exams || [];
  const pct = (e) => (e.kpTotal ? Math.round((e.mastered / e.kpTotal) * 100) : 0);
  const urgencyColor = (d) => d == null ? "text-[#8a7a54]" : d <= 3 ? "text-rose-600" : d <= 10 ? "text-amber-600" : "text-emerald-700";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-[#2f2413]">🗺️ {t("总规划")}</h1>

      {data?.topTask && (
        <div className="rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("今天最该做的一件事")}</div>
          <div className="mt-1 text-lg font-black text-[#5a2d0c]">{topText(data.topTask)}{data.topTask.minutes ? ` · ${data.topTask.minutes}${t("分钟")}` : ""}</div>
        </div>
      )}

      {(data?.warnings || []).length > 0 && (
        <div className="card border-rose-300 bg-rose-50">
          <h2 className="font-bold text-rose-800">⚠️ {t("时间可能不够")}</h2>
          <div className="mt-1 space-y-2">
            {data.warnings.map((w) => (
              <div key={w.examId} className="text-sm text-[#5a2d0c]">
                <span className="font-semibold">{w.name}</span>：{t("要过完薄弱/未学的内容约需")} {w.needHours}{t("小时")}，{w.daysLeft} {t("天里只有")} {w.availHours}{t("小时")}。
                <div className="mt-1 rounded-lg bg-white/70 px-2 py-1.5 text-xs">
                  <a href="/practice?fresh=1" className="font-semibold text-emerald-700 underline">🩺 {t("先花几分钟做个快速能力诊断")} →</a>
                  <span className="text-stone-600"> {t("那些『没学』的点你可能早就会,测完真实差距往往小得多,再重排。")}</span>
                </div>
                <div className="mt-1 rounded-lg bg-white/70 px-2 py-1.5 text-xs">
                  <span className="font-semibold text-[#6b4a25]">⚡ {t("时间紧就别排了,直接上手:")}</span>
                  <a href="/mock" className="ml-1 text-amber-700 underline">🎯 {t("做一次模拟考")}</a>
                  <span className="text-stone-400"> · </span>
                  <a href="/practice?fresh=1" className="text-amber-700 underline">✍️ {t("直接刷题")}</a>
                </div>
                <div className="mt-0.5 text-xs text-stone-600">{t("或:")}①{t("每天学到")} {w.suggestDailyMin} {t("分钟")}；②{w.suggestExtendDays > 0 ? t("或把考试日期后延约") + " " + w.suggestExtendDays + " " + t("天") : t("或砍掉非重点章节、只保最可能考的")}；③{t("或用冲刺模式只攻最薄弱的")}。</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[#6b4a25]">{t("今天总可用")}</span>
        <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} placeholder={String(data?.totalMinutes || 90)} className="w-20 rounded-lg border border-[#e4d5af] bg-white px-2 py-1" inputMode="numeric" />
        <span className="text-[#6b4a25]">{t("分钟")}</span>
        <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={sprint} onChange={(e) => setSprint(e.target.checked)} /> {t("临考冲刺模式")}</label>
        <button className="btn px-3 py-1.5" onClick={() => load(minutes, sprint)}>{t("重新规划")}</button>
        <button className="btn-ghost px-3 py-1.5" disabled={reviewBusy} onClick={runReview}>{reviewBusy ? t("审视中…") : "🔍 " + t("审视这个计划")}</button>
        <button className="btn px-3 py-1.5" onClick={() => applyPlan()}>🗓️ {t("采用到今日任务")}</button>
        {applyMsg && <span className="text-xs font-medium text-emerald-700">{applyMsg}</span>}
      </div>
      {review && (review.review || review.err) && (
        <div className="card border-amber-300 bg-amber-50/60">
          <h2 className="font-bold text-[#2f2413]">🔍 {t("计划自我审视")}</h2>
          {review.err ? <p className="mt-1 text-sm text-stone-500">{t("审视失败,稍后再试。")}</p> : (() => { const v = review.review; return (
            <div className="mt-2 space-y-2 text-sm">
              {v.summary && <div className="rounded-xl bg-white/70 px-3 py-2 font-semibold text-[#5a2d0c]">{v.summary}</div>}
              {v.revisedMinutes ? <button onClick={() => { setMinutes(String(v.revisedMinutes)); load(v.revisedMinutes, sprint); applyPlan(v.revisedMinutes); }} className="btn px-3 py-1.5 text-sm">🔧 {t("按审视优化并采用为今日任务")}（{v.revisedMinutes} {t("分钟")}）</button> : null}
              {v.overScheduled?.over && <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">⏳ {t("排超了")}{review.plannedMinutes ? `（${t("排了")}${review.plannedMinutes}${t("分钟")}／${t("可用")}${review.availableMinutes}${t("分钟")}）` : ""}：{v.overScheduled.detail}</div>}
              {v.trim?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("建议砍掉(低收益)")}</div>{v.trim.map((x, i) => <div key={i} className="mt-1 rounded-xl bg-white/70 px-3 py-1.5"><span className="font-medium">{x.task}</span>{x.why ? <span className="text-stone-500"> — {x.why}</span> : ""}</div>)}</div>}
              {v.generic?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-stone-500">{t("只是通用建议(非你的数据)")}</div><ul className="mt-1 list-disc pl-5 text-stone-600">{v.generic.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              {v.dataBased?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">{t("基于你的真实数据")}</div><ul className="mt-1 list-disc pl-5 text-stone-700">{v.dataBased.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              {v.risks?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-rose-700">{t("风险/假设")}</div><ul className="mt-1 list-disc pl-5 text-stone-700">{v.risks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            </div>
          ); })()}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2f2413]">📆 {t("本周按天排期")}</h2>
          <button onClick={() => setWeekOpen((o) => !o)} className="text-xs text-[#8a7a54] underline">{weekOpen ? t("收起") : t("展开")}</button>
        </div>
        {weekOpen && (
          <>
            <p className="mt-1 text-xs text-[#8a7a54]">{t("每天可用时间不一样?填每天的分钟数,我按紧迫度分配到各天。0 = 休息。")}</p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {weekCaps.map((m, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-[#8a7a54]">{dayLabel(i)}</div>
                  <input value={m} onChange={(e) => setCap(i, e.target.value)} inputMode="numeric" className="w-full rounded-lg border border-[#e4d5af] bg-white px-1 py-1 text-center text-sm" />
                </div>
              ))}
            </div>
            <button className="btn mt-2 px-3 py-1.5" onClick={loadWeek}>{t("排这周")}</button>
            {weekData?.days?.length > 0 && (
              <div className="mt-3 space-y-2">
                {weekData.days.map((d, di) => (
                  <div key={di} className={`rounded-2xl px-3 py-2 ring-1 ring-[#e4d5af] ${d.totalMinutes === 0 ? "bg-[#f3ecda] opacity-70" : "bg-white/60"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#2f2413]">{dayLabel(di)} · {(d.date || "").slice(5)}</span>
                      <span className="text-xs text-[#8a7a54]">{d.totalMinutes === 0 ? t("休息") : d.totalMinutes + t("分钟")}</span>
                    </div>
                    {d.totalMinutes > 0 && (d.exams || []).filter((x) => x.allocMinutes > 0).length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {d.exams.filter((x) => x.allocMinutes > 0).map((x) => (
                          <a key={x.examId} href={x.top?.href || "/plan"} className="flex items-center justify-between text-xs text-[#2f2413] hover:underline">
                            <span className="truncate pr-2">{x.name} · {weekTaskLabel(x.top)}</span>
                            <span className="shrink-0 text-[#8a7a54]">{x.allocMinutes}{t("分钟")}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[#2f2413]">📊 {t("计划版本对比")}</h2>
          <button onClick={() => (cmpOpen ? setCmpOpen(false) : loadCmp())} className="text-xs text-[#8a7a54] underline">{cmpOpen ? t("收起") : t("展开")}</button>
        </div>
        {cmpOpen && !cmp && <p className="mt-2 text-xs text-[#8a7a54]">{t("加载中…")}</p>}
        {cmpOpen && cmp && (
          <div className="mt-2 space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-[#2f2413]">{t("保守 vs 激进(今天)")}</span>
                <div className="flex rounded-full bg-[#f3ecda] p-0.5 text-xs">
                  <button onClick={() => setVariant("conservative")} className={`rounded-full px-2.5 py-0.5 ${variant === "conservative" ? "bg-emerald-600 text-white" : "text-stone-600"}`}>🛡️ {t("保守")}</button>
                  <button onClick={() => setVariant("aggressive")} className={`rounded-full px-2.5 py-0.5 ${variant === "aggressive" ? "bg-rose-600 text-white" : "text-stone-600"}`}>🔥 {t("激进")}</button>
                </div>
              </div>
              {cmp.variants && cmp.variants[variant] ? (
                <div className="space-y-2">
                  <div className="text-xs text-[#8a7a54]">{variant === "conservative" ? t("先清到期+稳固少量薄弱,不铺新内容——稳。") : t("多攻薄弱+铺未学新章节+加练——赶进度。")} · {t("今天覆盖")} {cmp.variants[variant].pointsToday} {t("个点")}</div>
                  {cmp.variants[variant].exams.filter((e) => (e.tasks || []).length).map((e) => (
                    <div key={e.id} className="rounded-2xl bg-white/60 px-3 py-2 ring-1 ring-[#e4d5af]">
                      <div className="flex justify-between text-sm font-semibold text-[#2f2413]"><span>{e.name}</span><span className="text-xs text-[#8a7a54]">{e.allocMinutes}{t("分钟")}</span></div>
                      <div className="mt-1 space-y-0.5">{e.tasks.map((tk, ti) => <a key={ti} href={tk.href} className="flex justify-between text-xs text-[#2f2413] hover:underline"><span className="truncate pr-2">{tk.root && <span className="mr-1 text-rose-600">🔗</span>}{tk.title || tk.label}</span><span className="shrink-0 text-[#8a7a54]">{tk.minutes}{t("分钟")}</span></a>)}</div>
                    </div>
                  ))}
                  {cmp.variants.sharedNote && <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">🔗 {cmp.variants.sharedNote}</div>}
                </div>
              ) : <p className="text-xs text-[#8a7a54]">{t("暂无数据。")}</p>}
            </div>
            <div className="border-t border-[#e4d5af] pt-3">
              <div className="text-sm font-semibold text-[#2f2413]">{t("本周 vs 上周")}</div>
              {cmp.lastWeek ? (
                <div className="mt-1 space-y-1.5 text-xs">
                  <div className="flex flex-wrap gap-1.5">
                    {[["薄弱", cmp.diff.weak], ["未学", cmp.diff.unlearned], ["待复习", cmp.diff.due]].map(([lb, dv]) => (
                      <span key={lb} className={`rounded-full px-2 py-0.5 ring-1 ${dv < 0 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : dv > 0 ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-stone-50 text-stone-500 ring-stone-200"}`}>{t(lb)} {dv > 0 ? "+" + dv : dv}</span>
                    ))}
                  </div>
                  {(cmp.perExam || []).filter((e) => !e.isNew && (e.weakDelta || e.unlearnedDelta)).map((e, i) => (
                    <div key={i} className="text-[#5a4a2a]">{e.name}：{e.weakDelta != null && e.weakDelta !== 0 ? `${t("薄弱")}${e.weakDelta > 0 ? "+" + e.weakDelta : e.weakDelta}` : ""} {e.unlearnedDelta != null && e.unlearnedDelta !== 0 ? `${t("未学")}${e.unlearnedDelta > 0 ? "+" + e.unlearnedDelta : e.unlearnedDelta}` : ""}</div>
                  ))}
                  <div className="text-[#8a7a54]">{t("对比自")} {cmp.lastWeek.weekKey}</div>
                </div>
              ) : <p className="mt-1 text-xs text-[#8a7a54]">{t("还没有上一周的快照——这周先记下,下周就能看到本周 vs 上周的变化了。")}</p>}
            </div>
          </div>
        )}
      </div>

      {exams.length === 0 && <div className="card text-[#8a7a54]">{t("还没有考试。")}</div>}

      <div className="space-y-3">
        {exams.map((e, i) => (
          <div key={e.id} className={`card ${i === 0 ? "ring-2 ring-amber-300" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-[#2f2413]">{e.name}</div>
                <div className={`text-sm font-semibold ${urgencyColor(e.daysLeft)}`}>
                  {e.daysLeft == null ? t("考期未定") : e.daysLeft <= 0 ? t("就是今明天!") : `${e.daysLeft} ${t("天后考")}`}
                </div>
              </div>
              <div className="shrink-0 rounded-2xl bg-[#2f2413] px-3 py-2 text-center text-[#f6efdd]">
                <div className="text-xl font-black">{e.allocMinutes}</div>
                <div className="text-[10px]">{t("建议分钟")}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
              <div><div className="font-black text-[#2f2413]">{pct(e)}%</div><div className="text-[11px] text-[#8a7a54]">{t("掌握")}</div></div>
              <div><div className="font-black text-rose-600">{e.weak}</div><div className="text-[11px] text-[#8a7a54]">{t("薄弱")}</div></div>
              <div><div className="font-black text-amber-600">{e.due}</div><div className="text-[11px] text-[#8a7a54]">{t("待复习")}</div></div>
              <div><div className="font-black text-[#2f2413]">{e.accuracy}%</div><div className="text-[11px] text-[#8a7a54]">{t("正确率")}</div></div>
            </div>
            {e.tasks?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {e.tasks.map((tk, ti) => (
                  <a key={ti} href={tk.href} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm text-[#2f2413] transition hover:bg-white">
                    <span className="truncate pr-2">{tk.root && <span className="mr-1 rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700">🔗{t("根因")}</span>}{taskText(tk)}</span>
                    <span className="shrink-0 text-xs font-semibold text-[#8a7a54]">{tk.minutes}{t("分钟")}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Link href="/" className="btn-ghost inline-block">← {t("返回首页")}</Link>
    </div>
  );
}
