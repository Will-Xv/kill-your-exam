"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18n";

export default function PlanPage() {
  const t = useT();
  const [data, setData] = useState(null);
  const [minutes, setMinutes] = useState("");
  const [sprint, setSprint] = useState(false);
  const load = (m, sp) => {
    const q = new URLSearchParams();
    if (m) q.set("minutes", m);
    if (sp) q.set("mode", "sprint");
    fetch("/api/plan?" + q.toString()).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const exams = data?.exams || [];
  const pct = (e) => (e.kpTotal ? Math.round((e.mastered / e.kpTotal) * 100) : 0);
  const urgencyColor = (d) => d == null ? "text-[#8a7a54]" : d <= 3 ? "text-rose-600" : d <= 10 ? "text-amber-600" : "text-emerald-700";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-[#2f2413]">🗺️ {t("总规划")}</h1>

      {data?.topTask && (
        <div className="rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("今天最该做的一件事")}</div>
          <div className="mt-1 text-lg font-black text-[#5a2d0c]">{data.topTask.text}{data.topTask.minutes ? ` · ${data.topTask.minutes}${t("分钟")}` : ""}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[#6b4a25]">{t("今天总可用")}</span>
        <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} placeholder={String(data?.totalMinutes || 90)} className="w-20 rounded-lg border border-[#e4d5af] bg-white px-2 py-1" inputMode="numeric" />
        <span className="text-[#6b4a25]">{t("分钟")}</span>
        <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={sprint} onChange={(e) => setSprint(e.target.checked)} /> {t("临考冲刺模式")}</label>
        <button className="btn px-3 py-1.5" onClick={() => load(minutes, sprint)}>{t("重新规划")}</button>
      </div>

      {exams.length === 0 && <div className="card text-[#8a7a54]">{t("还没有考试。")}</div>}

      <div className="space-y-3">
        {exams.map((e, i) => (
          <div key={e.id} className={`card ${i === 0 ? "ring-2 ring-amber-300" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-black text-[#2f2413]">{e.name}</div>
                <div className={`text-sm font-semibold ${urgencyColor(e.daysLeft)}`}>
                  {e.daysLeft == null ? t("考期未定") : e.daysLeft <= 0 ? t("就是今明天!") : `${e.daysLeft} ${t("天后考")}`}
                </div>
              </div>
              <div className="shrink-0 rounded-2xl bg-[#2f2413] px-3 py-2 text-center text-[#f6efdd]">
                <div className="text-xl font-black">{e.allocMinutes}</div>
                <div className="text-[10px]">{t("建议分钟")}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
              <div><div className="font-black text-[#2f2413]">{pct(e)}%</div><div className="text-[11px] text-[#8a7a54]">{t("掌握")}</div></div>
              <div><div className="font-black text-rose-600">{e.weak}</div><div className="text-[11px] text-[#8a7a54]">{t("薄弱")}</div></div>
              <div><div className="font-black text-amber-600">{e.due}</div><div className="text-[11px] text-[#8a7a54]">{t("待复习")}</div></div>
              <div><div className="font-black text-[#2f2413]">{e.accuracy}%</div><div className="text-[11px] text-[#8a7a54]">{t("正确率")}</div></div>
            </div>
            {e.weakTitles?.length > 0 && (
              <div className="mt-2 text-xs text-[#6b4a25]">{t("先攻:")}{e.weakTitles.join("、")}</div>
            )}
          </div>
        ))}
      </div>
      <Link href="/" className="btn-ghost inline-block">← {t("返回首页")}</Link>
    </div>
  );
}
