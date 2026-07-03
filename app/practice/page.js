"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAiFetch } from "@/components/AiErrorDialog";
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

  async function loadQuestions() {
    setBusy(true); setQuestions([]); setIdx(0); setDone([]); setResult(null);
    try {
      if (mode === "review") {
        const d = await aiFetch("/api/review");
        setQuestions(d.questions);
      } else {
        const d = await aiFetch("/api/questions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kpParam ? Number(kpParam) : undefined, count: 5 }) });
        setQuestions(d.questions);
      }
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
      setResult(d);
      setDone((arr) => [...arr, d.correct]);
    } catch {}
    setBusy(false);
  }
  function next() {
    setResult(null); setSel([]); setText("");
    setIdx((i) => i + 1);
  }
  async function flag() {
    await fetch("/api/questions/flag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id }) });
    alert(t("已标记,这道题不会再出现。Will 会看到反馈。"));
    result ? next() : setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }

  if (busy && !questions.length) return <p className="mt-16 text-center text-stone-400 animate-pulse">{t("AI 正在准备题目…")}</p>;
  if (!questions.length) return mode === "review"
    ? <div className="mt-16 text-center text-stone-400 space-y-3"><p>{t("🎉 没有到期的错题,今天不用重练。")}</p><a className="btn" href="/practice">{t("去做新题")}</a></div>
    : <p className="mt-16 text-center text-stone-400">{t("暂时没有题目。先去")}<a className="underline" href="/onboarding">{t("设置考试")}</a>{t("或")}<a className="underline" href="/study">{t("学习页")}</a>。</p>;

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
    <div className="space-y-3 md:mt-14">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <span>{mode === "review" ? t("🔁 错题重练 · ") : ""}{idx + 1} / {questions.length} · {t(QTYPE[q.qtype])}</span>
        <SourceBadge sourceType={q.source_type} refs={q.source_refs} />
      </div>
      <div className="card">
        <p className="font-medium whitespace-pre-wrap">{q.body.stem}</p>
        {isChoice && (
          <div className="mt-3 space-y-2">
            {options.map((op, i) => {
              const v = optValue(i);
              const active = sel.includes(v);
              return (
                <button key={i} disabled={!!result}
                  onClick={() => setSel(q.qtype === "multi" ? (active ? sel.filter((x) => x !== v) : [...sel, v]) : [v])}
                  className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? "border-emerald-500 bg-emerald-50" : "border-stone-200 hover:bg-stone-50"}`}>
                  {q.qtype !== "judge" && <b className="mr-2">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : op}
                </button>
              );
            })}
          </div>
        )}
        {!isChoice && (
          <textarea className="input mt-3" rows={q.qtype === "short" ? 5 : 2} placeholder={q.qtype === "short" ? t("写下你的回答(口语化也行)") : t("填写答案")} value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} />
        )}
      </div>

      {result && (
        <div className={`card ${result.correct ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
          <p className="font-bold">{result.correct ? t("✓ 答对了") : t("✗ 不对")}{q.qtype === "short" && ` · ${result.score}${t("分")}`}</p>
          <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{t(result.answer)}</p>
          {result.feedback && <p className="text-sm mt-1"><b>{t("点评:")}</b>{result.feedback}</p>}
          <p className="text-sm mt-1 text-stone-600"><b>{t("解析:")}</b>{result.explanation}</p>
        </div>
      )}

      <div className="flex gap-2">
        {!result ? (
          <button className="btn flex-1" onClick={submit} disabled={busy || (isChoice ? !sel.length : !text.trim() && q.qtype !== "short")}>
            {busy ? t("批改中…") : t("提交答案")}
          </button>
        ) : (
          <button className="btn flex-1" onClick={next}>{t("下一题 →")}</button>
        )}
        <button className="btn-ghost text-xs" onClick={flag} title={t("题目有错误或不合理")}>{t("⚠️ 这题有问题")}</button>
      </div>
    </div>
  );
}

export default function Practice() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>}><PracticeInner /></Suspense>;
}
