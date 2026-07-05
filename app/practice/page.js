"use client";
import { useEffect, useState, Suspense, useRef } from "react";
import PerformTask from "@/components/PerformTask";
import HandwritePad from "@/components/HandwritePad";
import { useSearchParams } from "next/navigation";
import { useAiFetch } from "@/components/AiErrorDialog";
import { useT } from "@/components/I18n";
import SourceBadge from "@/components/SourceBadge";
import MD from "@/components/MD";
import { filesToAttachments } from "@/lib/attach";
import DropZone from "@/components/DropZone";
function b64ToFile(att){ try{ const bin=atob(att.data); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i); return new File([arr], att.name||"draft.png", {type:att.mime||"image/png"}); }catch{ return null; } }

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };

function PracticeInner() {
  const t = useT();
  const aiFetch = useAiFetch();
  const kpParam = useSearchParams().get("kp");
  const mode = useSearchParams().get("mode");
  const qParam = useSearchParams().get("q");
  const storeKey = `kye_practice:${mode || "free"}:${qParam ? "q" + qParam : (kpParam || "all")}`;
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
  const [aFiles, setAFiles] = useState([]);
  const [dFiles, setDFiles] = useState([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [handOpen, setHandOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(true);
  const [draftOpen, setDraftOpen] = useState(false);
  const [answers, setAnswers] = useState({});
  const [drafts, setDrafts] = useState({});
  const [hands, setHands] = useState({}); // 已提交的手写作答(qid->dataURL),提交后仍能看见
  const padRef = useRef(null);
  const draftRef = useRef(null);
  const bottom = useRef(null);
  const prefetched = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [discuss, dBusy]);

  async function fetchBatch() {
    if (qParam) { const d = await aiFetch(`/api/questions/get?id=${Number(qParam)}`); return { questions: d.question ? [d.question] : [], note: "" }; }
    if (mode === "review") { const d = await aiFetch("/api/review"); return { questions: d.questions || [], note: "" }; }
    const d = await aiFetch("/api/questions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kpParam ? Number(kpParam) : undefined, count: 5 }) });
    return { questions: d.questions || [], note: d.note || "" };
  }
  // 后台预取下一批,存起来,"再来一轮"时秒开
  function prefetchNext() {
    if (mode === "review") return;
    prefetched.current = null;
    fetchBatch().then((b) => { if (b.questions.length) prefetched.current = b; }).catch(() => {});
  }
  function reroll() { try { localStorage.removeItem(storeKey); localStorage.removeItem(storeKey + ":drafts"); localStorage.removeItem(storeKey + ":hands"); } catch {} prefetched.current = null; loadQuestions(); }
  async function loadQuestions() {
    setBusy(true); setQuestions([]); setIdx(0); setDone([]); setResult(null); setDiscuss(null); setAnswers({}); setDrafts({}); setHands({}); setSel([]); setText(""); setDraftOpen(false);
    // 若有预取好的一批,直接用,零等待
    if (prefetched.current && prefetched.current.questions.length) {
      const b = prefetched.current; prefetched.current = null;
      setQuestions(b.questions); setNote(b.note || ""); setBusy(false); prefetchNext(); return;
    }
    try { const b = await fetchBatch(); setQuestions(b.questions); setNote(b.note || ""); }
    catch {}
    setBusy(false);
    prefetchNext();
  }
  useEffect(() => {
    // 从"开始自由练习/换一批"进来带 ?fresh=1 时:忽略本地暂存、直接出新题(出完题后旧的这批就该换掉)
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("fresh")) {
        try { localStorage.removeItem(storeKey); localStorage.removeItem(storeKey + ":drafts"); localStorage.removeItem(storeKey + ":hands"); } catch {}
        try { const u = new URL(window.location.href); u.searchParams.delete("fresh"); window.history.replaceState(null, "", u.pathname + u.search); } catch {}
        loadQuestions();
        return;
      }
    } catch {}
    // 刷新页面时优先恢复上次这批题(不再重新出题),只有真正"再来一轮"才换新题
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && Array.isArray(saved.questions) && saved.questions.length && Date.now() - (saved.ts || 0) < 12 * 3600 * 1000) {
          setQuestions(saved.questions); setIdx(saved.idx || 0); setDone(saved.done || []); setNote(saved.note || "");
          const ans = saved.answers || {}; setAnswers(ans);
          let drf = {}; try { drf = JSON.parse(localStorage.getItem(storeKey + ":drafts") || "{}"); } catch {}
          setDrafts(drf);
          try { setHands(JSON.parse(localStorage.getItem(storeKey + ":hands") || "{}")); } catch {}
          const cur = saved.questions[saved.idx || 0];
          const st = cur && ans[cur.id];
          if (st) { setSel(st.sel || []); setText(st.text || ""); setResult(st.result || null); }
          if (Array.isArray(saved.discuss)) setDiscuss(saved.discuss); // 只恢复当前这道正在进行的追问,刷新不丢
          if (cur && drf[cur.id]) setDraftOpen(true);
          setBusy(false); prefetchNext();
          return;
        }
      }
    } catch {}
    loadQuestions();
  }, []);
  // 批次/进度变化时存下来,刷新可恢复
  useEffect(() => {
    if (!questions.length) return;
    try { localStorage.setItem(storeKey, JSON.stringify({ questions, idx, done, note, answers, discuss, ts: Date.now() })); } catch {}
  }, [questions, idx, done, note, answers, discuss]); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem(storeKey + ":drafts", JSON.stringify(drafts)); } catch {} }, [drafts]); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem(storeKey + ":hands", JSON.stringify(hands)); } catch {} }, [hands]); // eslint-disable-line
  // 当前题的作答状态(选项/文字/批改结果)随时存,刷新可恢复
  useEffect(() => { const cq = questions[idx]; if (!cq) return; setAnswers((a) => ({ ...a, [cq.id]: { sel, text, result } })); }, [sel, text, result]); // eslint-disable-line
  const q = questions[idx];

  async function submit() {
    const ans = q.qtype === "fill" || q.qtype === "short" ? text : sel.sort().join("");
    setBusy(true);
    try {
      let attachments = q.qtype === "short" ? await filesToAttachments(aFiles) : [];
      let handURL = hands[q.id] || null;
      if (!handURL && q.qtype === "short" && padRef.current) { const h = padRef.current.getImage(); if (h) handURL = `data:${h.mime || "image/png"};base64,${h.data}`; }
      if (handURL) { const b64 = handURL.split(",")[1]; if (b64) attachments = [...attachments, { name: "handwriting.png", mime: "image/png", data: b64 }].slice(0, 4); }
      const d = await aiFetch("/api/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userAnswer: ans, attachments }) });
      setResult(d); setDone((arr) => [...arr, d.correct]);
      if (handURL) setHands((hh) => ({ ...hh, [q.id]: handURL }));
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
    setAnswers((a) => ({ ...a, [q.id]: { sel, text, result } }));
    const ni = idx + 1; const nq = questions[ni]; const ns = nq ? answers[nq.id] : null;
    setResult(ns?.result ?? null); setSel(ns?.sel ?? []); setText(ns?.text ?? "");
    setReportOpen(false); setReportNote(""); setNoteOpen(false); setNoteBody(""); setNoteSaved(false);
    setDraftOpen(nq ? !!drafts[nq.id] : false);
    setIdx(ni);
  }
  async function sendDiscuss() {
    const msg = dInput.trim(); if ((!msg && !dFiles.length) || dBusy) return;
    const ua = q.qtype === "fill" || q.qtype === "short" ? text : sel.sort().join("");
    const attachments = await filesToAttachments(dFiles);
    const hist = [...(discuss || []), { role: "user", content: (msg || "(见附件)") + (attachments.length ? " 📎" + attachments.length : "") }];
    setDiscuss(hist); setDInput(""); setDFiles([]); setDBusy(true);
    try {
      const d = await aiFetch("/api/questions/discuss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userAnswer: ua, history: hist, attachments }) });
      setDiscuss([...hist, { role: "model", content: d.reply }]);
    } catch { setDiscuss(hist); }
    setDBusy(false);
  }
  async function submitReport() {
    setReportBusy(true);
    try {
      const d = await aiFetch("/api/questions/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, note: reportNote }) });
      alert(d.acted ? t("AI 确认这题确有问题,已移除并改进出题。感谢!") : t("AI 没发现这题有明显问题,已忽略(未删除)。若确有问题,请补充说明再提交。"));
      if (d.acted) { setReportOpen(false); setReportNote(""); setReportBusy(false); next(); return; } // 题目已被移除 -> 直接跳到下一题
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

  async function saveNote() {
    try {
      await aiFetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, body: noteBody.trim() }) });
      setNoteSaved(true); setNoteOpen(false);
    } catch {}
  }

  const letters = ["A", "B", "C", "D", "E", "F"];
  const isChoice = q.qtype === "single" || q.qtype === "multi" || q.qtype === "judge";
  const options = q.qtype === "judge" ? ["对", "错"] : q.body.options || [];
  const optValue = (i) => (q.qtype === "judge" ? options[i] : letters[i]);

  if (q.qtype === "perform") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{idx + 1} / {questions.length} · {t("表演任务")}</span>
          <span className="flex items-center gap-2"><button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={reroll} title={t("清掉这批,重新出题")}>🔄 {t("换一批")}</button><span className="badge-model">🤖 {t("AI出题")}</span></span>
        </div>
        <PerformTask key={q.id} q={q} onNext={next} />
        <div className="flex justify-end">
          <button className="btn-ghost text-xs" onClick={() => setReportOpen(true)}>⚠️ {t("题目有问题")}</button>
        </div>
        {reportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !reportBusy && setReportOpen(false)}>
            <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold">⚠️ {t("反馈:题目有问题")}</h3>
              <p className="text-xs text-slate-500 mt-1">{t("比如:配乐与题目要求的风格不符、题目要求不合理、录制方式有问题等。")}</p>
              <textarea className="input mt-2" rows={3} value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder={t("补充说明(可选):这题哪里有问题?写清楚能帮 AI 更准地改进")} />
              <div className="mt-3 flex gap-2">
                <button className="btn-ghost flex-1 py-2" onClick={() => setReportOpen(false)} disabled={reportBusy}>{t("取消")}</button>
                <button className="btn flex-1 py-2" onClick={submitReport} disabled={reportBusy}>{reportBusy ? t("分析中…") : t("提交")}</button>
              </div>
              <button className="btn-ghost w-full py-2 mt-2 text-sm text-slate-500" onClick={() => { setReportOpen(false); next(); }} disabled={reportBusy}>{t("跳过这道题 →")}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{mode === "review" ? t("🔁 错题重练 · ") : ""}{idx + 1} / {questions.length} · {t(QTYPE[q.qtype])}</span>
        <span className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs mr-2" onClick={reroll} title={t("清掉这批,重新出题")}>🔄 {t("换一批")}</button>
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
                  className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  {q.qtype !== "judge" && <b className="mr-2">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : <MD inline>{op}</MD>}
                </button>
              );
            })}
          </div>
        )}
        {q.qtype === "fill" && <textarea className="input mt-3" rows={2} placeholder={t("填写答案")} value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} />}
        {q.qtype === "short" && (
          <div className="mt-3">
            {!result && <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setTypeOpen((v) => !v)}>⌨️ {typeOpen ? t("收起打字框") : t("打字作答")}</button>}
            {(typeOpen || !!result) && <textarea className="input mt-2" rows={5} placeholder={t("写下你的回答(口语化也行)")} value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} />}
          </div>
        )}
        {q.qtype === "short" && !result && (
          <DropZone onFiles={(fs) => setAFiles((p) => [...p, ...fs])} className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <label className="btn-ghost cursor-pointer px-3 py-1" title={t("上传图片/文件作答(可拖拽或粘贴)")}>📎 {t("拍照/上传作答")}<input type="file" multiple hidden accept="image/*,.pdf" onChange={(e) => setAFiles([...e.target.files])} /></label>
            {aFiles.length > 0 && <span>{aFiles.length} {t("个文件")} <button className="underline" onClick={() => setAFiles([])}>{t("清除")}</button></span>}
          </DropZone>
        )}
        {q.qtype === "short" && !result && (
          <div className="mt-2">
            <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setHandOpen((v) => !v)}>✍️ {handOpen ? t("收起手写") : t("手写作答(触控笔/手写板)")}</button>
            {handOpen && <HandwritePad key={q.id} ref={padRef} initial={hands[q.id]} onChange={(url) => setHands((h) => ({ ...h, [q.id]: url || undefined }))} />}
          </div>
        )}
        {q.qtype === "short" && !!result && hands[q.id] && (
          <div className="mt-2">
            <p className="text-xs text-slate-500 mb-1">✍️ {t("你的手写作答")}</p>
            <img src={hands[q.id]} alt="handwriting" className="w-full rounded-xl border border-slate-200 bg-white" />
          </div>
        )}
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setDraftOpen((v) => !v)}>✏️ {draftOpen ? t("收起草稿纸") : t("草稿纸(手写演算,不计入作答)")}</button>
          {draftOpen && <HandwritePad key={"draft-" + q.id} ref={draftRef} initial={drafts[q.id]} onChange={(url) => setDrafts((d) => ({ ...d, [q.id]: url }))} />}
        </div>
      </div>

      {result && (
        <div className={`card ${result.correct ? "border-amber-400 bg-amber-50" : (result.score >= 40 ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50")}`}>
          <p className="font-bold">
            {q.qtype === "short" ? `${result.score} ${t("分")}` : (result.correct ? t("✓ 答对了") : t("✗ 不对"))}
          </p>
          <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{q.qtype === "judge" ? t(result.answer) : <MD inline>{result.answer}</MD>}</p>
          {result.feedback && <div className="text-sm mt-1"><b>{t("点评:")}</b><MD inline>{result.feedback}</MD></div>}
          <div className="text-sm mt-1 text-slate-600"><b>{t("解析:")}</b><MD inline>{result.explanation}</MD></div>
          {result.revisedNote && <p className="text-sm mt-1 text-amber-700">↺ {result.revisedNote}</p>}
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
              <div key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-amber-600 text-white" : "bg-slate-100"}`}>{m.role === "user" ? m.content : <MD inline>{m.content}</MD>}</div>
            ))}
            {dBusy && <div className="max-w-[88%] rounded-2xl px-3 py-2 text-sm bg-slate-100 text-slate-400 animate-pulse">{t("思考中…")}</div>}
            <div ref={bottom} />
          </div>
          {dFiles.length > 0 && <p className="text-xs text-slate-500 mt-2">📎 {dFiles.length} {t("个文件")} <button className="underline" onClick={() => setDFiles([])}>{t("清除")}</button></p>}
          <DropZone onFiles={(fs) => setDFiles((p) => [...p, ...fs])} className="mt-2 flex gap-2">
            <button type="button" className="btn-ghost px-3 whitespace-nowrap text-sm" title={t("把你在草稿纸上手写的内容发给 AI")} onClick={() => { const h = draftRef.current && draftRef.current.getImage(); if (h) { const f = b64ToFile(h); if (f) setDFiles((p) => [...p, f]); } else { setDraftOpen(true); } }}>📝 {t("发草稿纸")}</button>
            <label className="btn-ghost cursor-pointer px-3" title={t("上传文件/图片(可拖拽或粘贴)")}>📎<input type="file" multiple hidden accept="image/*,.pdf,.txt" onChange={(e) => setDFiles([...e.target.files])} /></label>
            <input className="input flex-1" value={dInput} onChange={(e) => setDInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendDiscuss()} placeholder={t("例如:我觉得我这样答也对,因为…")} />
            <button className="btn px-4" onClick={sendDiscuss} disabled={dBusy || (!dInput.trim() && !dFiles.length)}>{t("发送")}</button>
          </DropZone>
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
        {result && <button className="btn-ghost text-xs" onClick={() => { setNoteOpen((v) => !v); }}>📝 {noteSaved ? t("已记入笔记本 · 再记") : t("记笔记")}</button>}
        <button className="btn-ghost text-xs" onClick={() => setReportOpen(true)}>⚠️ {t("题目有问题")}</button>
      </div>
      {noteOpen && (
        <div className="card space-y-2">
          <p className="text-sm font-medium">📝 {t("给这道题记点笔记")}</p>
          <p className="text-xs text-stone-400">{t("这道题会连同你的笔记收进笔记本(错题本不受影响)。")}</p>
          <textarea className="input" rows={3} placeholder={t("比如:这里我总是记错,注意…")} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn text-sm py-1.5" onClick={saveNote}>{t("保存到笔记本")}</button>
            <button className="btn-ghost text-sm py-1.5" onClick={() => setNoteOpen(false)}>{t("取消")}</button>
          </div>
        </div>
      )}

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
            <button className="btn-ghost w-full py-2 mt-2 text-sm text-slate-500" onClick={() => { setReportOpen(false); next(); }} disabled={reportBusy}>{t("跳过这道题 →")}</button>
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
