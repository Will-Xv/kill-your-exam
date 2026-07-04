"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";

function Chips({ title, items, tone }) {
  if (!items || !items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-stone-500">{title}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((x, i) => <span key={i} className={`rounded-full px-2.5 py-1 text-xs ${tone}`}>{x}</span>)}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const t = useT();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const load = () => fetch("/api/profile/overall").then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, []);

  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch("/api/profile/overall", { method: "POST" });
      const d = await r.json();
      if (d.ai) setData((p) => ({ ...p, ai: d.ai }));
    } catch {}
    setBusy(false);
  }

  async function syncTo(examId) {
    setSyncMsg("");
    try {
      const r = await fetch("/api/profile/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId }) });
      const d = await r.json();
      setSyncMsg(r.ok ? t("已同步到") + " " + d.examName + " " + t("的进度档案 ✓") : t("同步失败"));
      if (r.ok) setSyncOpen(false);
    } catch { setSyncMsg(t("同步失败")); }
  }

  if (!data) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  const ai = data.ai;

  return (
    <div className="space-y-4 md:mt-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🧭 {t("整体画像")}</h1>
        <button className="btn text-sm py-2" onClick={refresh} disabled={busy || !data.exams.length}>{busy ? t("分析中…") : ai ? t("刷新画像") : t("生成画像")}</button>
      </div>
      <p className="text-xs text-stone-400">{t("把你所有考试的表现放在一起看:哪些强项能跨考试迁移,哪些薄弱点反复出现。")}</p>

      {data.exams.length === 0 && <p className="card text-center text-stone-400">{t("还没有考试数据。先去做几道题吧。")}</p>}

      {data.exams.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.exams.map((e) => (
            <div key={e.id} className="card">
              <p className="font-bold">{e.name} {e.type && <span className="badge-material">{e.type}</span>}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                <div><b>{e.done}</b><div className="text-xs text-stone-400">{t("做题")}</div></div>
                <div><b>{e.accuracy}%</b><div className="text-xs text-stone-400">{t("正确率")}</div></div>
                <div><b>{e.activeDays}</b><div className="text-xs text-stone-400">{t("活跃天数")}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.overlap.length > 0 && (
        <div className="card">
          <p className="font-semibold">🔗 {t("跨考试重叠的能力")}</p>
          <p className="text-xs text-stone-400">{t("这些知识点在多门考试里都用到,练一次多处受益。")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.overlap.map((o, i) => (
              <span key={i} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700" title={o.exams.join(" · ")}>{o.title}</span>
            ))}
          </div>
        </div>
      )}

      {ai ? (
        <div className="card space-y-3">
          <p className="text-sm">{ai.summary}</p>
          <Chips title={t("强项")} items={ai.strengths} tone="bg-emerald-50 text-emerald-700" />
          <Chips title={t("薄弱")} items={ai.weaknesses} tone="bg-rose-50 text-rose-700" />
          <Chips title={t("学习习惯")} items={ai.habits} tone="bg-stone-100 text-stone-600" />
          {ai.transferable?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-stone-500">{t("可迁移的能力")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{ai.transferable.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {ai.advice?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-stone-500">{t("整体建议")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{ai.advice.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <p className="text-[10px] text-stone-300">{t("生成于")} {ai.generatedAt?.slice(0, 16).replace("T", " ")}</p>
          <div className="border-t border-stone-100 pt-3">
            {!syncOpen ? (
              <button className="btn-ghost text-sm" onClick={() => { setSyncOpen(true); setSyncMsg(""); }}>📎 {t("同步到考试")}</button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-stone-500">{t("把这份画像写进哪个考试的进度档案?")}</p>
                <div className="flex flex-wrap gap-2">
                  {data.exams.map((e) => (
                    <button key={e.id} className="btn-ghost text-sm" onClick={() => syncTo(e.id)}>{e.name}</button>
                  ))}
                  <button className="text-sm text-stone-400 underline" onClick={() => setSyncOpen(false)}>{t("取消")}</button>
                </div>
              </div>
            )}
            {syncMsg && <p className="mt-2 text-sm text-emerald-700">{syncMsg}</p>}
          </div>
        </div>
      ) : data.exams.length > 0 ? (
        <p className="card text-center text-sm text-stone-400">{t("点上面「生成画像」,让 AI 综合你所有考试给一份整体评估。")}</p>
      ) : null}
    </div>
  );
}
