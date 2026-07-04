"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";

const TYPES = [
  ["school", "🏫", "学校/院校考试"],
  ["cert", "📜", "职业资格/证书"],
  ["language", "🗣️", "语言考试"],
  ["grad", "🎓", "升学考试"],
  ["other", "📝", "其他"],
  ["study", "📚", "只学习(无需搜索考试信息)"]
];

export default function Onboarding() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [examType, setExamType] = useState("");
  const [school, setSchool] = useState("");
  const [notes, setNotes] = useState("");
  const [examId, setExamId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [files, setFiles] = useState([]);
  const [uploadLog, setUploadLog] = useState([]);
  const [report, setReport] = useState(null);
  const [sources, setSources] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [other, setOther] = useState("");
  const OTHER = "其他文件或说明";
  const [related, setRelated] = useState(null);

  async function createExam() {
    if (!name.trim() || !examType) return;
    setBusy(true);
    try {
      const d = await aiFetch("/api/onboarding/create", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, name, examDate, dailyMinutes, examType, school, notes }) });
      setExamId(d.examId); setStep(3);
    } catch {}
    setBusy(false);
  }
  async function doUpload() {
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      setBusyText(`${t("正在解析")} ${f.name}…`);
      const fd = new FormData(); fd.append("file", f);
      try { const d = await aiFetch(`/api/materials/upload?examId=${examId}`, { method: "POST", body: fd }); setUploadLog((l) => [...l, `✓ ${f.name} (${d.chunks})`]); }
      catch { setUploadLog((l) => [...l, `✗ ${f.name} ${t("失败")}`]); }
    }
    setFiles([]); setBusy(false); setBusyText("");
  }
  async function generatePlan() {
    setBusy(true); setBusyText(t("正在联网搜索这门考试的公开信息,并生成 AI 认知自评…(约 1 分钟)"));
    try {
      const d = await aiFetch("/api/onboarding/assess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId }) });
      setReport(d.report); setSources(d.sources || []);
      setChecklist((d.report?.checklist || []).map((c) => ({ ...c, answer: "", done: false })));
      setStep(4);
    } catch {}
    setBusy(false); setBusyText("");
  }
  async function saveChecklist(next) {
    setChecklist(next);
    try { await fetch("/api/materials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist: next, examId }) }); } catch {}
  }
  async function finalize() {
    setBusy(true); setBusyText(t("正在生成知识点树和备考策略…(约 1 分钟)"));
    try {
      const cl = checklist.filter((c) => c.item !== OTHER);
      if (other.trim()) cl.push({ kind: "qa", item: OTHER, why: "", priority: "opt", fixed: true, answer: other, done: true });
      if (cl.length) { try { await fetch("/api/materials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist: cl, examId }) }); } catch {} }
      await aiFetch("/api/onboarding/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId }) });
      const r = await fetch("/api/exam/related", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examName: name, targetExamId: examId }) }).then((x) => x.json()).catch(() => ({ related: [] }));
      if (r.related?.length) { setRelated(r.related); setStep(5); setBusy(false); } else location.href = "/";
    } catch { setBusy(false); }
  }
  async function borrow(fromId) {
    setBusy(true);
    await fetch("/api/exam/borrow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromExamId: fromId, toExamId: examId }) });
    location.href = "/";
  }

  const CONF = { high: t("较有把握"), medium: t("一般"), low: t("把握不大"), none: t("几乎不了解") };
  const Section = ({ title, items, tone = "" }) => !items?.length ? null : (
    <div><p className="text-sm font-semibold">{title}</p><ul className={`list-disc pl-5 text-sm text-slate-600 ${tone}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  );

  // 上传资料 + 问答(AI 分析之后出现)
  const SupplyBlock = () => (
    <div className="card space-y-3">
      <h2 className="font-bold">📎 {t("补充资料(可选)")}</h2>
      <p className="text-sm text-slate-500">{t("按上面 AI 说它「不知道 / 需要你提供」的部分,补充资料或直接回答。也可以先跳过,以后随时补。")}</p>
      <input type="file" multiple className="input" onChange={(e) => setFiles([...e.target.files])} accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" />
      {files.length > 0 && <button className="btn-ghost w-full" onClick={doUpload} disabled={busy}>{t("上传")} {files.length}</button>}
      {uploadLog.map((l, i) => <p key={i} className="text-sm text-slate-600">{l}</p>)}
      {checklist.length > 0 && (
        <div className="space-y-1 pt-1">
          {checklist.map((c, i) => c.item === OTHER ? null : c.kind === "qa" ? (
            <div key={i} className="py-1.5 border-b border-slate-100 last:border-0">
              <p className="text-sm">{c.priority === "must" ? "🔴 " : ""}{c.item} <span className="text-xs text-slate-400">— {t("直接回答")}</span></p>
              <input className="input py-2 text-sm mt-1" value={c.answer || ""} placeholder={c.why}
                onChange={(e) => setChecklist(checklist.map((x, j) => j === i ? { ...x, answer: e.target.value } : x))}
                onBlur={() => saveChecklist(checklist.map((x, j) => j === i ? { ...x, done: !!(x.answer && x.answer.trim()) } : x))} />
            </div>
          ) : (
            <label key={i} className="flex items-start gap-2 text-sm py-1.5 cursor-pointer border-b border-slate-100 last:border-0">
              <input type="checkbox" checked={!!c.done} className="mt-1" onChange={() => saveChecklist(checklist.map((x, j) => j === i ? { ...x, done: !x.done } : x))} />
              <span className={c.done ? "line-through text-slate-400" : ""}>{c.priority === "must" ? "🔴 " : ""}{c.item} <span className="text-xs text-slate-400">({t("上传文件")})</span></span>
            </label>
          ))}
        </div>
      )}
      <div className="pt-1">
        <p className="text-sm font-medium">{t("其他文件或说明")}</p>
        <p className="text-xs text-slate-400">{t("有资料没法上传(纸质书、老师口头强调、目标分数等),或想直接告诉 AI 的话,写在这里。")}</p>
        <textarea className="input mt-1" rows={3} value={other} onChange={(e) => setOther(e.target.value)} placeholder={t("例如:我有纸质《XX》第 3 章;老师说重点考案例分析;目标 80 分…")} />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-black mt-2">{t("设置考试")}</h1>
      {busy && busyText && <div className="card border-amber-400 bg-amber-50 text-amber-800 text-sm animate-pulse">{busyText}</div>}

      {step === 1 && (
        <div className="card space-y-3">
          <div><label className="text-sm text-slate-500">{t("考试名称(尽量写全称)")}</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("例如:一级注册消防工程师")} /></div>
          <div>
            <label className="text-sm text-slate-500">{t("考试类型")}</label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TYPES.map(([v, icon, label]) => (
                <button key={v} type="button" onClick={() => setExamType(v)}
                  className={`rounded-xl border px-3 py-2 text-sm ${examType === v ? "border-amber-500 bg-amber-50 text-amber-700 font-medium" : "border-slate-200 text-slate-600"}`}>
                  {icon} {t(label)}
                </button>
              ))}
            </div>
          </div>
          {examType === "school" && (
            <div><label className="text-sm text-slate-500">{t("学校/课程信息(会存进你的档案,随时可改)")}</label>
              <input className="input mt-1" value={school} onChange={(e) => setSchool(e.target.value)} placeholder={t("例如:XX大学 数据结构 期末考")} /></div>
          )}
          <div><label className="text-sm text-slate-500">{t("考试日期(不确定可以先空着)")}</label>
            <input className="input mt-1" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></div>
          <div><label className="text-sm text-slate-500">{t("每天大约能学多久(分钟)")}</label>
            <input className="input mt-1" type="number" value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} /></div>
          <div><label className="text-sm text-slate-500">{t("补充说明(可选,帮 AI 更准地找资料)")}</label>
            <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("例如:重点考第 3~5 章;老师说会考案例分析;我基础比较弱…")} /></div>
          <button className="btn w-full" disabled={!name.trim() || !examType || busy} onClick={createExam}>{t("下一步")}</button>
        </div>
      )}

      {step === 3 && examType === "study" && (
        <>
          <div className="card space-y-3 text-center">
            <div className="text-4xl">📚</div>
            <h2 className="font-bold">{t("这是一个「只学习」的目标")}</h2>
            <p className="text-sm text-slate-500">{t("不需要联网搜索考试信息——名称只作为标题,相关信息以你上传的资料和补充说明为准。AI 会据此直接生成学习地图和计划。(练习题仍会正常出题/搜题)")}</p>
          </div>
          <SupplyBlock />
          <button className="btn w-full" onClick={finalize} disabled={busy}>{t("生成学习地图和计划")}</button>
        </>
      )}
      {step === 3 && examType !== "study" && (
        <div className="card space-y-3 text-center">
          <div className="text-4xl">🤖</div>
          <h2 className="font-bold">{t("准备好了,让 AI 分析这门考试")}</h2>
          <p className="text-sm text-slate-500">{t("现在 AI 会联网搜索这门考试,并坦白它知道什么、不知道什么、有哪些风险。(约 1 分钟,请稍候)")}</p>
          <button className="btn w-full" onClick={generatePlan} disabled={busy}>{t("开始分析")}</button>
        </div>
      )}

      {step === 4 && report && (
        <>
          <div className="card space-y-3">
            <h2 className="font-bold">🤖 {t("🤖 AI 认知自评:关于这门考试,我先跟你交个底")}</h2>
            <p className="text-sm">{t("总体把握:")}<b>{CONF[report.confidence]}</b></p>
            <Section title={t("✅ 我比较有把握的")} items={report.known} />
            <Section title={t("❓ 我不太确定的")} items={report.uncertain} />
            <Section title={t("🚫 我不知道、需要你提供资料的")} items={report.unknown} />
            <Section title={t("⚠️ 用 AI 备考这门考试的风险")} items={report.risks} tone="text-red-700" />
            {sources.length > 0 && (
              <details className="text-xs text-slate-500"><summary>{t("本次搜索参考的网页")}({sources.length})</summary>
                {sources.map((s, i) => <a key={i} className="block underline truncate" href={s.url} target="_blank">{s.title}</a>)}
              </details>
            )}
          </div>
          <SupplyBlock />
          <button className="btn w-full" onClick={finalize} disabled={busy}>{t("确认,生成知识点树和备考策略")}</button>
        </>
      )}

      {step === 5 && related && (
        <div className="card space-y-3">
          <h2 className="font-bold">{t("发现可借用的资料")}</h2>
          <p className="text-sm text-slate-500">{t("你以前的考试里有相关资料。要借用到这门新考试吗?(默认隔离,不借用不会互相影响)")}</p>
          {related.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div><b className="text-sm">{r.name}</b><p className="text-xs text-slate-400">{r.materials} {t("份资料")}</p></div>
              <button className="btn-ghost py-2 text-sm" onClick={() => borrow(r.id)} disabled={busy}>{t("借用")}</button>
            </div>
          ))}
          <button className="btn w-full" onClick={() => (location.href = "/")}>{t("不借用,直接开始")}</button>
        </div>
      )}
    </div>
  );
}
