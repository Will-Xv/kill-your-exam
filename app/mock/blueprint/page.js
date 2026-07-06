"use client";
import { useState, useEffect } from "react";
import { useT } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";

const QT = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答", perform: "表演" };

export default function Blueprint() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [bp, setBp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [instr, setInstr] = useState("");

  useEffect(() => { (async () => { try { const d = await aiFetch("/api/mock/blueprint"); setBp(d.blueprint); } catch {} })(); }, []); // eslint-disable-line

  async function regen() {
    setBusy(true);
    try { const d = await aiFetch("/api/mock/blueprint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructions: instr }) }); setBp(d.blueprint); setInstr(""); } catch {}
    setBusy(false);
  }

  return (
    <div className="space-y-3 md:mt-14 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📋 {t("考试蓝图")}</h1>
        <a className="btn-ghost text-sm" href="/mock">{t("去模拟考")}</a>
      </div>
      <p className="text-sm text-stone-500">{t("这是 AI 根据考试信息规划的「正式考试该长什么样」。模拟考按它组卷。你可以在下面用一句话让它调整。")}</p>

      {bp === null && <p className="text-stone-400 text-sm">{t("加载/生成蓝图中…(首次可能稍慢)")}</p>}
      {bp && (
        <>
          <div className="card">
            <p className="text-sm">{bp.overview}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-600">
              {bp.totalMarks ? <span>🎯 {t("总分")} {bp.totalMarks}</span> : null}
              {bp.durationMin ? <span>⏱️ {bp.durationMin} {t("分钟")}</span> : null}
            </div>
            {bp.qtypeMarks && (
              <div className="mt-2 text-xs text-stone-500">{t("每题分值")}: {Object.entries(bp.qtypeMarks).filter(([, v]) => v).map(([k, v]) => `${t(QT[k] || k)} ${v}`).join(" · ")}</div>
            )}
          </div>
          <div className="card">
            <h2 className="font-bold mb-2">{t("知识点出题规划")}</h2>
            <div className="space-y-1 text-sm">
              {(bp.plan || []).map((p, i) => (
                <div key={i} className="flex justify-between border-b border-stone-100 py-1">
                  <span>{p.chapter ? <span className="text-stone-400">{p.chapter} / </span> : null}{p.kpTitle}</span>
                  <span className="text-stone-500">{p.count} {t("题")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h2 className="font-bold mb-2">{t("让 AI 调整蓝图")}</h2>
        <textarea className="input" rows={2} placeholder={t("例如:多考简答、总分改成 150、重点考第三章、加上听力…")} value={instr} onChange={(e) => setInstr(e.target.value)} />
        <button className="btn mt-2" onClick={regen} disabled={busy}>{busy ? t("重新规划中…") : t("重新生成蓝图")}</button>
      </div>
    </div>
  );
}
