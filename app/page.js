"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const t = useT();
  const [data, setData] = useState(null);
  const [daily, setDaily] = useState(null);
  const [sugg, setSugg] = useState(null);
  const [suggBusy, setSuggBusy] = useState(false);
  useEffect(() => {
    fetch("/api/exam").then((r) => r.json()).then(setData);
    fetch("/api/daily").then((r) => r.json()).then(setDaily);
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
  if (!data) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  if (!data.exam) {
    return (
      <div className="mt-16 text-center space-y-4">
        <div className="text-5xl">📘</div>
        <h1 className="text-2xl font-bold">{t("AI 备考助手")}</h1>
        <p className="text-stone-500">{t("还没有设置考试。花 5 分钟告诉我你要考什么,")}<br />{t("我会先坦白我知道什么、不知道什么。")}</p>
        <Link href="/onboarding" className="btn">{t("开始设置考试")}</Link>
        <p className="text-xs text-stone-400 mt-6">{t("首次使用请先到")}<Link className="underline" href="/settings">{t("设置")}</Link>{t("填入 AI 密钥")}</p>
      </div>
    );
  }
  const { exam, stats } = data;
  const days = exam.exam_date ? Math.ceil((new Date(exam.exam_date) - Date.now()) / 86400000) : null;
  const items = daily?.plan?.items || [];
  const allDone = items.length && items.every((it) => it.done);
  const firstUndone = items.find((it) => !it.done);
  const linkFor = (it) => (it.type === "review" ? "/practice?mode=review" : it.type === "kp" ? `/study?kp=${it.kpId}` : "/practice");
  const labelFor = (it) =>
    it.type === "review" ? `${t("重练到期错题")}${it.due ? ` (${it.due})` : ""}` :
    it.type === "kp" ? `${t("学习:")}${it.chapter ? it.chapter + " · " : ""}${it.title}` :
    `${t("自由练习")} (${it.count}/${it.target})`;

  return (
    <div className="space-y-4 md:mt-14">
      <div className="card bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0">
        <div className="flex items-end justify-between">
          <div>
            <a href="/exams" className="text-xl font-bold underline decoration-emerald-300/50 decoration-2 underline-offset-4">{exam.name}</a>
            {days != null && <p className="mt-1 text-emerald-100">{t("距考试")}<span className="text-3xl font-bold text-white">{days}</span>{t("天")}</p>}
          </div>
          {daily && <p className="text-emerald-100 text-sm">{t("已学")} {daily.activeDays} {t("天")}</p>}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">{t("📋 今日任务")}</h2>
          {allDone ? <span className="text-emerald-700 text-sm font-medium">{t("全部完成 🎉")}</span> : null}
        </div>
        {!daily ? <p className="text-stone-400 text-sm">{t("生成中…")}</p> : (
          <div className="space-y-1">
            {items.map((it, i) => (
              <Link key={i} href={linkFor(it)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${it.done ? "text-stone-400" : "hover:bg-stone-50"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${it.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300"}`}>
                  {it.done ? "✓" : i + 1}
                </span>
                <span className={it.done ? "line-through" : "font-medium"}>{labelFor(it)}</span>
              </Link>
            ))}
          </div>
        )}
        {firstUndone && <Link href={linkFor(firstUndone)} className="btn w-full mt-3">{t("开始:")}{labelFor(firstUndone)}</Link>}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Link href="/knowledge" className="card hover:border-emerald-400 transition"><div className="text-lg">📊</div><div className="text-xs text-stone-500 mt-1">{t("掌握度")}</div></Link>
        <Link href="/mistakes" className="card hover:border-emerald-400 transition"><div className="text-lg">📕</div><div className="text-xs text-stone-500 mt-1">{t("错题本")}</div></Link>
        <Link href="/chat" className="card hover:border-emerald-400 transition"><div className="text-lg">💬</div><div className="text-xs text-stone-500 mt-1">{t("找管家聊聊")}</div></Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/mock" className="card hover:border-emerald-400 transition text-center"><div className="text-lg">📝</div><div className="text-xs text-stone-500 mt-1">{t("模拟考")}</div></Link>
        <Link href="/exams" className="card hover:border-emerald-400 transition text-center"><div className="text-lg">🗂️</div><div className="text-xs text-stone-500 mt-1">{t("我的考试")}</div></Link>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">🎯 {t("AI 策略建议")}</h2>
          {!sugg && <button className="btn-ghost py-1.5 text-xs" onClick={loadSugg} disabled={suggBusy}>{suggBusy ? t("分析中…") : t("看看我的进度建议")}</button>}
        </div>
        {sugg?.none && <p className="text-sm text-stone-400 mt-2">{t("先做一些练习,AI 才能根据你的表现给建议。")}</p>}
        {sugg?.adopted && <p className="text-sm text-emerald-700 mt-2">{t("已采纳,备考策略已更新 ✓")}</p>}
        {sugg?.suggestions && (
          <div className="mt-2 space-y-2">
            <ul className="list-disc pl-5 text-sm text-stone-600">{sugg.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <button className="btn w-full py-2 text-sm" onClick={adopt}>{t("采纳并更新备考策略")}</button>
          </div>
        )}
      </div>
      {stats.matCount === 0 && (
        <Link href="/materials" className="card block border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">{t("⚠️ 资料库还是空的,AI 只能凭记忆讲课,准确性没保障。")}<b>{t("强烈建议先上传资料")}</b>。</p>
        </Link>
      )}
    </div>
  );
}
