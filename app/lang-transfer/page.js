"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";

const SRC = { l1_negative: "母语负迁移", l2_negative: "二外/其他外语负迁移", target_internal: "目标语内部混淆", careless: "粗心/笔误" };
const SRC_COLOR = { l1_negative: "bg-rose-500", l2_negative: "bg-orange-500", target_internal: "bg-sky-500", careless: "bg-stone-400" };

export default function LangTransferPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [d, setD] = useState(null);
  const [bg, setBg] = useState({ native: "", known: "", target: "" });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState("");
  const [pred, setPred] = useState(null);
  const [topic, setTopic] = useState("");

  const load = () => fetch("/api/lang-transfer").then((r) => r.json()).then((j) => {
    setD(j);
    if (j.background) setBg({ native: j.background.native || "", known: (j.background.known || []).join("、"), target: j.background.target || "" });
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  async function saveBg() {
    setBusy("bg");
    try { await aiFetch("/api/lang-transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "background", background: { native: bg.native, known: bg.known.split(/[,，、]/).map((x) => x.trim()).filter(Boolean), target: bg.target } }) }); setSaved(true); setTimeout(() => setSaved(false), 1500); load(); } catch {}
    setBusy("");
  }
  async function analyze() {
    setBusy("an");
    try { const r = await aiFetch("/api/lang-transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze" }) }); await load(); if (r && r.reason === "no_new_wrong") alert(t("暂时没有新的错题可分析(先去做几道语言题)。")); }
    catch {}
    setBusy("");
  }
  async function predict() {
    if (!topic.trim()) return;
    setBusy("pr"); setPred(null);
    try { const r = await aiFetch("/api/lang-transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "predict", topic }) }); setPred(r); } catch {}
    setBusy("");
  }

  if (!d) return <div className="p-4 text-sm text-stone-400">{t("加载中…")}</div>;
  if (!d.isLanguage) return (
    <div className="space-y-3">
      <h1 className="text-2xl font-black">🌐 {t("三语迁移追踪")}</h1>
      <div className="card text-sm text-stone-600">{t("这个功能面向语言考试。当前考试不是语言类,所以用不上——把考试类型设为「语言考试」后就会出现。")}</div>
    </div>
  );

  const total = d.total || 0;
  return (
    <div className="space-y-4 pb-6">
      <h1 className="text-2xl font-black">🌐 {t("三语迁移追踪")}</h1>

      <div className="card">
        <h2 className="font-bold mb-1">{t("我的语言背景")}</h2>
        <p className="text-xs text-stone-500 mb-2">{t("告诉我你的语言底子,我就能判断错误来自哪门语言的迁移,不用每次重新解释。")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs">{t("母语")}<input value={bg.native} onChange={(e) => setBg({ ...bg, native: e.target.value })} placeholder={t("如 中文")} className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm" /></label>
          <label className="text-xs">{t("已会外语(逗号分隔)")}<input value={bg.known} onChange={(e) => setBg({ ...bg, known: e.target.value })} placeholder={t("如 英语、法语")} className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm" /></label>
          <label className="text-xs">{t("正在学(目标语)")}<input value={bg.target} onChange={(e) => setBg({ ...bg, target: e.target.value })} placeholder={d.examName} className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm" /></label>
        </div>
        <button onClick={saveBg} disabled={busy === "bg"} className="btn mt-2 py-1.5 text-sm">{busy === "bg" ? t("保存中…") : saved ? t("已保存 ✓") : t("保存背景")}</button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{t("迁移错误归因")}</h2>
          <button onClick={analyze} disabled={busy === "an"} className="btn py-1.5 text-sm">{busy === "an" ? t("分析中…") : t("分析我的错题")}</button>
        </div>
        {total > 0 ? (
          <div className="mt-2 space-y-1.5">
            {Object.entries(d.counts).filter(([, n]) => n > 0).map(([k, n]) => (
              <div key={k}>
                <div className="flex justify-between text-xs"><span>{t(SRC[k] || k)}</span><span>{n}</span></div>
                <div className="h-2 rounded-full bg-stone-100"><div className={`h-2 rounded-full ${SRC_COLOR[k]}`} style={{ width: `${(n / total) * 100}%` }} /></div>
              </div>
            ))}
            {(d.recent || []).length > 0 && <div className="mt-2 border-t border-stone-100 pt-2 space-y-1">{d.recent.slice(0, 6).map((r, i) => <div key={i} className="text-xs text-stone-600"><span className={`mr-1 inline-block rounded px-1 text-[10px] text-white ${SRC_COLOR[r.source]}`}>{t(SRC[r.source] || r.source)}</span>{r.note}</div>)}</div>}
          </div>
        ) : <p className="mt-2 text-xs text-stone-500">{t("还没有归因数据。做几道语言题、答错后点「分析我的错题」,我会判断每个错误来自哪门语言的迁移。")}</p>}
      </div>

      {(d.contrast || []).length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="font-bold mb-2">{t("三语对照表")}</h2>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-stone-400"><th className="pb-1 pr-2">{t("意思/点")}</th><th className="pb-1 pr-2">{t("母语直觉")}</th><th className="pb-1 pr-2">{t("已会外语")}</th><th className="pb-1 pr-2">{t("目标语")}</th><th className="pb-1">{t("易踩的坑")}</th></tr></thead>
            <tbody>
              {d.contrast.map((c, i) => (
                <tr key={i} className="border-t border-stone-100 align-top">
                  <td className="py-1 pr-2 font-medium">{c.kind === "positive" ? "🟢 " : ""}{c.concept}</td>
                  <td className="py-1 pr-2 text-stone-500">{c.native || "—"}</td>
                  <td className="py-1 pr-2 text-stone-500">{c.l2 || "—"}</td>
                  <td className="py-1 pr-2 font-semibold text-sky-700">{c.target || "—"}</td>
                  <td className="py-1 text-rose-600">{c.pitfall || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 className="font-bold mb-1">{t("学前预测迁移陷阱")}</h2>
        <p className="text-xs text-stone-500 mb-2">{t("要学某个点之前,我先根据你的语言背景提醒你会踩哪些坑、哪些能借力。")}</p>
        <div className="flex gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && predict()} placeholder={t("如 虚拟式、过去时变位")} className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
          <button onClick={predict} disabled={busy === "pr" || !topic.trim()} className="btn py-1.5 text-sm">{busy === "pr" ? t("预测中…") : t("预测")}</button>
        </div>
        {pred && (
          <div className="mt-3 space-y-2 text-xs">
            {(pred.negatives || []).length > 0 && <div><div className="font-bold uppercase tracking-wide text-rose-700">⚠️ {t("负迁移陷阱")}</div>{pred.negatives.map((x, i) => <div key={i} className="mt-1 rounded-lg bg-rose-50 px-2 py-1"><span className="font-medium">{x.point}</span>{x.from ? <span className="text-stone-500"> · {t("来自")}{x.from}</span> : ""}{x.why ? <div className="text-stone-500">{x.why}</div> : null}</div>)}</div>}
            {(pred.positives || []).length > 0 && <div><div className="font-bold uppercase tracking-wide text-emerald-700">🟢 {t("可借力的正迁移")}</div>{pred.positives.map((x, i) => <div key={i} className="mt-1 rounded-lg bg-emerald-50 px-2 py-1"><span className="font-medium">{x.point}</span>{x.from ? <span className="text-stone-500"> · {t("来自")}{x.from}</span> : ""}{x.why ? <div className="text-stone-500">{x.why}</div> : null}</div>)}</div>}
            {pred.tip && <div className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">💡 {pred.tip}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
