"use client";
import { useEffect, useState } from "react";

export default function Mistakes() {
  const [list, setList] = useState(null);
  const load = () => fetch("/api/mistakes").then((r) => r.json()).then((d) => setList(d.mistakes));
  useEffect(() => { load(); }, []);
  async function resolve(id) {
    await fetch("/api/mistakes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: id }) });
    load();
  }
  if (!list) return <p className="mt-16 text-center text-stone-400">加载中…</p>;
  return (
    <div className="space-y-3 md:mt-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">错题本</h1>
        <a className="btn-ghost text-sm py-2" href="/practice?mode=review">✍️ 重练到期错题</a>
      </div>
      {!list.length && <p className="text-center text-stone-400 py-10">没有错题,漂亮!答错的题会自动收进来,按 1/3/7/15/30 天安排重练。</p>}
      {list.map((m) => (
        <div key={m.id} className="card">
          <div className="flex justify-between gap-2 text-xs text-stone-400 mb-1">
            <span>{m.kp_title || ""}</span>
            <span>{m.due_date ? `下次重练:${m.due_date}` : "已完成重练周期"}</span>
          </div>
          <p className="text-sm font-medium whitespace-pre-wrap">{m.body.stem}</p>
          <p className="text-sm mt-2"><span className="text-red-600">你的答案:{m.user_answer || "(空)"}</span> · 正确:{m.answer.answer}</p>
          <details className="text-sm text-stone-600 mt-1"><summary className="cursor-pointer text-stone-400">解析</summary>{m.answer.explanation}</details>
          <button className="text-xs text-stone-400 underline mt-2" onClick={() => resolve(m.id)}>我已理解,移出错题本</button>
        </div>
      ))}
    </div>
  );
}
