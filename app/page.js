"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [data, setData] = useState(null);
  const [daily, setDaily] = useState(null);
  useEffect(() => {
    fetch("/api/exam").then((r) => r.json()).then(setData);
    fetch("/api/daily").then((r) => r.json()).then(setDaily);
  }, []);
  if (!data) return <p className="mt-16 text-center text-stone-400">加载中…</p>;
  if (!data.exam) {
    return (
      <div className="mt-16 text-center space-y-4">
        <div className="text-5xl">📘</div>
        <h1 className="text-2xl font-bold">AI 备考助手</h1>
        <p className="text-stone-500">还没有设置考试。花 5 分钟告诉我你要考什么,<br />我会先坦白我知道什么、不知道什么。</p>
        <Link href="/onboarding" className="btn">开始设置考试</Link>
        <p className="text-xs text-stone-400 mt-6">首次使用请先到 <Link className="underline" href="/settings">设置</Link> 填入 AI 密钥</p>
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
    it.type === "review" ? `重练到期错题${it.due ? `(${it.due} 道)` : ""}` :
    it.type === "kp" ? `学习:${it.chapter ? it.chapter + " · " : ""}${it.title}` :
    `自由练习(今日 ${it.count}/${it.target} 题)`;

  return (
    <div className="space-y-4 md:mt-14">
      <div className="card bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold">{exam.name}</h1>
            {days != null && <p className="mt-1 text-emerald-100">距考试 <span className="text-3xl font-bold text-white">{days}</span> 天</p>}
          </div>
          {daily && <p className="text-emerald-100 text-sm">已学 {daily.activeDays} 天</p>}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">📋 今日任务</h2>
          {allDone ? <span className="text-emerald-700 text-sm font-medium">全部完成 🎉</span> : null}
        </div>
        {!daily ? <p className="text-stone-400 text-sm">生成中…</p> : (
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
        {firstUndone && <Link href={linkFor(firstUndone)} className="btn w-full mt-3">开始:{labelFor(firstUndone)}</Link>}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Link href="/knowledge" className="card hover:border-emerald-400 transition"><div className="text-lg">📊</div><div className="text-xs text-stone-500 mt-1">掌握度</div></Link>
        <Link href="/mistakes" className="card hover:border-emerald-400 transition"><div className="text-lg">📕</div><div className="text-xs text-stone-500 mt-1">错题本</div></Link>
        <Link href="/chat" className="card hover:border-emerald-400 transition"><div className="text-lg">💬</div><div className="text-xs text-stone-500 mt-1">找管家聊聊</div></Link>
      </div>

      {stats.matCount === 0 && (
        <Link href="/materials" className="card block border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">⚠️ 资料库还是空的,AI 只能凭记忆讲课,准确性没保障。<b>强烈建议先上传资料</b>。</p>
        </Link>
      )}
    </div>
  );
}
