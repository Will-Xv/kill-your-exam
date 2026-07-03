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
          <div className="animate-in grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-4xl shadow-xl shadow-emerald-500/30">📘</div>
          <h1 className="animate-in d1 mt-6 text-3xl font-black">{t("欢迎!先设置一门考试")}</h1>
          <p className="animate-in d2 mt-3 text-slate-500">{t("还没有设置考试。花 5 分钟告诉我你要考什么,")}{t("我会先坦白我知道什么、不知道什么。")}</p>
          <Link href="/onboarding" className="btn animate-in d3 mt-7 text-base">🚀 {t("开始设置考试")}</Link>
          <p className="animate-in d4 mt-6 text-xs text-slate-400">{t("首次使用请先到")} <Link className="underline" href="/settings">{t("设置")}</Link> {t("填入 AI 密钥")}</p>
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
    { href: "/study", icon: "📖", title: t("学习"), desc: t("看 AI 讲解知识点") },
    { href: "/practice", icon: "✍️", title: t("练习"), desc: t("做题并即时批改") },
    { href: "/mock", icon: "📝", title: t("模拟考"), desc: t("限时全真模拟") },
    { href: "/knowledge", icon: "📊", title: t("掌握度"), desc: t("看各章强弱") },
    { href: "/mistakes", icon: "📕", title: t("错题本"), desc: t("重练做错的题") },
    { href: "/materials", icon: "📚", title: t("资料库"), desc: t("上传/网页采集") },
    { href: "/chat", icon: "💬", title: t("AI 助手"), desc: t("提问、调整计划") },
    { href: "/exams", icon: "🗂️", title: t("我的考试"), desc: t("切换/新建/删除") }
  ];

  return (
    <>
      <Tour />
      {/* hero */}
      <div className="animate-in grad-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-xl">
        <div className="blob absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/30 blur-2xl" />
        <div className="relative flex items-end justify-between">
          <div>
            <Link href="/exams" className="text-2xl font-black tracking-tight hover:underline">{exam.name}</Link>
            {days != null && <p className="mt-1 text-emerald-100">{t("距考试")} <span className="text-4xl font-black text-white">{days}</span> {t("天")}</p>}
          </div>
          {daily && <div className="text-right text-emerald-100 text-sm">🔥 {daily.activeDays} {t("天")}</div>}
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white/10 py-2"><div className="text-xl font-bold">{stats.todayCount}</div><div className="text-[11px] text-emerald-100">{t("今日做题")}</div></div>
          <div className="rounded-2xl bg-white/10 py-2"><div className="text-xl font-bold">{acc == null ? "—" : acc + "%"}</div><div className="text-[11px] text-emerald-100">{t("总正确率")}</div></div>
          <div className="rounded-2xl bg-white/10 py-2"><div className="text-xl font-bold">{stats.matCount}</div><div className="text-[11px] text-emerald-100">{t("资料数")}</div></div>
        </div>
      </div>

      {/* today's plan */}
      <div id="tour-today" className="card animate-in d1 mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">📋 {t("今日任务")}</h2>
          {allDone && <span className="text-sm font-semibold text-emerald-700">{t("全部完成 🎉")}</span>}
        </div>
        {!daily ? <div className="shimmer h-10 rounded-xl" /> : (
          <div className="space-y-1">
            {items.map((it, i) => (
              <Link key={i} href={linkFor(it)} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${it.done ? "text-slate-400" : "hover:bg-slate-50"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${it.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{it.done ? "✓" : i + 1}</span>
                <span className={it.done ? "line-through" : "font-medium"}>{labelFor(it)}</span>
              </Link>
            ))}
          </div>
        )}
        {firstUndone && <Link href={linkFor(firstUndone)} className="btn mt-3 w-full">▶ {t("开始:")}{labelFor(firstUndone)}</Link>}
      </div>

      {/* feature grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {features.map((f, i) => (
          <Link key={f.href} href={f.href} className={`card card-hover animate-in d${(i % 5) + 1} flex flex-col items-start`}>
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 text-xl">{f.icon}</div>
            <div className="mt-2 font-semibold">{f.title}</div>
            <div className="text-xs text-slate-500">{f.desc}</div>
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
        {sugg?.adopted && <p className="mt-2 text-sm text-emerald-700">{t("已采纳,备考策略已更新 ✓")}</p>}
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
