"use client";
import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAiFetch } from "@/components/AiErrorDialog";
import { useT } from "@/components/I18n";
import SourceBadge from "@/components/SourceBadge";
import MD from "@/components/MD";

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };

function PracticeInner() {
  const t = useT();
  const aiFetch = useAiFetch();
  const kpParam = useSearchParams().get("kp");
  const mode = useSearchParams().get("mode");
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]);
  const [note, setNote] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  // 讨论(追问/争论)
  const [discuss, setDiscuss] = useState(null); // null | array of {role,content}
  const [dInput, setDInput] = useState("");
  const [dBusy, setDBusy] = useState(false);
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [discuss, dBusy]);

  async function loadQuestions() {
    setBusy(true); setQuestions([]); setIdx(0); setDone([]); setResult(null); setDiscuss(null);
    try {
      if (mode === "review") { const d = await aiFetch("/api/review"); setQuestions(d.questions); }
      else { const d = await aiFetch("/api/questions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kpParam ? Number(kpParam) : undefined, count: 5 }) }); setQuestions(d.questions); setNote(d.note || ""); }
    } catch {}
    setBusy(false);
  }
  useEffect(() => { loadQuestions(); }, []);
  const q = questions[idx];

  async function submit() {
    const ans = q.qtype === "fill" || q.qtype === "short" ? text : sel.sort().join("");
    setBusy(true);
    try {
      const d = await aiFetch("/api/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userAnswer: ans }) });
      setResult(d); setDone((arr) => [...arr, d.correct]);
    } catch {}
    setBusy(false);
  }
  async function finalizeDiscuss() {
    if (discuss && discuss.length >= 2) {
      try {
        const d = await aiFetch("/api/questions/discuss/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, attemptId: result?.attemptId, history: discuss }) });
        if (d.applied?.revised) setResult((r) => ({ ...r, revisedNote: (t("已按讨论修订评分为") + " " + d.applied.newScore + (d.applied.reason ? " · " + d.applied.reason : "")) }));
      } catch {}
    }
    setDiscuss(null); setDInput("");
  }
  async function next() {
    await finalizeDiscuss();
    setResult(null); setSel([]); setText(""); setReportOpen(false); setReportNote(""); setIdx((i) => i + 1);
  }
  async function sendDiscuss() {
    const msg = dInput.trim(); if (!msg || dBusy) return;
    const ua = q.qtype === "fill" || q.qtype === "short" ? text : sel.sort().join("");
    const hist = [...(discuss || []), { role: "user", content: msg }];
    setDiscuss(hist); setDInput(""); setDBusy(true);
    try {
      const d = await aiFetch("/api/questions/discuss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userAnswer: ua, history: hist }) });
      setDiscuss([...hist, { role: "model", content: d.reply }]);
    } catch { setDiscuss(hist); }
    setDBusy(false);
  }
  async function submitReport() {
    setReportBusy(true);
    try {
      const d = await aiFetch("/api/questions/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, note: reportNote }) });
      alert(d.acted ? t("AI 确认这题确有问题,已移除并改进出题。感谢!") : t("AI 没发现这题有明显问题,已忽略(未删除)。若确有问题,请补充说明再提交。"));
    } catch {}
    setReportOpen(false); setReportNote(""); setReportBusy(false);
  }

  if (busy && !questions.length) return <p className="mt-16 text-center text-slate-400 animate-pulse">{t("AI 正在准备题目…")}</p>;
  if (!questions.length) return mode === "review"
    ? <div className="mt-16 text-center text-slate-400 space-y-3"><p>{t("🎉 没有到期的错题,今天不用重练。")}</p><a className="btn" href="/practice">{t("去做新题")}</a></div>
    : <p className="mt-16 text-center text-slate-400">{note ? note + " " : t("暂时没有题目。先去")}<a className="underline" href="/onboarding">{t("设置考试")}</a>{t("或")}<a className="underline" href="/study">{t("学习页")}</a>。</p>;

  if (idx >= questions.length) {
    const right = done.filter(Boolean).length;
    return (
      <div className="mt-16 text-center space-y-4">
        <div className="text-5xl">{right === done.length ? "🎉" : "💪"}</div>
        <h1 className="text-2xl font-bold">{t("本轮完成:")}{right} / {done.length}</h1>
        <div className="flex gap-2 justify-center">
          <button className="btn" onClick={loadQuestions}>{t("再来一轮")}</button>
          <a className="btn-ghost" href="/mistakes">{t("错题本")}</a>
          <a className="btn-ghost" href="/">{t("回首页")}</a>
        </div>
      </div>
    );
  }

  const letters = ["A", "B", "C", "D", "E", "F"];
  const isChoice = q.qtype === "single" || q.qtype === "multi" || q.qtype === "judge";
  const options = q.qtype === "judge" ? ["对", "错"] : q.body.options || [];
  const optValue = (i) => (q.qtype === "judge" ? options[i] : letters[i]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{mode === "review" ? t("🔁 错题重练 · ") : ""}{idx + 1} / {questions.length} · {t(QTYPE[q.qtype])}</span>
        <span className="flex items-center gap-1.5">
          {q.is_real ? <span className="badge-material">📜 {t("真题")}</span> : q.origin === "online" ? <span className="badge-material">🌐 {t("网上题")}</span> : <span className="badge-model">🤖 {t("AI出题")}</span>}
          <SourceBadge sourceType={q.source_type} refs={q.source_refs} />
        </span>
      </div>
      <div className="card">
        <MD className="font-medium prose-zh">{q.body.stem}</MD>
        {isChoice && (
          <div className="mt-3 space-y-2">
            {options.map((op, i) => {
              const v = optValue(i); const active = sel.includes(v);
              return (
                <button key={i} disabled={!!result} onClick={() => setSel(q.qtype === "multi" ? (active ? sel.filter((x) => x !== v) : [...sel, v]) : [v])}
                  className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  {q.qtype !== "judge" && <b className="mr-2">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : <MD inline>{op}</MD>}
                </button>
              );
            })}
          </div>
        )}
        {!isChoice && <textarea className="input mt-3" rows={q.qtype === "short" ? 5 : 2} placeholder={q.qtype === "short" ? t("写下你的回答(口语化也行)") : t("填写答案")} value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} />}
      </div>

      {result && (
        <div className={`card ${result.correct ? "border-emerald-300 bg-emerald-50" : (result.score >= 40 ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50")}`}>
          <p className="font-bold">
            {q.qtype === "short" ? `${result.score} ${t("分")}` : (result.correct ? t("✓ 答对了") : t("✗ 不对"))}
          </p>
          <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{q.qtype === "judge" ? t(result.answer) : <MD inline>{result.answer}</MD>}</p>
          {result.feedback && <div className="text-sm mt-1"><b>{t("点评:")}</b><MD inline>{result.feedback}</MD></div>}
          <div className="text-sm mt-1 text-slate-600"><b>{t("解析:")}</b><MD inline>{result.explanation}</MD></div>
          {result.revisedNote && <p className="text-sm mt-1 text-emerald-700">↺ {result.revisedNote}</p>}
          <p className="text-xs text-slate-400 mt-2">
            {q.is_real ? t("题目:历年真题") : q.origin === "online" ? t("题目:网上题目") : t("题目:AI 生成")}
            {" · "}{result.answer_origin === "provided" ? t("标准答案:来自网上") : t("标准答案:AI 给出")}
            {" · "}{t("判卷与解析:AI")}
            {result.source_url && <> · <a className="underline" href={result.source_url} target="_blank">{t("来源")}</a></>}
          </p>
        </div>
      )}

      {/* 讨论区 */}
      {result && discuss !== null && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">💬 {t("就这道题追问 / 争论")}</h3>
            <span className="text-xs text-slate-400">{t("结束后会把有价值的观察存进掌握度,对话本身不保留")}</span>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {discuss.map((m, i) => (
              <div key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-emerald-600 text-white" : "bg-slate-100"}`}>{m.role === "user" ? m.content : <MD inline>{m.content}</MD>}</div>
            ))}
            {dBusy && <div className="max-w-[88%] rounded-2xl px-3 py-2 text-sm bg-slate-100 text-slate-400 animate-pulse">{t("思考中…")}</div>}
            <div ref={bottom} />
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1" value={dInput} onChange={(e) => setDInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendDiscuss()} placeholder={t("例如:我觉得我这样答也对,因为…")} />
            <button className="btn px-4" onClick={sendDiscuss} disabled={dBusy || !dInput.trim()}>{t("发送")}</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!result ? (
          <button className="btn flex-1" onClick={submit} disabled={busy || (isChoice ? !sel.length : !text.trim() && q.qtype !== "short")}>{busy ? t("批改中…") : t("提交答案")}</button>
        ) : (
          <>
            {discuss === null && <button className="btn-ghost text-sm" onClick={() => setDiscuss([])}>💬 {t("有疑问?追问/争论")}</button>}
            <button className="btn flex-1" onClick={next}>{t("下一题 →")}</button>
          </>
        )}
        <button className="btn-ghost text-xs" onClick={() => setReportOpen(true)}>⚠️ {t("题目有问题")}</button>
      </div>

      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !reportBusy && setReportOpen(false)}>
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">⚠️ {t("反馈:题目有问题")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("如果是答案或解析你不认同,建议直接用上面的“追问/争论”和 AI 讨论。这里只反馈“题目本身”的毛病(如题干歧义、无正确选项、需要图/音频等)。")}</p>
            <textarea className="input mt-2" rows={3} value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder={t("补充说明(可选):这题哪里有问题?写清楚能帮 AI 更准地改进")} />
            <p className="text-xs text-slate-400 mt-1">{t("提交后 AI 会分析错因,据此改进题库和以后出题。若分析不出问题且你没补充说明,则当误操作、不删题。")}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1 py-2" onClick={() => setReportOpen(false)} disabled={reportBusy}>{t("取消")}</button>
              <button className="btn flex-1 py-2" onClick={submitReport} disabled={reportBusy}>{reportBusy ? t("分析中…") : t("提交")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Practice() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-slate-400">{t("加载中…")}</p>}><PracticeInner /></Suspense>;
}
