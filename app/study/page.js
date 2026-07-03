"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useAiFetch } from "@/components/AiErrorDialog";
import SourceBadge from "@/components/SourceBadge";

function StudyInner() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [tree, setTree] = useState(null);
  const [current, setCurrent] = useState(null); // {kp, explanation}
  const [busy, setBusy] = useState(false);

  const kpParam = useSearchParams().get("kp");
  useEffect(() => {
    fetch("/api/kp").then((r) => r.json()).then((d) => {
      setTree(d.tree);
      if (kpParam) {
        for (const ch of d.tree) {
          const hit = ch.points.find((p) => p.id === Number(kpParam));
          if (hit) { open(hit); break; }
        }
      }
    });
  }, []);

  async function open(kp, refresh = false) {
    setBusy(true); setCurrent({ kp, explanation: null });
    try {
      const d = await aiFetch("/api/kp/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kp.id, refresh }) });
      setCurrent({ kp, explanation: d.explanation });
    } catch { setCurrent(null); }
    setBusy(false);
  }

  if (!tree) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  if (!tree.length) return <p className="mt-16 text-center text-stone-400">{t("还没有知识点树,请先完成")}<a href="/onboarding" className="underline">{t("考试设置")}</a>。</p>;

  if (current) {
    const e = current.explanation;
    return (
      <div className="space-y-3 md:mt-14">
        <button className="text-sm text-stone-500" onClick={() => setCurrent(null)}>{t("← 返回知识点列表")}</button>
        <div className="card">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h1 className="text-lg font-bold">{current.kp.title}</h1>
            {e && <SourceBadge sourceType={e.source_type} refs={e.source_refs} />}
          </div>
          {!e ? <p className="mt-4 text-stone-400 animate-pulse">{t("AI 正在准备讲解…")}</p> : (
            <div className="prose-zh mt-3"><ReactMarkdown>{e.content_md}</ReactMarkdown></div>
          )}
        </div>
        {e && (
          <div className="flex gap-2">
            <a className="btn flex-1" href={`/practice?kp=${current.kp.id}`}>{t("✍️ 练几道题检验一下")}</a>
            <button className="btn-ghost" onClick={() => open(current.kp, true)} disabled={busy}>{t("重新讲解")}</button>
          </div>
        )}
      </div>
    );
  }

  const COVER = { covered: "🟢", partial: "🟡", none: "⚪" };
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("学习")}</h1>
      {tree.map((ch) => (
        <div key={ch.id} className="card">
          <h2 className="font-bold mb-2">{ch.title}</h2>
          <div className="space-y-1">
            {ch.points.map((p) => (
              <button key={p.id} onClick={() => open(p)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-stone-50">
                <span>{p.title}</span>
                <span className="text-xs text-stone-400 shrink-0 ml-2">
                  {p.attempts > 0 && `${p.correct}/${p.attempts} · `}{COVER[p.coverage]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-stone-400">{t("🟢 有资料支撑 · 🟡 部分支撑 · ⚪ 无资料(讲解出题靠 AI 记忆,请谨慎)")}</p>
    </div>
  );
}


export default function Study() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>}><StudyInner /></Suspense>;
}
