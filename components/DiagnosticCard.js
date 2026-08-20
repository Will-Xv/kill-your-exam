"use client";
// 【自测·「该从哪开始」卡片】学习页和模拟考页【共用这一份】——两边永远是同一件事、同一套口径。
// 以前只长在学习页里,主人想"测一下"时第一直觉是去模拟考页,结果那儿只有整套全真模考(重、要很久),
// 轻量抽测反而藏在学习页。要改就改这里,别在某一边另写一套(参考 dailyLabels.js 的做法)。
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
  if (!start || (start.mode !== "needTest" && start.mode !== "advise")) return null;
  const qt = start.quickTest || (start.sample ? { sample: start.sample, minutes: start.minutes } : null);
  const ids = (qt?.sample || []).map((k) => k.kpId).filter(Boolean);
  return (
    <div className="card border-emerald-300 bg-emerald-50/50">
      {/* 【小测】一次跨多个知识点连着做,不是一个点一个点点进去。
          ★以前这块只在"做题数<6"时出现,做过几道题后就永久消失、到处都找不到(Will 反馈);
            现在不论有没有数据都常驻。 */}
      {ids.length > 0 && (
        <div>
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
          <a href={`/practice?kps=${ids.join(",")}&fresh=1`}
            className="mt-2 block rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700">
            ▶ {t("开始小测")}（{ids.length} {t("个知识点")}·{t("约")} {qt?.minutes || ids.length * 2} {t("分钟")}）
          </a>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(qt?.sample || []).map((k) => (
              <span key={k.kpId} className="rounded-lg bg-white px-2 py-0.5 text-[11px] text-stone-600 ring-1 ring-emerald-200"><MD inline>{safeCut(k.title, 22)}</MD></span>
            ))}
          </div>
        </div>
      )}

      {/* 【该从哪开始】有做题数据后才有意义:哪些章稳了、建议从哪章起步 */}
      {start.mode === "advise" && (
        <div className={ids.length > 0 ? "mt-3 border-t border-emerald-200 pt-3" : ""}>
          <h2 className="font-bold text-[#14532d]">🧭 {t("该从哪开始")}</h2>
          <div className="mt-1 space-y-2 text-sm">
            {start.solid?.length > 0 && <div className="text-xs text-stone-600">✅ {t("已经比较稳(可略过/只巩固):")}<span className="font-medium">{start.solid.join("、")}</span></div>}
            {start.start?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-rose-700">{t("建议从这里开始")}</div><div className="mt-1 space-y-1">{start.start.map((c, i) => <div key={i} className="rounded-xl bg-white/70 px-3 py-1.5 text-xs"><span className="font-medium">{c.chapter}</span>{c.acc != null ? ` · ${t("正确率")}${c.acc}%` : ""} · {t("薄弱/未学")}{c.weak + c.unlearned}</div>)}</div></div>}
            {start.firstAction && <a href={`/practice?kp=${start.firstAction.kpId}`} className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">▶ {t("第一步:")}<MD inline>{safeCut(start.firstAction.title, 30)}</MD></a>}
          </div>
        </div>
      )}

      {start.mode === "needTest" && (
        <p className="mt-2 text-xs text-stone-500">{t("还没什么做题数据——先做个小测,那些『没学』的点你可能早就会。")}</p>
      )}
    </div>
  );
}
