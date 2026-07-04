"use client";
import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAiFetch } from "@/components/AiErrorDialog";
import { useT } from "@/components/I18n";
import SourceBadge from "@/components/SourceBadge";

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
  const [flagOpen, setFlagOpen] = useState(false);
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
      else { const d = await aiFetch("/api/questions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kpParam ? Number(kpParam) : undefined, count: 5 }) }); setQuestions(d.questions); }
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
    setResult(null); setSel([]); setText(""); setFlagOpen(false); setIdx((i) => i + 1);
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
  async function flag(reason) {
    await fetch("/api/questions/flag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, reason }) });
    setFlagOpen(false);
    alert(t("已标记,感谢反馈。Will 会看到。"));
  }

  if (busy && !questions.length) return <p className="mt-16 text-center text-slate-400 animate-pulse">{t("AI 正在准备题目…")}</p>;
  if (!questions.length) return mode === "review"
    ? <div className="mt-16 text-center text-slate-400 space-y-3"><p>{t("🎉 没有到期的错题,今天不用重练。")}</p><a className="btn" href="/practice">{t("去做新题")}</a></div>
    : <p className="mt-16 text-center text-slate-400">{t("暂时没有题目。先去")}<a className="underline" href="/onboarding">{t("设置考试")}</a>{t("或")}<a className="underline" href="/study">{t("学习页")}</a>。</p>;

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
        <SourceBadge sourceType={q.source_type} refs={q.source_refs} />
      </div>
      <div className="card">
        <p className="font-medium whitespace-pre-wrap">{q.body.stem}</p>
        {isChoice && (
          <div className="mt-3 space-y-2">
            {options.map((op, i) => {
              const v = optValue(i); const active = sel.includes(v);
              return (
                <button key={i} disabled={!!result} onClick={() => setSel(q.qtype === "multi" ? (active ? sel.filter((x) => x !== v) : [...sel, v]) : [v])}
                  className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  {q.qtype !== "judge" && <b className="mr-2">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : op}
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
          <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{q.qtype === "judge" ? t(result.answer) : result.answer}</p>
          {result.feedback && <p className="text-sm mt-1"><b>{t("点评:")}</b>{result.feedback}</p>}
          <p className="text-sm mt-1 text-slate-600"><b>{t("解析:")}</b>{result.explanation}</p>
          {result.revisedNote && <p className="text-sm mt-1 text-emerald-700">↺ {result.revisedNote}</p>}
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
              <div key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-emerald-600 text-white" : "bg-slate-100"}`}>{m.content}</div>
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
        <div className="relative">
          <button className="btn-ghost text-xs" onClick={() => setFlagOpen(!flagOpen)}>⚠️ {t("反馈问题")}</button>
          {flagOpen && (
            <div className="absolute right-0 bottom-full mb-1 z-10 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg text-sm">
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={() => flag("question")}>{t("题目本身有问题")}</button>
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50" onClick={() => flag("answer")}>{t("答案或解析有问题")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Practice() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-slate-400">{t("加载中…")}</p>}><PracticeInner /></Suspense>;
}
