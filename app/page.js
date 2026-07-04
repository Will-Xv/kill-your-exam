"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18n";
import Tour from "@/components/Tour";

export default function Home() {
  const t = useT();
  const [data, setData] = useState(null);
  const [daily, setDaily] = useState(null);
  const [sugg, setSugg] = useState(null);
  const [suggBusy, setSuggBusy] = useState(false);
  useEffect(() => {
    fetch("/api/exam").then((r) => r.json()).then(setData);
    fetch("/api/daily").then((r) => r.json()).then(setDaily).catch(() => {});
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

  const { exam, stats } = data;
  const days = exam.exam_date ? Math.ceil((new Date(exam.exam_date) - Date.now()) / 86400000) : null;
  const acc = stats.attemptCount ? Math.round((stats.correctCount / stats.attemptCount) * 100) : null;
  const items = daily?.plan?.items || [];
  const firstUndone = items.find((it) => !it.done);
  const allDone = items.length && !firstUndone;
  const linkFor = (it) => (it.type === "review" ? "/practice?mode=review" : it.type === "kp" ? `/study?kp=${it.kpId}` : "/practice");
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
    { href: "/profile", icon: "🧭", title: t("你的全部杀技"), desc: t("跨考试的你"), grad: "from-violet-400 to-purple-500", tint: "hover:border-violet-300 hover:shadow-violet-500/15", ig: "from-violet-50 to-purple-50" }
  ];

  return (
    <>
      <Tour />
      {/* hero:浅黄底 + 右上角手绘血刃插画 */}
      <div className="animate-in relative overflow-hidden rounded-3xl p-6 shadow-xl ring-1 ring-[#d9c89b]" style={{ background: "#efe3c4", color: "#2f2413" }}>
        {/* 手绘刺客贴纸(墨线+一点血),集中右上角 */}
        <img src="/illustrations/sticker.png" alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute -right-2 -top-[58px] w-[50%] max-w-[350px] select-none" style={{ filter: "drop-shadow(0 4px 6px rgba(60,40,15,.18))" }} />
        <div className="relative z-10">
          <Link href="/exams" className="text-2xl font-black tracking-tight hover:underline" style={{ color: "#2f2413" }}>{exam.name}</Link>
          {days != null && <p className="mt-1 text-[#6b4a25]">{t("距猎杀")} <span className="text-4xl font-black text-[#2f2413]">{days}</span> {t("天")}{daily && <span className="ml-2 text-sm text-[#8a6a2c]">· 🔥 {daily.activeDays} {t("天")}</span>}</p>}
        </div>
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-[#3d2b10]/[0.06] py-2 ring-1 ring-[#dbc999]"><div className="text-xl font-bold">{stats.todayCount}</div><div className="text-[11px] text-[#7a5a2a]">{t("今日做题")}</div></div>
          <div className="rounded-2xl bg-[#3d2b10]/[0.06] py-2 ring-1 ring-[#dbc999]"><div className="text-xl font-bold">{acc == null ? "—" : acc + "%"}</div><div className="text-[11px] text-[#7a5a2a]">{t("总正确率")}</div></div>
          <Link href="/materials" className="block rounded-2xl bg-[#2f2413]/72 py-2 ring-1 ring-[#2f2413]/30 transition hover:bg-[#2f2413]/85"><div className="text-xl font-bold text-[#f6efdd]" style={{ textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>{stats.matCount}</div><div className="text-[11px] text-[#ecdcb6]" style={{ textShadow: "0 1px 2px rgba(0,0,0,.55)" }}>{t("资料数")}</div></Link>
        </div>
      </div>

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
