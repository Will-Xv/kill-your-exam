"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";
import MD from "@/components/MD";
import { filesToAttachments } from "@/lib/attach";

const LETTERS = "ABCDEFGH".split("");

export default function UploadQuizPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [phase, setPhase] = useState("upload"); // upload | doing | done
  const [busy, setBusy] = useState(false);
  const [qs, setQs] = useState([]);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const attachments = await filesToAttachments(files);
      const r = await aiFetch("/api/quiz-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachments }) });
      if (r && r.questions && r.questions.length) { setQs(r.questions); setPhase("doing"); setIdx(0); }
      else alert(t("没识别出题目,换个更清晰的文件再试。"));
    } catch (err) { /* aiFetch 已弹错误框 */ }
    setBusy(false);
  }

  const q = qs[idx];
  const isChoice = q && (q.qtype === "single" || q.qtype === "multi");
  const isJudge = q && q.qtype === "judge";

  function toggleSel(L) { if (q.qtype === "single") setSel([L]); else setSel((s) => s.includes(L) ? s.filter((x) => x !== L) : [...s, L]); }

  async function submit(ans) {
    if (busy || !q || result) return;
    let userAnswer = ans != null ? ans : (isChoice ? sel.slice().sort().join("") : text);
    if (!String(userAnswer).trim()) return;
    setBusy(true);
    try {
      const r = await aiFetch("/api/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userAnswer, mode: "practice" }) });
      setResult(r);
      if (r && r.correct) setCorrectCount((c) => c + 1);
    } catch (e) {}
    setBusy(false);
  }
  function next() {
    setResult(null); setSel([]); setText("");
    if (idx + 1 >= qs.length) setPhase("done"); else setIdx(idx + 1);
  }

  if (phase === "upload") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 md:mt-14">
        <h1 className="text-lg font-bold">📤 {t("上传做题")}</h1>
        <p className="text-sm text-stone-500">{t("传一份带题目的文件(图片/PDF/文档),系统会识别出里面的题目,你就地逐道作答,做完自动把掌握度记进对应知识点。")}</p>
        <label className={"card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed py-10 text-center " + (busy ? "opacity-60" : "hover:border-amber-400")}>
          <input type="file" className="hidden" accept="image/*,.pdf,.docx,.txt,.md" multiple disabled={busy} onChange={onFiles} />
          <span className="text-3xl">{busy ? "⏳" : "📎"}</span>
          <span className="text-sm font-medium">{busy ? t("正在识别题目…") : t("点这里选文件(可多选)")}</span>
        </label>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 md:mt-14 text-center">
        <div className="text-3xl">🎯</div>
        <h1 className="text-lg font-bold">{t("做完了!")}</h1>
        <p className="text-stone-600">{t("答对 {a}/{b} 题,掌握度已记进对应知识点。").replace("{a}", correctCount).replace("{b}", qs.length)}</p>
        <div className="flex justify-center gap-2">
          <a className="btn" href="/study">{t("去看知识点掌握度")}</a>
          <button className="btn-ghost" onClick={() => { setPhase("upload"); setQs([]); setIdx(0); setCorrectCount(0); }}>{t("再传一份")}</button>
        </div>
      </div>
    );
  }

  // doing
  return (
    <div className="mx-auto max-w-2xl space-y-3 md:mt-14">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <span>{t("第 {i} / {n} 题").replace("{i}", idx + 1).replace("{n}", qs.length)}</span>
        {q.kpTitle ? <span className="text-xs">🔗 {q.kpTitle}</span> : <span className="text-xs text-stone-400">{t("(未匹配到知识点)")}</span>}
      </div>
      <div className="card space-y-3">
        <MD className="prose-zh font-medium">{q.stem}</MD>
        {isChoice && (
          <div className="space-y-2">
            {(q.options || []).map((op, i) => {
              const L = LETTERS[i];
              const on = sel.includes(L);
              return (
                <button key={i} disabled={!!result} onClick={() => toggleSel(L)}
                  className={"flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition " + (on ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-stone-300")}>
                  <span className="font-bold">{L}.</span><MD inline>{op}</MD>
                </button>
              );
            })}
          </div>
        )}
        {isJudge && (
          <div className="flex gap-2">
            {["对", "错"].map((v) => (
              <button key={v} disabled={!!result} onClick={() => submit(v)} className="btn-ghost flex-1">{t(v)}</button>
            ))}
          </div>
        )}
        {!isChoice && !isJudge && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} rows={3} placeholder={t("在这里作答…")}
            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
        )}

        {!result ? (
          !isJudge && <button className="btn w-full" disabled={busy} onClick={() => submit()}>{busy ? t("判分中…") : t("提交")}</button>
        ) : (
          <div className={"rounded-xl p-3 text-sm " + (result.correct ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
            <div className="font-bold">{result.correct ? t("✓ 答对了") : t("✗ 答错了")}{typeof result.score === "number" && q.qtype === "short" ? ` · ${result.score}` : ""}</div>
            {result.feedback ? <MD className="mt-1">{result.feedback}</MD> : null}
            {result.answer ? <div className="mt-1"><span className="font-semibold">{t("正确答案:")}</span> <MD inline>{String(result.answer)}</MD></div> : null}
            {result.explanation ? <MD className="mt-1 text-stone-600">{result.explanation}</MD> : null}
            <button className="btn mt-3 w-full" onClick={next}>{idx + 1 >= qs.length ? t("完成") : t("下一题")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
