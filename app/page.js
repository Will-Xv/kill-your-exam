"use client";
import { useEffect, useState } from "react";
import Leaderboard from "@/components/Leaderboard";
import Link from "next/link";
import { useT } from "@/components/I18n";
import Tour from "@/components/Tour";

export default function Home() {
  const t = useT();
  const [data, setData] = useState(null);
  const [daily, setDaily] = useState(null);
  const [sugg, setSugg] = useState(null);
  const [suggBusy, setSuggBusy] = useState(false);
  const [weakCount, setWeakCount] = useState(0);
  const [dateOpen, setDateOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => { fetch("/api/inbox").then((r) => r.json()).then((d) => setUnread(d.unread || 0)).catch(() => {}); }, []);
  useEffect(() => {
    fetch("/api/exam").then((r) => r.json()).then(setData);
    fetch("/api/daily").then((r) => r.json()).then(setDaily).catch(() => {});
    fetch("/api/mastery").then((r) => r.json()).then((d) => setWeakCount((d.matrix || []).filter((x) => x.level === "weak" || x.level === "unlearned").length)).catch(() => {});
  }, []);

  async function loadSugg() {
    setSuggBusy(true);
    try { const d = await fetch("/api/strategy").then((r) => r.json()); setSugg(d.suggestion || { none: true }); } catch {}
    setSuggBusy(false);
  }
  async function adopt() {
    await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategyMd: sugg.revised_strategy_md }) });
    setSugg({ adopted: true });
  }

  async function saveDate(v) {
    setDateOpen(false);
    setData((d) => (d ? { ...d, exam: { ...d.exam, exam_date: v || null } } : d));
    try { await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setDate", examId: data?.topExam?.id || data?.exam?.id, examDate: v || null }) }); } catch {}
  }

  async function markComplete() {
    if (!confirm(t("标记为已完成?记录会保留,之后仍可在追杀计划里切换回来。"))) return;
    const eid = data?.topExam?.id || data?.exam?.id;
    try {
      const r = await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", examId: eid }) });
      if (!r.ok) { const tx = await r.text().catch(() => ""); alert(t("标记失败:") + " HTTP " + r.status + " " + tx); return; }
      const d = await r.json().catch(() => ({}));
      if (d && d.ok === false) { alert(t("标记失败:") + " " + (d.error || "")); return; }
      location.reload();
    } catch (e) { alert(t("标记失败:") + " " + ((e && e.message) || e)); }
  }
  async function switchExam(id) {
    if (!id || id === data?.exam?.id) return;
    try { await fetch("/api/exam/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: id }) }); } catch {}
    try { const d = await fetch("/api/exam").then((r) => r.json()); setData(d); } catch {}
    fetch("/api/daily").then((r) => r.json()).then(setDaily).catch(() => {});
  }

  if (!data) return <div className="mx-auto max-w-3xl px-4 pt-6"><div className="shimmer h-40 rounded-3xl" /></div>;

  if (!data.exam) {
    return (
      <>
        <Tour firstTime />
        <div className="mx-auto flex min-h-[75vh] max-w-md flex-col items-center justify-center px-4 text-center">
          <div className="animate-in grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 text-4xl shadow-xl shadow-amber-500/30">📘</div>
          <h1 className="animate-in d1 mt-6 text-3xl font-black">{t("欢迎!先设置一门考试")}</h1>
          <p className="animate-in d2 mt-3 text-[#cdbfa0]">{t("还没有设置考试。花 5 分钟告诉我你要考什么,")}{t("我会先坦白我知道什么、不知道什么。")}</p>
          <Link href="/onboarding" className="btn animate-in d3 mt-7 text-base">🚀 {t("开始设置考试")}</Link>
          <p className="animate-in d4 mt-6 text-xs text-[#9fb09a]">{t("首次使用请先到")} <Link className="underline" href="/settings">{t("设置")}</Link> {t("填入 AI 密钥")}</p>
        </div>
      </>
    );
  }

  const { exam, stats, topExam, subExams, aggregating, aggregateCount } = data;
  const topEx = topExam || exam; // 首页倒计时/完成状态对准“标题显示的那门课”(最顶层考试),而不是当前激活的子考试
  const days = topEx.exam_date ? Math.ceil((new Date(topEx.exam_date) - Date.now()) / 86400000) : null;
  const acc = stats.attemptCount ? Math.round((stats.correctCount / stats.attemptCount) * 100) : null;
  const items = daily?.plan?.items || [];
  const firstUndone = items.find((it) => !it.done);
  const allDone = items.length && !firstUndone;
  const linkFor = (it) => (it.type === "review" ? "/practice?mode=review" : it.type === "kp" ? `/study?kp=${it.kpId}` : "/practice?fresh=1");
  const labelFor = (it) =>
    it.type === "review" ? `${t("重练到期错题")}${it.due ? ` (${it.due})` : ""}` :
    it.type === "kp" ? `${t("学习:")}${it.chapter ? it.chapter + " · " : ""}${it.title}` :
    `${t("自由练习")} (${it.count}/${it.target})`;

  const features = [
    { href: "/study", icon: "📖", title: t("学习"), desc: t("跟 AI 学知识点 + 练习"), grad: "from-amber-400 to-orange-500", tint: "hover:border-amber-300 hover:shadow-amber-500/15", ig: "from-amber-50 to-orange-50" },
    { href: "/mock", icon: "📝", title: t("模拟考"), desc: t("限时全真模拟"), grad: "from-orange-400 to-rose-500", tint: "hover:border-orange-300 hover:shadow-orange-500/15", ig: "from-orange-50 to-rose-50" },
    { href: "/prep", icon: "🎒", title: t("屠杀准备"), desc: t("考务/应试自测"), grad: "from-lime-400 to-green-500", tint: "hover:border-lime-300 hover:shadow-lime-500/15", ig: "from-lime-50 to-green-50" },
    { href: "/mistakes", icon: "📕", title: t("错题本"), desc: t("重练做错的题"), grad: "from-rose-400 to-red-500", tint: "hover:border-rose-300 hover:shadow-rose-500/15", ig: "from-rose-50 to-red-50" },
    { href: "/notes", icon: "📓", title: t("笔记本"), desc: t("收藏的题+随手笔记"), grad: "from-sky-400 to-blue-500", tint: "hover:border-sky-300 hover:shadow-sky-500/15", ig: "from-sky-50 to-blue-50" },
    { href: "/performances", icon: "🎬", title: t("表演回放"), desc: t("回看录像+AI点评,可重做"), grad: "from-fuchsia-400 to-purple-500", tint: "hover:border-fuchsia-300 hover:shadow-fuchsia-500/15", ig: "from-fuchsia-50 to-purple-50" },
    { href: "/inbox", icon: "📬", title: t("收件箱"), desc: t("更新公告与信件"), grad: "from-amber-400 to-orange-500", tint: "hover:border-amber-300 hover:shadow-amber-500/15", ig: "from-amber-50 to-orange-50" },
    { href: "/profile", icon: "🧭", title: t("你的全部杀技"), desc: t("跨考试的你"), grad: "from-violet-400 to-purple-500", tint: "hover:border-violet-300 hover:shadow-violet-500/15", ig: "from-violet-50 to-purple-50" }
  ];

  return (
    <>
      <Tour />
      <Leaderboard />
      {/* hero:浅黄底 + 右上角手绘血刃插画 */}
      <div className="animate-in relative overflow-hidden rounded-3xl p-6 shadow-xl ring-1 ring-[#d9c89b]" style={{ background: "#efe3c4", color: "#2f2413" }}>
        {/* 手机端:手绘血刃(内联 SVG);pad/桌面(md+,含 iPad 竖屏):原来的刺客贴画 */}
        <img src="/illustrations/sticker.png" alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute -right-2 -top-[58px] hidden w-[50%] max-w-[350px] select-none md:block" style={{ filter: "drop-shadow(0 4px 6px rgba(60,40,15,.18))" }} />
        <svg viewBox="0 0 120 170" aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-28 w-auto select-none rotate-[16deg] md:hidden" style={{ filter: "drop-shadow(0 4px 6px rgba(60,40,15,.22))" }}>
          {/* 刀柄 */}
          <rect x="53" y="6" width="14" height="30" rx="4" fill="#6b4a25" stroke="#2f2413" strokeWidth="3" />
          <path d="M56 12 h8 M56 20 h8 M56 28 h8" stroke="#2f2413" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
          <circle cx="60" cy="6" r="5" fill="#2f2413" />
          {/* 护手 */}
          <path d="M38 40 q22 -8 44 0" stroke="#2f2413" strokeWidth="7" fill="none" strokeLinecap="round" />
          {/* 刀身 */}
          <path d="M50 42 L70 42 L64 120 L60 132 L56 120 Z" fill="#c7ccc2" stroke="#2f2413" strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 48 L60 118" stroke="#2f2413" strokeWidth="1.6" opacity=".6" />
          {/* 血:刀身上的血迹 */}
          <path d="M58 70 q7 14 3 34" stroke="#9e140c" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity=".92" />
          {/* 血:刀尖滴落 */}
          <path d="M60 132 q-4 12 0 20 q4 -8 0 -20 Z" fill="#9e140c" />
          <circle cx="60" cy="160" r="4.5" fill="#9e140c" />
          <circle cx="49" cy="150" r="2.6" fill="#9e140c" opacity=".85" />
        </svg>
        <div className="relative z-10">
          {topExam && exam.id !== topExam.id ? (
            <button onClick={() => switchExam(topExam.id)} title={t("点标题回到最顶层考试")} className="block text-left text-2xl font-black tracking-tight hover:underline" style={{ color: "#2f2413" }}>↰ {topExam.name}</button>
          ) : (
            <Link href="/exams" className="block text-2xl font-black tracking-tight hover:underline" style={{ color: "#2f2413" }}>{(topExam && topExam.name) || exam.name}</Link>
          )}
          {aggregating && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#2f2413]/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-[#6b4a25] ring-1 ring-[#dbc999]">🧩 {t("汇总复习")} · {t("含 {n} 门子考试").replace("{n}", aggregateCount)}</div>
          )}
          {subExams && subExams.length > 0 && (
            <div className="mt-2">
              <span className="text-[11px] font-semibold text-[#8a6a2c]">{t("子考试")}:</span>
              <div className="mt-1 flex flex-col gap-1">
                {subExams.map((sx) => {
                  const on = sx.id === exam.id;
                  const direct = sx.depth === 0; // 顶层考试的直接子考试;depth>0 是“子考试的子考试”
                  return (
                    <button key={sx.id} onClick={() => switchExam(sx.id)} title={on ? t("当前考试") : (direct ? t("切换到这个子考试") : t("切换到这个下级子考试"))}
                      style={{ marginLeft: sx.depth * 18 }}
                      className={"inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 font-medium transition " + (direct ? "text-xs" : "text-[11px]") + " " + (on ? " bg-[#2f2413] text-[#f6efdd] ring-1 ring-[#2f2413]" : direct ? " bg-[#3d2b10]/[0.08] text-[#5b431f] ring-1 ring-[#dbc999] hover:brightness-95" : " bg-[#3d2b10]/[0.04] text-[#7a5a2a] ring-1 ring-[#e4d6ac] hover:brightness-95")}>
                      {!direct && <span className="opacity-50">└</span>}{sx.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-1">
            {dateOpen ? (
              <input type="date" autoFocus defaultValue={topEx.exam_date || ""} className="rounded-lg border border-[#d9c89b] bg-white/80 px-2 py-1 text-sm text-[#2f2413]" onChange={(e) => saveDate(e.target.value)} onBlur={() => setDateOpen(false)} />
            ) : topEx.status === "completed" ? null : days != null && days < 0 ? (
              <span className="inline-flex items-center gap-2"><button className="text-left text-[#6b4a25] hover:opacity-80" onClick={() => setDateOpen(true)} title={t("点击修改考试日期")}>📅 {t("考试日期已过")} <span className="text-xs">✎</span></button><button className="rounded-full bg-[#2f2413] px-2.5 py-0.5 text-xs font-medium text-[#f6efdd] hover:opacity-90" onClick={markComplete}>✅ {t("标记为已完成")}</button></span>
            ) : days != null ? (
              <button className="text-left text-[#6b4a25] hover:opacity-80" onClick={() => setDateOpen(true)} title={t("点击修改考试日期")}>{t("距猎杀")} <span className="text-4xl font-black text-[#2f2413]">{days}</span> {t("天")} <span className="text-xs">✎</span>{daily && <span className="ml-2 text-sm text-[#8a6a2c]">· 🔥 {daily.activeDays} {t("天")}</span>}</button>
            ) : (
              <button className="rounded-lg bg-[#2f2413] px-3 py-1 text-sm font-medium text-[#f6efdd]" onClick={() => setDateOpen(true)}>📅 {t("设置考试日期")}</button>
            )}
          </div>
        </div>
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-[#3d2b10]/[0.06] py-2 ring-1 ring-[#dbc999]"><div className="text-xl font-bold">{stats.todayCount}</div><div className="text-[11px] text-[#7a5a2a]">{t("今日做题")}</div></div>
          <div className="rounded-2xl bg-[#3d2b10]/[0.06] py-2 ring-1 ring-[#dbc999]"><div className="text-xl font-bold">{acc == null ? "—" : acc + "%"}</div><div className="text-[11px] text-[#7a5a2a]">{t("总正确率")}</div></div>
          <Link href="/materials" className="block rounded-2xl py-2 ring-1 ring-black/10 transition hover:brightness-110" style={{ background: "rgba(47,36,19,.78)" }}><div className="text-xl font-bold text-[#f6efdd]" style={{ textShadow: "0 1px 3px rgba(0,0,0,.65)" }}>{stats.matCount}</div><div className="text-[11px] text-[#ecdcb6]" style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>{t("资料数")}</div></Link>
        </div>
      </div>

      {days != null && days >= 0 && days < 7 && (
        <div className="animate-in card mt-4 border border-red-300 bg-red-50/80">
          <p className="font-semibold text-red-700">⏰ {t("距猎杀不到一周了!")}</p>
          <p className="mt-1 text-sm text-slate-600">{t("建议现在:到「学习」页自查还欠缺/薄弱的知识点,并做一次全真模拟考,查漏补缺。")}{weakCount > 0 ? `(${t("目前还有")} ${weakCount} ${t("个薄弱/未学的知识点")})` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/study" className="btn py-2 text-sm">🔎 {t("去学习页自查")}</Link>
            <Link href="/mock" className="btn-ghost py-2 text-sm">📝 {t("去模拟考")}</Link>
          </div>
        </div>
      )}

      {/* today's plan */}
      <div id="tour-today" className="card animate-in d1 mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">📋 {t("今日任务")}</h2>
          {allDone && <span className="text-sm font-semibold text-amber-700">{t("全部完成 🎉")}</span>}
        </div>
        {!daily ? <div className="shimmer h-10 rounded-xl" /> : (
          <div className="space-y-1">
            {items.map((it, i) => (
              <Link key={i} href={linkFor(it)} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${it.done ? "text-slate-400" : "hover:bg-slate-50"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${it.done ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300"}`}>{it.done ? "✓" : i + 1}</span>
                <span className={it.done ? "line-through" : "font-medium"}>{labelFor(it)}</span>
              </Link>
            ))}
          </div>
        )}
        {firstUndone && <Link href={linkFor(firstUndone)} className="btn mt-3 w-full">▶ {t("开始:")}{labelFor(firstUndone)}</Link>}
      </div>

      {/* feature grid */}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-[#e8c987]">{t("更多功能")}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {features.map((f, i) => (
          <Link key={f.href} href={f.href} className={`group relative overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#f5eed6] p-4 shadow-sm text-[#2f2413] transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${f.tint} animate-in d${(i % 5) + 1} flex flex-col items-start`}>
            <div className={`absolute -right-6 -top-6 h-16 w-16 rounded-full bg-gradient-to-br ${f.grad} opacity-10 blur-xl transition-opacity group-hover:opacity-25`} />
            <div className={`relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${f.ig} text-xl shadow-inner`}>{f.icon}</div>
            {f.href === "/inbox" && unread > 0 && <span className="absolute right-3 top-3 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{unread}</span>}
            <div className="relative mt-2 font-semibold">{f.title}</div>
            <div className="relative text-xs text-slate-500">{f.desc}</div>
            <div className={`relative mt-2 h-1 w-8 rounded-full bg-gradient-to-r ${f.grad} opacity-70`} />
          </Link>
        ))}
      </div>

      {/* AI strategy */}
      <div className="card animate-in mt-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm">🎯 {t("AI 策略建议")}</h2>
            <p className="text-xs text-slate-400">{t("AI 读你的进度,给出该补哪、该省哪的建议")}</p>
          </div>
          {!sugg && <button className="btn-ghost py-2 text-xs" onClick={loadSugg} disabled={suggBusy}>{suggBusy ? t("分析中…") : t("看看我的进度建议")}</button>}
        </div>
        {sugg?.none && <p className="mt-2 text-sm text-slate-400">{t("先做一些练习,AI 才能根据你的表现给建议。")}</p>}
        {sugg?.adopted && <p className="mt-2 text-sm text-amber-700">{t("已采纳,备考策略已更新 ✓")}</p>}
        {sugg?.suggestions && (
          <div className="mt-2 space-y-2">
            <ul className="list-disc pl-5 text-sm text-slate-600">{sugg.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <button className="btn w-full py-2 text-sm" onClick={adopt}>{t("采纳并更新备考策略")}</button>
          </div>
        )}
      </div>

      {stats.matCount === 0 && (
        <Link href="/materials" className="card animate-in mt-4 block border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">⚠️ {t("⚠️ 资料库还是空的,AI 只能凭记忆讲课,准确性没保障。")}<b>{t("强烈建议先上传资料")}</b></p>
        </Link>
      )}
    </>
  );
}
