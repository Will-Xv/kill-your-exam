"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch("/api/exam").then((r) => r.json()).then(setData); }, []);
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
  const acc = stats.attemptCount ? Math.round((stats.correctCount / stats.attemptCount) * 100) : null;
  return (
    <div className="space-y-4 md:mt-14">
      <div className="card bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0">
        <h1 className="text-xl font-bold">{exam.name}</h1>
        {days != null && <p className="mt-1 text-emerald-100">距离考试还有 <span className="text-3xl font-bold text-white">{days}</span> 天</p>}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card"><div className="text-2xl font-bold">{stats.todayCount}</div><div className="text-xs text-stone-500">今日做题</div></div>
        <div className="card"><div className="text-2xl font-bold">{acc == null ? "—" : acc + "%"}</div><div className="text-xs text-stone-500">总正确率</div></div>
        <div className="card"><div className="text-2xl font-bold">{stats.matCount}</div><div className="text-xs text-stone-500">资料数</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/study" className="card hover:border-emerald-400 transition"><div className="text-2xl mb-1">📖</div><div className="font-semibold">学知识点</div><div className="text-xs text-stone-500">讲解 + 即时小题</div></Link>
        <Link href="/practice" className="card hover:border-emerald-400 transition"><div className="text-2xl mb-1">✍️</div><div className="font-semibold">做练习</div><div className="text-xs text-stone-500">自动挑薄弱点出题</div></Link>
      </div>
      {stats.matCount === 0 && (
        <Link href="/materials" className="card block border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">⚠️ 资料库还是空的。现在讲解和出题只能靠 AI 的记忆,准确性没有保障。<b>强烈建议先上传资料</b>(大纲、教材、规范文件都行)。</p>
        </Link>
      )}
      <Link href="/chat" className="card block hover:border-emerald-400 transition">
        <p className="text-sm">💬 有任何想法直接说,比如:"我觉得第三章我很熟了""每天时间改成 40 分钟""帮我搜一下最新的考试公告"</p>
      </Link>
    </div>
  );
}
