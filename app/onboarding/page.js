"use client";
import { useT } from "@/components/I18n";
import { useState } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";

export default function Onboarding() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [examId, setExamId] = useState(null);
  const [report, setReport] = useState(null);
  const [sources, setSources] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploadLog, setUploadLog] = useState([]);

  async function doAssess() {
    setBusy(true); setBusyText("正在联网搜索这门考试的公开信息,并生成 AI 认知自评…(约 1 分钟)");
    try {
      const d = await aiFetch("/api/onboarding/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, examDate, dailyMinutes }) });
      setExamId(d.examId); setReport(d.report); setSources(d.sources || []); setStep(2);
    } catch {}
    setBusy(false);
  }
  async function doUpload() {
    setBusy(true);
    for (const f of files) {
      setBusyText(`${t("正在解析")} ${f.name}…`);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const d = await aiFetch(`/api/materials/upload?examId=${examId}`, { method: "POST", body: fd });
        setUploadLog((l) => [...l, `✓ ${f.name} (${d.chunks})`]);
      } catch (e) { setUploadLog((l) => [...l, `✗ ${f.name} ${t("失败")}`]); }
    }
    setFiles([]); setBusy(false); setBusyText("");
  }
  async function doFinalize() {
    setBusy(true); setBusyText("正在生成知识点树和备考策略…(约 1 分钟)");
    try {
      await aiFetch("/api/onboarding/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId }) });
      location.href = "/";
    } catch { setBusy(false); }
  }

  const CONF = { high: t("较有把握"), medium: t("一般"), low: t("把握不大"), none: t("几乎不了解") };
  return (
    <div className="max-w-xl mx-auto space-y-4 pb-8">
      <h1 className="text-2xl font-bold mt-4">{t("设置考试")}<span className="text-sm font-normal text-stone-400">{step} / 3</span></h1>
      {busy && <div className="card border-emerald-300 bg-emerald-50 text-emerald-800 text-sm animate-pulse">{busyText}</div>}

      {step === 1 && (
        <div className="card space-y-3">
          <div><label className="text-sm text-stone-500">{t("考试名称(尽量写全称)")}</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("例如:一级注册消防工程师")} /></div>
          <div><label className="text-sm text-stone-500">{t("考试日期(不确定可以先空着)")}</label>
            <input className="input mt-1" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></div>
          <div><label className="text-sm text-stone-500">{t("每天大约能学多久(分钟)")}</label>
            <input className="input mt-1" type="number" value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} /></div>
          <button className="btn w-full" disabled={!name || busy} onClick={doAssess}>{t("下一步:让 AI 交底")}</button>
        </div>
      )}

      {step === 2 && report && (
        <>
          <div className="card space-y-3">
            <h2 className="font-bold">{t("🤖 AI 认知自评:关于这门考试,我先跟你交个底")}</h2>
            <p className="text-sm">{t("总体把握:")}<b>{CONF[report.confidence]}</b></p>
            <Section title={t("✅ 我比较有把握的")} items={report.known} />
            <Section title={t("❓ 我不太确定的")} items={report.uncertain} />
            <Section title={t("🚫 我不知道、需要你提供资料的")} items={report.unknown} />
            <Section title={t("⚠️ 用 AI 备考这门考试的风险")} items={report.risks} tone="text-red-700" />
            {sources.length > 0 && (
              <details className="text-xs text-stone-500"><summary>{t("本次搜索参考的网页")}({sources.length})</summary>
                {sources.map((s, i) => <a key={i} className="block underline truncate" href={s.url} target="_blank">{s.title}</a>)}
              </details>
            )}
          </div>
          <div className="card space-y-2">
            <h2 className="font-bold">{t("📋 建议收集的资料(现在传或以后传都行)")}</h2>
            {report.checklist.map((c, i) => (
              <div key={i} className="text-sm border-b border-stone-100 pb-2">
                <span className={c.priority === "must" ? "text-red-600 font-medium" : "text-stone-400"}>{c.priority === "must" ? t("【必备】") : t("【加分】")}</span>
                <b>{c.item}</b>
                <p className="text-stone-500">{c.why}</p>
              </div>
            ))}
          </div>
          <button className="btn w-full" onClick={() => setStep(3)}>{t("下一步:上传资料")}</button>
        </>
      )}

      {step === 3 && (
        <div className="card space-y-3">
          <h2 className="font-bold">{t("上传资料(PDF / Word / 文本 / 图片)")}</h2>
          <p className="text-sm text-stone-500">{t("传得越多,讲解和出题越可靠。也可以先跳过,以后在\"资料\"页随时补。")}</p>
          <input type="file" multiple className="input" onChange={(e) => setFiles([...e.target.files])} accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" />
          {files.length > 0 && <button className="btn-ghost w-full" onClick={doUpload} disabled={busy}>{t("上传")} {files.length} {t("个文件")}</button>}
          {uploadLog.map((l, i) => <p key={i} className="text-sm text-stone-600">{l}</p>)}
          <button className="btn w-full" onClick={doFinalize} disabled={busy}>{t("完成设置,生成知识点树和备考策略")}</button>
        </div>
      )}
    </div>
  );
}
function Section({ title, items, tone = "" }) {
  const t = useT();
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <ul className={`list-disc pl-5 text-sm text-stone-600 ${tone}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
