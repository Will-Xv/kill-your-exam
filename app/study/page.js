"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";
import SourceBadge from "@/components/SourceBadge";
import ExploreSession from "@/components/ExploreSession";

function StudyInner() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [tree, setTree] = useState(null);
  const [levels, setLevels] = useState({});
  const [roots, setRoots] = useState({});
  const [start, setStart] = useState(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startMin, setStartMin] = useState(10);
  const loadStart = (mins) => { setStartBusy(true); const m = mins || startMin; setStartMin(m); fetch("/api/diagnostic?minutes=" + m).then((r) => (r.ok ? r.json() : null)).then(setStart).catch(() => {}).finally(() => setStartBusy(false)); };
  useEffect(() => { loadStart(10); }, []);
  const [levelCounts, setLevelCounts] = useState({});
  const [insights, setInsights] = useState([]);
  const [current, setCurrent] = useState(null); // {kp, explanation}
  const [exploreKp, setExploreKp] = useState(null); // topic-first 自由探索
  const [generating, setGenerating] = useState(false); // 知识树后台重建中
  const [busy, setBusy] = useState(false);
  const [lt, setLt] = useState(null);
  useEffect(() => { fetch("/api/lang-transfer").then((r) => r.json()).then(setLt).catch(() => {}); }, []);

  const sp = useSearchParams();
  const kpParam = sp.get("kp");
  const modeParam = sp.get("mode");
  useEffect(() => {
    fetch("/api/kp").then((r) => r.json()).then((d) => {
      setTree(d.tree); setGenerating(!!d.generating);
      if (kpParam) {
        for (const ch of d.tree) {
          const hit = ch.points.find((p) => p.id === Number(kpParam));
          if (hit) { if (modeParam === "explore") setExploreKp(hit); else open(hit); break; }
        }
      } else {
        // 刷新保留:上次正在自由探索且该知识点属于本考试 → 重新打开
        try {
          const raw = localStorage.getItem("kye_explore");
          if (raw) { const sv = JSON.parse(raw); if (sv && sv.kpId) { for (const ch of d.tree) { const hit = ch.points.find((p) => p.id === Number(sv.kpId)); if (hit) { setExploreKp(hit); break; } } } }
        } catch {}
      }
    });
    fetch("/api/mastery").then((r) => r.json()).then((d) => {
      const lv = {}; const cnt = { mastered: 0, ok: 0, weak: 0, unlearned: 0 }; const rt = {};
      (d.matrix || []).forEach((m) => { lv[m.id] = m.level; cnt[m.level] = (cnt[m.level] || 0) + 1; if (m.rootCause) rt[m.id] = true; });
      setLevels(lv); setLevelCounts(cnt); setInsights(d.insights || []); setRoots(rt);
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

  if (generating) return <p className="mt-16 text-center text-amber-600 animate-pulse">🔧 {t("知识树重建中…完成后会自动出现,请稍候刷新")}</p>;
  if (!tree) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  if (!tree.length) return <p className="mt-16 text-center text-stone-400">{t("还没有知识点树,请先完成")}<a href="/onboarding" className="underline">{t("考试设置")}</a>。</p>;

  if (exploreKp) {
    return <ExploreSession kp={exploreKp} onBack={() => setExploreKp(null)} />;
  }

  if (current) {
    const e = current.explanation;
    return (
      <div className="space-y-3 md:mt-14">
        <button className="text-sm text-stone-500" onClick={() => setCurrent(null)}>{t("← 返回知识点列表")}</button>
        <div className="card">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h1 className="text-lg font-bold"><MD inline>{current.kp.title}</MD></h1>
            {e && <SourceBadge sourceType={e.source_type} refs={e.source_refs} />}
          </div>
          {!e ? <p className="mt-4 text-stone-400 animate-pulse">{t("AI 正在准备讲解…")}</p> : (
            <MD className="prose-zh mt-3">{e.content_md}</MD>
          )}
        </div>
        {e && (
          <div className="flex gap-2">
            <a className="btn flex-1" href={`/practice?kp=${current.kp.id}&fresh=1`}>{t("✍️ 练几道题检验一下")}</a>
            <button className="btn-ghost" onClick={() => setExploreKp(current.kp)}>{t("🔍 自由探索")}</button>
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
        <a href="/practice?fresh=1" className="btn py-2 text-sm">✍️ {t("开始自由练习")}</a>
      </div>
      <div className="card flex justify-around text-center text-sm">
        {Object.keys(LVDOT).map((k) => (
          <div key={k}><div className={`mx-auto h-3 w-3 rounded-full ${LVDOT[k]} mb-1`} /><b>{levelCounts[k] || 0}</b> {LVLABEL[k]}</div>
        ))}
      </div>
      {start && (start.mode === "needTest" || start.mode === "advise") && (
        <div className="card border-emerald-300 bg-emerald-50/50">
          <h2 className="font-bold text-[#14532d]">🩺 {t("该从哪开始")}</h2>
          {start.mode === "needTest" ? (
            <div className="mt-1 text-sm">
              <p className="text-xs text-stone-500">{t("还没什么做题数据——先花几分钟抽测一下底子,那些『没学』的点你可能早就会。")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-stone-500">{t("我有:")}</span>
                {[5, 10, 15].map((mn) => <button key={mn} onClick={() => loadStart(mn)} disabled={startBusy} className={`rounded-full px-2.5 py-0.5 ring-1 ${startMin === mn ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-300"}`}>{mn}{t("分钟")}</button>)}
                {start.suggestMock && <a href="/mock" className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-700 ring-1 ring-amber-300">🎯 {t("最全面:做一次模拟考")}</a>}
              </div>
              <p className="mt-2 text-xs font-semibold text-stone-600">{t("先测这几个点(约")}{start.minutes}{t("分钟)")}：</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(start.sample || []).map((k) => <a key={k.kpId} href={`/practice?kp=${k.kpId}`} className="rounded-lg bg-white px-2 py-1 text-xs text-[#2f2413] ring-1 ring-emerald-200 hover:bg-emerald-50"><MD inline>{k.title.length > 26 ? k.title.slice(0, 26) + "…" : k.title}</MD></a>)}
              </div>
            </div>
          ) : (
            <div className="mt-1 space-y-2 text-sm">
              {start.solid?.length > 0 && <div className="text-xs text-stone-600">✅ {t("已经比较稳(可略过/只巩固):")}<span className="font-medium">{start.solid.join("、")}</span></div>}
              {start.start?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-rose-700">{t("建议从这里开始")}</div><div className="mt-1 space-y-1">{start.start.map((c, i) => <div key={i} className="rounded-xl bg-white/70 px-3 py-1.5 text-xs"><span className="font-medium">{c.chapter}</span>{c.acc != null ? ` · ${t("正确率")}${c.acc}%` : ""} · {t("薄弱/未学")}{c.weak + c.unlearned}</div>)}</div></div>}
              {start.firstAction && <a href={`/practice?kp=${start.firstAction.kpId}`} className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">▶ {t("第一步:")}<MD inline>{start.firstAction.title.slice(0, 30)}</MD></a>}
              {start.suggestMock && <a href="/mock" className="ml-2 text-xs text-amber-700 underline">{t("或直接做一次模拟考全面测")}</a>}
            </div>
          )}
        </div>
      )}
      {lt && lt.isLanguage && (
        <a href="/lang-transfer" className="card block border-sky-300 bg-sky-50/50 hover:bg-sky-50">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sky-800">🌐 {t("三语迁移追踪")}</h2>
            <span className="text-xs text-sky-600">{t("查看/更新")} →</span>
          </div>
          <p className="mt-1 text-xs text-stone-600">{lt.background?.target || lt.background?.native ? `${lt.background.native || "?"} · ${(lt.background.known||[]).join("/") || "—"} → ${lt.background.target || lt.examName}` : t("先设置你的语言背景,我来追踪母语/外语的正负迁移。")}</p>
          {lt.total > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">{Object.entries(lt.counts).filter(([,n])=>n>0).map(([k,n])=><span key={k} className="rounded-full bg-white px-2 py-0.5 text-sky-700 ring-1 ring-sky-200">{({l1_negative:t("母语负迁移"),l2_negative:t("二外负迁移"),target_internal:t("目标语内部"),careless:t("粗心")})[k]||k}:{n}</span>)}<span className="rounded-full bg-white px-2 py-0.5 text-stone-500 ring-1 ring-stone-200">{t("对照表")} {lt.contrast?.length||0}</span></div>}
        </a>
      )}
      {tree.map((ch) => (
        <div key={ch.id} className="card">
          <h2 className="font-bold mb-2 flex items-center gap-2"><MD inline>{ch.title}</MD>{ch.isSub && ch.fromExamName && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-300">📎 {ch.fromExamName}</span>}</h2>
          <div className="space-y-1">
            {ch.points.map((p) => (
              <button key={p.id} onClick={() => open(p)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50">
                <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${LVDOT[levels[p.id] || "unlearned"]}`} /><MD inline>{p.title}</MD> <span className="text-xs">{COVER[p.coverage]}</span>{roots[p.id] && <span title={t("根因知识点:它薄弱会拖垮一片其它内容")} className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-300">🔗 {t("根因")}</span>}</span>
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
      <p className="text-xs text-slate-400">{t("点色=掌握度(绿=掌握/浅绿=一般/红=薄弱/灰=未学);🟢🟡⚪=资料覆盖。点知识点看讲解。")} {t("🔗根因=诊断认为它拖垮了一片其它知识点。")}</p>
    </div>
  );
}


export default function Study() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>}><StudyInner /></Suspense>;
}
