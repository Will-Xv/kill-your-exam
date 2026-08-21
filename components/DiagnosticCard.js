"use client";
// 【小测卡片】学习页和模拟考页【共用这一份】——两边永远是同一件事、同一套口径,
// 要改就改这里,别在某一边另写一套(参考 dailyLabels.js 的做法)。
// 做的事:横跨各章抽几个知识点,每个点各出一道,一次连着做完(/practice?mode=quick&kps=...),几分钟摸清底子,结果记进掌握度。
// ★历史坑(已修):①抽样以前【只在做题数<6 时才算】,做过几道题小测就永久消失、全站找不到;
//                ②以前不是一整场小测,只是几个链到单个知识点的小标签,点一个进一个;
//                ③同卡里原本还有"推荐学的单元(该从哪开始)",会把小测顶掉 —— 已按 Will 要求整块删除。
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";

// 截断但不切坏 LaTeX:切点落在公式中间就补齐到闭合 $,补不到就把半截公式丢掉。
function safeCut(str, n) {
  const x = String(str || "");
  if (x.length <= n) return x;
  let c = x.slice(0, n);
  if (((c.match(/\$/g) || []).length % 2) === 1) {
    const nxt = x.indexOf("$", c.length);
    c = nxt >= 0 ? x.slice(0, nxt + 1) : c.replace(/\$[^$]*$/, "");
  }
  return c + "…";
}

// showMockLink:在模拟考页上就没必要再挂"去做模拟考"的链接了(人已经在那儿)。
export default function DiagnosticCard({ showMockLink = true, defaultMinutes = 10 }) {
  const t = useT();
  const [start, setStart] = useState(null);
  const [startBusy, setStartBusy] = useState(false);
  const [startMin, setStartMin] = useState(defaultMinutes);
  const loadStart = (mins) => {
    setStartBusy(true);
    const m = mins || startMin; setStartMin(m);
    fetch("/api/diagnostic?minutes=" + m).then((r) => (r.ok ? r.json() : null)).then(setStart).catch(() => {}).finally(() => setStartBusy(false));
  };
  useEffect(() => { loadStart(defaultMinutes); }, []);
  // 【只留小测】"推荐学的单元"已按 Will 要求整块删掉:它跟小测抢位置,而且做过题之后会把小测顶掉。
  if (!start) return null;
  const qt = start.quickTest || (start.sample ? { sample: start.sample, minutes: start.minutes } : null);
  const ids = (qt?.sample || []).map((k) => k.kpId).filter(Boolean);
  if (!ids.length) return null;   // 没有可测的知识点(如知识树还没建好)就整卡不显示,别留一张空卡
  return (
    <div className="card border-emerald-300 bg-emerald-50/50">
      <h2 className="font-bold text-[#14532d]">🩺 {t("小测:几分钟摸清底子")}</h2>
      <p className="mt-0.5 text-xs text-stone-500">{t("横跨各章抽几个点连着做一遍,看看哪儿虚。做完自动记进掌握度。")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-stone-500">{t("我有:")}</span>
        {[5, 10, 15].map((mn) => (
          <button key={mn} onClick={() => loadStart(mn)} disabled={startBusy}
            className={`rounded-full px-2.5 py-0.5 ring-1 ${startMin === mn ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-300"}`}>{mn}{t("分钟")}</button>
        ))}
        {showMockLink && start.suggestMock && <a href="/mock" className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-700 ring-1 ring-amber-300">🎯 {t("最全面:做一次模拟考")}</a>}
      </div>
      <a href={`/practice?mode=quick&kps=${ids.join(",")}&fresh=1`}
        className="mt-2 block rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700">
        ▶ {t("开始小测")}（{ids.length} {t("个知识点")}·{t("约")} {qt?.minutes || ids.length * 2} {t("分钟")}）
      </a>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {(qt?.sample || []).map((k) => (
          <span key={k.kpId} className="rounded-lg bg-white px-2 py-0.5 text-[11px] text-stone-600 ring-1 ring-emerald-200"><MD inline>{safeCut(k.title, 22)}</MD></span>
        ))}
      </div>
      {start.mode === "needTest" && (
        <p className="mt-2 text-xs text-stone-500">{t("还没什么做题数据——先做个小测,那些『没学』的点你可能早就会。")}</p>
      )}
    </div>
  );
}
