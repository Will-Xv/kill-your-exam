"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";
import SourceBadge from "@/components/SourceBadge";

function StudyInner() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [tree, setTree] = useState(null);
  const [levels, setLevels] = useState({});
  const [levelCounts, setLevelCounts] = useState({});
  const [insights, setInsights] = useState([]);
  const [current, setCurrent] = useState(null); // {kp, explanation}
  const [busy, setBusy] = useState(false);
  const [rbOpen, setRbOpen] = useState(false);
  const [rbBusy, setRbBusy] = useState(false);
  const [rbMsg, setRbMsg] = useState("");

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
    fetch("/api/mastery").then((r) => r.json()).then((d) => {
      const lv = {}; const cnt = { mastered: 0, ok: 0, weak: 0, unlearned: 0 };
      (d.matrix || []).forEach((m) => { lv[m.id] = m.level; cnt[m.level] = (cnt[m.level] || 0) + 1; });
      setLevels(lv); setLevelCounts(cnt); setInsights(d.insights || []);
    }).catch(() => {});
  }, []);

  async function open(kp, refresh = false) {
    setBusy(true); setCurrent({ kp, explanation: null });
    try {
      const d = await aiFetch("/api/kp/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kp.id, refresh }) });
      setCurrent({ kp, explanation: d.explanation });
    } catch { setCurrent(null); }
    setBusy(false);
  }

  async function rebuild(mode) {
    setRbBusy(true); setRbMsg(t("重建中…(可能要一会儿,别关页面)"));
    try {
      const r = await aiFetch("/api/kp/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      if (r.ok) { setRbMsg(t("重建完成")); setTimeout(() => window.location.reload(), 600); return; }
      setRbMsg(r.error || "error");
    } catch { setRbMsg("error"); }
    setRbBusy(false);
  }
  const rebuildModal = rbOpen ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => !rbBusy && setRbOpen(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">🌳 {t("重建知识点树")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("重建会重新生成整个知识点树。你已有的做题记录和掌握度怎么处理?")}</p>
        <div className="mt-3 space-y-2">
          <button className="btn-ghost w-full text-left text-sm ring-1 ring-slate-200" disabled={rbBusy} onClick={() => rebuild("keep")}>✅ <b>{t("完全保留")}</b> — {t("把旧记录与掌握度按语义迁移到新知识点")}</button>
          <button className="btn-ghost w-full text-left text-sm ring-1 ring-slate-200" disabled={rbBusy} onClick={() => rebuild("summarize")}>📝 <b>{t("总结后重插")}</b> — {t("把旧表现浓缩成观察挂到新知识点,清掉原始做题记录")}</button>
          <button className="btn-ghost w-full text-left text-sm ring-1 ring-red-200 text-red-600" disabled={rbBusy} onClick={() => rebuild("none")}>🗑 <b>{t("全部清空")}</b> — {t("清掉做题记录与观察,干净重来(题库保留)")}</button>
          <button className="btn-ghost w-full text-sm text-slate-500" disabled={rbBusy} onClick={() => setRbOpen(false)}>← {t("取消操作(不重建)")}</button>
        </div>
        {rbMsg && <p className="mt-2 text-sm text-amber-700">{rbMsg}</p>}
      </div>
    </div>
  ) : null;

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
            <MD className="prose-zh mt-3">{e.content_md}</MD>
          )}
        </div>
        {e && (
          <div className="flex gap-2">
            <a className="btn flex-1" href={`/practice?kp=${current.kp.id}&fresh=1`}>{t("✍️ 练几道题检验一下")}</a>
            <button className="btn-ghost" onClick={() => open(current.kp, true)} disabled={busy}>{t("重新讲解")}</button>
          </div>
        )}
      </div>
    );
  }

  const COVER = { covered: "🟢", partial: "🟡", none: "⚪" };
  const LVDOT = { mastered: "bg-amber-500", ok: "bg-amber-400", weak: "bg-red-400", unlearned: "bg-slate-200" };
  const LVLABEL = { mastered: t("掌握"), ok: t("一般"), weak: t("薄弱"), unlearned: t("未学") };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">{t("学习与掌握度")}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost py-2 text-sm ring-1 ring-slate-200" onClick={() => { setRbMsg(""); setRbOpen(true); }}>🌳 {t("重建")}</button>
          <a href="/practice?fresh=1" className="btn py-2 text-sm">✍️ {t("开始自由练习")}</a>
        </div>
      </div>
      {rebuildModal}
      <div className="card flex justify-around text-center text-sm">
        {Object.keys(LVDOT).map((k) => (
          <div key={k}><div className={`mx-auto h-3 w-3 rounded-full ${LVDOT[k]} mb-1`} /><b>{levelCounts[k] || 0}</b> {LVLABEL[k]}</div>
        ))}
      </div>
      {tree.map((ch) => (
        <div key={ch.id} className="card">
          <h2 className="font-bold mb-2">{ch.title}</h2>
          <div className="space-y-1">
            {ch.points.map((p) => (
              <button key={p.id} onClick={() => open(p)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50">
                <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${LVDOT[levels[p.id] || "unlearned"]}`} />{p.title} <span className="text-xs">{COVER[p.coverage]}</span></span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{p.attempts > 0 ? `${p.correct}/${p.attempts}` : t("未练")}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {insights.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-sm mb-2">🗒️ {t("讨论中沉淀的观察")}</h2>
          <div className="space-y-1.5">
            {insights.map((x) => (
              <div key={x.id} className="text-sm flex gap-2">
                <span className={x.kind === "gap" ? "badge-model" : "badge-material"}>{x.kind === "gap" ? t("薄弱") : t("理解到位")}</span>
                <span className="text-slate-600">{x.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-400">{t("点色=掌握度(绿=掌握/浅绿=一般/红=薄弱/灰=未学);🟢🟡⚪=资料覆盖。点知识点看讲解。")}</p>
    </div>
  );
}


export default function Study() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>}><StudyInner /></Suspense>;
}
