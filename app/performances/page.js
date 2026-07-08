"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";

// 回放:给定音乐题录制时没开麦克风,这里把原配乐同步叠加进来一起放
function Replay({ videoUrl, musicUrl, t }) {
  const vref = useRef(null), aref = useRef(null);
  const sync = () => { const v = vref.current, a = aref.current; if (v && a) { if (Math.abs(a.currentTime - v.currentTime) > 0.25) a.currentTime = v.currentTime; } };
  const onPlay = () => { const v = vref.current, a = aref.current; if (a && v) { a.currentTime = v.currentTime; a.play().catch(() => {}); } };
  const onPause = () => { aref.current && aref.current.pause(); };
  return (
    <div>
      <video ref={vref} controls playsInline preload="metadata" onPlay={onPlay} onPause={onPause} onSeeked={sync} onTimeUpdate={sync}
        className="w-full max-h-80 rounded-xl bg-black" src={videoUrl} />
      {musicUrl && <audio ref={aref} src={musicUrl} preload="auto" />}
      {musicUrl && <p className="mt-1 text-xs text-amber-700">🎵 {t("回放已叠加原配乐(录制时未收音,这是题目给的原曲)")}</p>}
    </div>
  );
}

export default function Performances() {
  const t = useT();
  const [items, setItems] = useState(null);
  useEffect(() => { (async () => {
    try { const r = await fetch("/api/perform/history", { credentials: "include" }); const d = await r.json(); setItems(d.items || []); }
    catch { setItems([]); }
  })(); }, []);

  const scoreColor = (s) => s >= 75 ? "text-emerald-600" : s >= 60 ? "text-amber-600" : "text-red-500";

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      <h1 className="text-xl font-bold">🎬 {t("表演回放")}</h1>
      <p className="mt-1 text-sm text-stone-500">{t("你每次录音/录像作答的录像和 AI 点评都存在这里,随时回看当时的状态,也可以重做。")}</p>

      {items === null && <p className="mt-16 text-center text-stone-400 animate-pulse">{t("加载中…")}</p>}
      {items && items.length === 0 && <p className="mt-16 text-center text-stone-400">{t("还没有表演记录。去练习页做一道录音/录像题吧。")}</p>}

      <div className="mt-4 space-y-4">
        {items && items.map((it) => (
          <div key={it.attemptId} className="card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-stone-400">{it.created_at}</span>
              <span className={`font-bold ${scoreColor(it.score)}`}>{Math.round(it.score)} {t("分")}</span>
            </div>
            {it.stem && <p className="mt-1 text-sm font-medium">{it.stem}</p>}
            {it.hasRecording
              ? <div className="mt-2"><Replay t={t} videoUrl={`/api/perform/recording?attemptId=${it.attemptId}`} musicUrl={it.musicMaterialId ? `/api/materials/raw?id=${it.musicMaterialId}` : null} /></div>
              : <p className="mt-2 text-xs text-stone-400">{t("(这次的录像已不在了)")}</p>}
            {it.feedback && <div className="mt-2 text-sm"><MD>{String(it.feedback).replace(/\\r\\n|\\r|\\n/g, "\n")}</MD></div>}
            <div className="mt-2">
              {it.questionExists
                ? <a href={`/practice?q=${it.questionId}&fresh=1`} className="btn-ghost text-sm py-1.5 px-3">↺ {t("重做这道题")}</a>
                : <span className="text-xs text-stone-400">{t("这道题已被删除,无法重做")}</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
