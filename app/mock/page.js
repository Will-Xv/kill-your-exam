"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };

export default function Mock() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [stage, setStage] = useState("intro"); // intro | running | done
  const [mockId, setMockId] = useState(null);
  const [qs, setQs] = useState([]);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(null);
  const [started, setStarted] = useState(0);

  async function start(realOnly = false) {
    setBusy(true);
    try {
      const d = await aiFetch("/api/mock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 20, realOnly }) });
      setMockId(d.mockId); setQs(d.questions); setStage("running"); setStarted(Date.now());
    } catch {}
    setBusy(false);
  }
  async function submit() {
    if (!confirm(t("确定交卷?"))) return;
    setBusy(true);
    try {
      const d = await aiFetch("/api/mock/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mockId, answers }) });
      setScore(d.score); setStage("done");
    } catch {}
    setBusy(false);
  }
  const letters = ["A", "B", "C", "D", "E", "F"];
  const setA = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));

  if (stage === "intro") return (
    <div className="mt-16 text-center space-y-4 md:mt-24">
      <div className="text-5xl">📝</div>
      <h1 className="text-2xl font-bold">{t("模拟考")}</h1>
      <p className="text-stone-500">{t("按题型比例抽 20 道题,一次做完再看结果,更接近真实考试。")}</p>
      <div className="flex flex-col gap-2 items-center">
        <button className="btn" onClick={() => start(false)} disabled={busy}>{busy ? t("组卷中…") : t("开始模拟考")}</button>
        <button className="btn-ghost text-sm" onClick={() => start(true)} disabled={busy}>📜 {t("做真题(只用历年真题组卷)")}</button>
      </div>
    </div>
  );

  if (stage === "done" && score) {
    return (
      <div className="space-y-4 md:mt-14">
        <div className="card text-center bg-gradient-to-br from-amber-600 to-amber-700 text-white border-0">
          <p className="text-sm text-amber-100">{t("模拟考成绩")}</p>
          <p className="text-5xl font-bold my-2">{score.pct}%</p>
          <p className="text-amber-100">{score.got} / {score.total}</p>
        </div>
        <div className="card">
          <h2 className="font-bold mb-2">{t("各章得分")}</h2>
          {Object.entries(score.byChapter).map(([ch, s]) => (
            <div key={ch} className="mb-2">
              <div className="flex justify-between text-sm"><span>{ch}</span><span>{s.got}/{s.total}</span></div>
              <div className="h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${(s.got / s.total) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={() => { setStage("intro"); setScore(null); setAnswers({}); }}>{t("再考一次")}</button>
          <a className="btn-ghost" href="/">{t("回首页")}</a>
        </div>
      </div>
    );
  }

  const answered = Object.keys(answers).length;
  return (
    <div className="space-y-3 md:mt-14 pb-4">
      <div className="sticky top-0 md:top-14 z-10 bg-stone-50 py-2 flex items-center justify-between">
        <span className="text-sm text-stone-500">{t("已答")} {answered}/{qs.length}</span>
        <button className="btn py-2 text-sm" onClick={submit} disabled={busy}>{busy ? t("批改中…") : t("交卷")}</button>
      </div>
      {qs.map((q, idx) => {
        const isChoice = ["single", "multi", "judge"].includes(q.qtype);
        const options = q.qtype === "judge" ? ["对", "错"] : q.body.options || [];
        const cur = answers[q.id];
        return (
          <div key={q.id} className="card">
            <p className="text-xs text-stone-400 mb-1">{idx + 1} · {t(QTYPE[q.qtype])}</p>
            <MD className="font-medium prose-zh">{q.body.stem}</MD>
            {isChoice ? (
              <div className="mt-2 space-y-1.5">
                {options.map((op, i) => {
                  const v = q.qtype === "judge" ? op : letters[i];
                  const active = q.qtype === "multi" ? (cur || "").includes(v) : cur === v;
                  return <button key={i} onClick={() => setA(q.id, q.qtype === "multi" ? (active ? (cur || "").replace(v, "") : (cur || "") + v) : v)}
                    className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${active ? "border-amber-500 bg-amber-50" : "border-stone-200"}`}>
                    {q.qtype !== "judge" && <b className="mr-1">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : op}</button>;
                })}
              </div>
            ) : (
              <textarea className="input mt-2" rows={q.qtype === "short" ? 4 : 1} value={cur || ""} onChange={(e) => setA(q.id, e.target.value)} placeholder={t("填写答案")} />
            )}
          </div>
        );
      })}
      <button className="btn w-full" onClick={submit} disabled={busy}>{busy ? t("批改中…") : t("交卷")}</button>
    </div>
  );
}
