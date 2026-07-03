"use client";
import { useEffect, useState } from "react";

const LEVEL = {
  mastered: ["掌握", "bg-emerald-500"],
  ok: ["一般", "bg-emerald-300"],
  weak: ["薄弱", "bg-red-400"],
  unlearned: ["未学", "bg-stone-200"]
};
const COVER = { covered: "🟢", partial: "🟡", none: "⚪" };

export default function Knowledge() {
  const [matrix, setMatrix] = useState(null);
  useEffect(() => { fetch("/api/mastery").then((r) => r.json()).then((d) => setMatrix(d.matrix)); }, []);
  if (!matrix) return <p className="mt-16 text-center text-stone-400">加载中…</p>;
  const chapters = {};
  for (const kp of matrix) (chapters[kp.chapter || "未分章"] ||= []).push(kp);
  const count = (lv) => matrix.filter((k) => k.level === lv).length;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">掌握度矩阵</h1>
      <div className="card flex justify-around text-center text-sm">
        {Object.entries(LEVEL).map(([k, [label, color]]) => (
          <div key={k}><div className={`mx-auto h-3 w-3 rounded-full ${color} mb-1`} /><b>{count(k)}</b> {label}</div>
        ))}
      </div>
      {Object.entries(chapters).map(([ch, kps]) => (
        <div key={ch} className="card">
          <h2 className="font-bold text-sm mb-2">{ch}</h2>
          <div className="space-y-1">
            {kps.map((kp) => (
              <a key={kp.id} href={`/study?kp=${kp.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${LEVEL[kp.level][1]}`} />
                  {kp.title} <span className="text-xs">{COVER[kp.coverage]}</span>
                </span>
                <span className="text-xs text-stone-400">{kp.attempts ? `${kp.accuracy}% · ${kp.attempts}题` : "—"}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-stone-400">掌握度按作答记录规则计算(近期作答权重更高)。🟢有资料 🟡部分 ⚪无资料。</p>
    </div>
  );
}
