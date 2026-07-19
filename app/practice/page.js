"use client";
import { alertDialog } from "@/components/ui/dialog";
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

function GenProgress() {
  const t = useT();
  const [sec, setSec] = useState(0);
  useEffect(() => { const id = setInterval(() => setSec((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const steps = [t("正在查题库…"), t("正在检索你的资料…"), t("AI 正在出题…(第一次或冷门知识点会久一点)"), t("正在整理题目…")];
  const msg = steps[Math.min(Math.floor(sec / 5), steps.length - 1)];
  return (
    <div className="mt-16 text-center">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
      <p className="text-slate-500">{msg}</p>
      <p className="mt-1 text-xs text-slate-400">{sec}s</p>
      <p className="mx-auto mt-3 max-w-xs text-xs text-slate-400">{t("生成较慢?可以先去别处——题目会在后台继续备好,回来就有了。")}</p>
    </div>
  );
}
function stripLabel(op, i) {
  const L = ["A", "B", "C", "D", "E", "F"][i] || "";
  return String(op == null ? "" : op).replace(new RegExp("^\\s*" + L + "[.．)、,]\\s*", "i"), "");
}
function b64ToFile(att){ try{ const bin=atob(att.data); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i); return new File([arr], att.name||"draft.png", {type:att.mime||"image/png"}); }catch{ return null; } }

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };

function PracticeInner() {
  const t = useT();
  const aiFetch = useAiFetch();
  const kpParam = useSearchParams().get("kp");
  const kpsParam = useSearchParams().get("kps");   // 自由练习按任务日期锚定的一组知识点
  const mode = useSearchParams().get("mode");
  const qParam = useSearchParams().get("q");
  const idsParam = useSearchParams().get("ids");   // 上传做题:把识别出的题按 id 载进来
  const quizSid = useSearchParams().get("quiz");   // 上传做题会话id(供"重新识别")
  const storeKey = `kye_practice:${mode || "free"}:${mode === "quiz" && idsParam ? "ids" + idsParam.replace(/[^0-9]/g, "-").slice(0, 60) : qParam ? "q" + qParam : (kpParam || (kpsParam ? "kps" + kpsParam.replace(/[^0-9]/g, "-").slice(0, 40) : "all"))}`;
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [tagNote, setTagNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [gradeErr, setGradeErr] = useState("");
  const [done, setDone] = useState({}); // { [questionId]: correct }
  const [note, setNote] = useState("");
  const [pendingFinalize, setPendingFinalize] = useState(0); // 后台讨论改判未完成的数量,结算页据此先 load
  const [reportOpen, setReportOpen] = useState(false);
  const [quizFixOpen, setQuizFixOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [bugNote, setBugNote] = useState("");
  const [bugBusy, setBugBusy] = useState(false);
  const [bugDone, setBugDone] = useState(false);
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
  const hydrated = useRef(false); // 挂载+恢复完成后才允许写 localStorage,避免用空值覆盖已存进度
  const draftRef = useRef(null);
  const performBlobRef = useRef(null);
  const performGradeRef = useRef(null);
  const bottom = useRef(null);
  const prefetched = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [discuss, dBusy]);

  async function fetchBatch(exclude = []) {
    if (qParam) { const d = await aiFetch(`/api/questions/get?id=${Number(qParam)}`); return { questions: d.question ? [d.question] : [], note: "" }; }
    if (mode === "review") { const d = await aiFetch("/api/review"); return { questions: d.questions || [], note: "" }; }
    if (mode === "quiz" && idsParam) { const d = await aiFetch(`/api/questions/byids?ids=${encodeURIComponent(idsParam)}`); return { questions: d.questions || [], note: "" }; }
    const d = await aiFetch("/api/questions/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kpParam ? Number(kpParam) : undefined, kpIds: kpsParam ? kpsParam.split(",").map(Number).filter(Boolean) : undefined, count: 5, exclude }) });
    return { questions: d.questions || [], note: d.note || "" };
  }
  // 后台预取下一批(在用户做题时就同时把下一批找好,换一批/再来一轮时零等待)。exclude=当前屏上的题,保证预取到的是新题。
  function prefetchNext(excludeIds = []) {
    if (mode === "review" || mode === "quiz") return;
    prefetched.current = null;
    fetchBatch(excludeIds).then((b) => { if (b.questions.length) prefetched.current = b; }).catch(() => {});
  }
  // 换一批:优先用已经在后台预取好的那批(秒开);没有再现拉。不清预取,免得白等。
  function reroll() { try { localStorage.removeItem(storeKey); localStorage.removeItem(storeKey + ":drafts"); localStorage.removeItem(storeKey + ":hands"); } catch {} loadQuestions(); }
  async function loadQuestions() {
    setBusy(true); setQuestions([]); setIdx(0); setDone({}); setResult(null); setDiscuss(null); setAnswers({}); setDrafts({}); setHands({}); setSel([]); setText(""); setDraftOpen(false);
    // 若有预取好的一批,直接用,零等待
    if (prefetched.current && prefetched.current.questions.length) {
      const b = prefetched.current; prefetched.current = null;
      setQuestions(b.questions); setNote(b.note || ""); setBusy(false); prefetchNext(b.questions.map((q) => q.id)); return;
    }
    let cur = [];
    try { const b = await fetchBatch(); setQuestions(b.questions); setNote(b.note || ""); cur = b.questions.map((q) => q.id); }
    catch {}
    setBusy(false);
    prefetchNext(cur);
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
          setQuestions(saved.questions); setIdx(saved.idx || 0); setDone(saved.done && !Array.isArray(saved.done) ? saved.done : {}); setNote(saved.note || "");
          const ans = saved.answers || {}; setAnswers(ans);
          let drf = {}; try { drf = JSON.parse(localStorage.getItem(storeKey + ":drafts") || "{}"); } catch {}
          setDrafts(drf);
          try { setHands(JSON.parse(localStorage.getItem(storeKey + ":hands") || "{}")); } catch {}
          const cur = saved.questions[saved.idx || 0];
          const st = cur && ans[cur.id];
          if (st) { setSel(st.sel || []); setText(st.text || ""); setResult(st.result || null); }
          if (Array.isArray(saved.discuss)) setDiscuss(saved.discuss); // 只恢复当前这道正在进行的追问,刷新不丢
          if (cur && drf[cur.id]) setDraftOpen(true);
          setBusy(false); prefetchNext(saved.questions.map((q) => q.id));
          return;
        }
      }
    } catch {}
    loadQuestions();
  }, []);
  useEffect(() => { const id = setTimeout(() => { hydrated.current = true; }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { performBlobRef.current = null; performGradeRef.current = null; }, [idx, questions]); // 换题就清掉上一题的录音/判分,避免错挂到别的题的bug
  // 批次/进度变化时存下来,刷新可恢复
  useEffect(() => {
    if (!hydrated.current || !questions.length) return;
    try { localStorage.setItem(storeKey, JSON.stringify({ questions, idx, done, note, answers, discuss, ts: Date.now() })); } catch {}
  }, [questions, idx, done, note, answers, discuss]); // eslint-disable-line
  useEffect(() => { if (!hydrated.current) return; try { localStorage.setItem(storeKey + ":drafts", JSON.stringify(drafts)); } catch {} }, [drafts]); // eslint-disable-line
  useEffect(() => { if (!hydrated.current) return; try { localStorage.setItem(storeKey + ":hands", JSON.stringify(hands)); } catch {} }, [hands]); // eslint-disable-line
  // 当前题的作答状态(选项/文字/批改结果)随时存,刷新可恢复
  useEffect(() => { const cq = questions[idx]; if (!cq) return; setAnswers((a) => ({ ...a, [cq.id]: { sel, text, result } })); }, [sel, text, result]); // eslint-disable-line
  useEffect(() => { setTagNote(""); }, [idx]);
  async function tagAttempt(tag) {
    const aid = result?.attemptId; if (!aid) return;
    const notes = { careless: t("已记为粗心 · 基本不计入掌握度"), guessed: t("已记为猜对 · 已安排验证题尽快再考"), slow: t("已记为懂但慢 · 会安排练速度") };
    setTagNote(notes[tag] || "");
    try { await fetch("/api/questions/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: aid, tag }) }); } catch {}
  }
  const q = questions[idx];

  function playScript(text, lang) { try { const sy = window.speechSynthesis; if (!sy || !text) return; sy.cancel(); const u = new SpeechSynthesisUtterance(String(text)); u.lang = lang || "en-US"; u.rate = 0.95; sy.speak(u); } catch {} }
  function fmtMastery(ups) {
    if (!Array.isArray(ups) || !ups.length) return "";
    const seen = new Set(); const parts = [];
    for (const u of ups) { if (!u || !u.title || seen.has(u.kpId)) continue; seen.add(u.kpId); parts.push(`〈${u.title}〉${u.kind === "understanding" ? "↑" : "↓"}`); }
    return parts.length ? t("已据此更新熟悉程度:") + parts.join("、") : "";
  }
  async function submit(dontKnow = false) {
    const ans = q.qtype === "fill" || q.qtype === "short" ? text : [...sel].sort().join("");
    setBusy(true); setGradeErr("");
    try {
      let attachments = (!dontKnow && q.qtype === "short") ? await filesToAttachments(aFiles) : [];
      let handURL = hands[q.id] || null;
      if (!dontKnow && !handURL && q.qtype === "short" && padRef.current) { const h = padRef.current.getImage(); if (h) handURL = `data:${h.mime || "image/png"};base64,${h.data}`; }
      if (!dontKnow && handURL) { const b64 = handURL.split(",")[1]; if (b64) attachments = [...attachments, { name: "handwriting.png", mime: "image/png", data: b64 }].slice(0, 4); }
      const attemptMode = mode === "review" ? "review" : (kpParam ? "kp" : "practice"); // 错题→review、单个薄弱点→kp、自由练习(含 kps 锚定)→practice;供自由练习计数只算 practice
      const d = await aiFetch("/api/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userAnswer: ans, attachments, dontKnow, mode: attemptMode }) });
      const mn = fmtMastery(d.masteryUpdates); setResult(mn ? { ...d, masteryNote: mn } : d); setDone((m) => ({ ...m, [q.id]: !!d.correct }));
      if (handURL) setHands((hh) => ({ ...hh, [q.id]: handURL }));
    } catch (e) { setGradeErr(t("提交失败,请重试(若反复失败,截图发我)。") + " " + (e?.message || "")); }
    setBusy(false);
  }
  // 后台收尾讨论(判分修订):不阻塞“下一题”。更新的是【离开的那道题】的存档,不碰当前显示。
  function finalizeDiscussBg(qid, hist, attemptId) {
    if (!(hist && hist.length >= 2)) return;
    setPendingFinalize((n) => n + 1);
    aiFetch("/api/questions/discuss/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: qid, attemptId, history: hist }) })
      .then((d) => {
        const mn = fmtMastery(d.applied?.masteryUpdates);
        const dTag = d.applied?.tag ? ({ careless: t("已记为粗心 · 基本不计入掌握度"), guessed: t("已记为猜对 · 已安排验证题尽快再考"), slow: t("已记为懂但慢 · 会安排练速度") })[d.applied.tag] : null;
        const dLabels = d.applied?.labels || null;
        if (!d.applied?.revised && !mn && !dTag && !(dLabels && dLabels.length)) return;
        setAnswers((a) => {
          const prev = a[qid] || {}; const r = prev.result || {};
          return { ...a, [qid]: { ...prev, result: { ...r,
            ...(d.applied?.revised ? { correct: d.applied.newCorrect, score: d.applied.newScore, feedback: d.applied.newFeedback || r.feedback, revisedNote: (t("已按讨论修订评分为") + " " + d.applied.newScore + (d.applied.reason ? " · " + d.applied.reason : "")) } : {}),
            ...(mn ? { masteryNote: mn } : {}),
            ...(dTag ? { discussTagNote: dTag } : {}),
            ...(dLabels && dLabels.length ? { discussLabels: dLabels } : {}) } } };
        });
        if (d.applied?.revised) setDone((m) => ({ ...m, [qid]: !!d.applied.newCorrect }));
      }).catch(() => {}).finally(() => setPendingFinalize((n) => Math.max(0, n - 1)));
  }
  function next() {
    try { window.speechSynthesis?.cancel(); } catch {}
    const qid = q.id, curDiscuss = discuss, curAttemptId = result?.attemptId;
    setAnswers((a) => ({ ...a, [qid]: { sel, text, result } }));
    const ni = idx + 1; const nq = questions[ni]; const ns = nq ? answers[nq.id] : null;
    setResult(ns?.result ?? null); setSel(ns?.sel ?? []); setText(ns?.text ?? "");
    setReportOpen(false); setReportNote(""); setNoteOpen(false); setNoteBody(""); setNoteSaved(false);
    setDraftOpen(nq ? !!drafts[nq.id] : false);
    setDiscuss(null); setDInput("");
    setIdx(ni);                       // 立即前进,不等网络
    finalizeDiscussBg(qid, curDiscuss, curAttemptId); // 讨论收尾放后台
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
      alertDialog(d.acted ? t("AI 确认这题确有问题,已移除并改进出题。感谢!") : t("AI 没发现这题有明显问题,已忽略(未删除)。若确有问题,请补充说明再提交。"));
      if (d.acted) { setReportOpen(false); setReportNote(""); setReportBusy(false); next(); return; } // 题目已被移除 -> 直接跳到下一题
    } catch {}
    setReportOpen(false); setReportNote(""); setReportBusy(false);
  }
  // 上传做题:重新识别原来那份上传文件(复用会话里存的文件),识别完带新题重进
  async function reRecognize() {
    if (!quizSid || reportBusy) return;
    setReportBusy(true);
    try {
      const r = await aiFetch("/api/quiz-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reRecognize: Number(quizSid) }) });
      if (r && r.questions && r.questions.length) {
        try { localStorage.removeItem(storeKey); localStorage.removeItem(storeKey + ":drafts"); localStorage.removeItem(storeKey + ":hands"); } catch {}
        const ids = r.questions.map((x) => x.id).join(",");
        window.location.href = `/practice?mode=quiz&ids=${ids}&quiz=${quizSid}`;
        return;
      }
      alertDialog(t("重新识别没得到题目,可能文件已过期,请重新上传。"));
    } catch (e) {}
    setReportBusy(false);
  }
  async function collectDiag() {
    try {
      const n = navigator; let mic = "unknown";
      try { if (n.permissions?.query) { const p = await n.permissions.query({ name: "microphone" }); mic = p.state; } } catch {}
      return { ua: n.userAgent, platform: n.platform, lang: n.language, screen: `${window.screen?.width}x${window.screen?.height} @${window.devicePixelRatio || 1}`,
        mediaSupported: !!(n.mediaDevices && n.mediaDevices.getUserMedia), micPermission: mic, secure: window.isSecureContext,
        inApp: /MicroMessenger|QQ\/|Weibo|Quark|UCBrowser/i.test(n.userAgent), path: location.pathname, ts: new Date().toISOString() };
    } catch { return null; }
  }
  async function submitBug() {
    setBugBusy(true);
    try {
      const diag = await collectDiag();
      const uploads = q.qtype === "short" ? await filesToAttachments(aFiles) : [];
      let handImage = hands[q.id] || null;
      try { if (!handImage && padRef.current) { const h = padRef.current.getImage(); if (h) handImage = `data:${h.mime || "image/png"};base64,${h.data}`; } } catch {}
      let draftImage = drafts[q.id] || null;
      try { if (!draftImage && draftRef.current) { const h = draftRef.current.getImage(); if (h) draftImage = `data:${h.mime || "image/png"};base64,${h.data}`; } } catch {}
      const userAnswer = (q.qtype === "fill" || q.qtype === "short") ? text : [...sel].sort().join("");
      const grade = q.qtype === "perform" ? (performGradeRef.current || null) : (result ? { correct: result.correct, score: result.score, feedback: result.feedback } : null);
      const bugRes = await aiFetch("/api/bug", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, userNote: bugNote, context: { userAnswer, selected: sel, grade, discuss, draftImage, handImage, uploads, diag } }) });
      if (performBlobRef.current && bugRes?.id) {
        try { const fd = new FormData(); fd.append("bugId", String(bugRes.id)); fd.append("recording", performBlobRef.current, "user-recording.webm"); await aiFetch("/api/bug/recording", { method: "POST", body: fd }); } catch {}
      }
      setBugDone(true); setBugNote("");
    } catch {}
    setBugBusy(false);
  }

  if (busy && !questions.length) return <GenProgress />;
  if (!questions.length) return mode === "review"
    ? <div className="mt-16 text-center text-slate-400 space-y-3"><p>{t("🎉 没有到期的错题,今天不用重练。")}</p><a className="btn" href="/practice">{t("去做新题")}</a></div>
    : <div className="mt-16 text-center text-slate-400 space-y-3">
        <p>{note ? note + " " : <>{t("暂时没有题目。先去")}<a className="underline" href="/onboarding">{t("设置考试")}</a>{t("或")}<a className="underline" href="/study">{t("学习页")}</a>。</>}</p>
        {mode !== "quiz" && <button type="button" className="btn" onClick={reroll} disabled={busy}>🔄 {busy ? t("出题中…") : t("换一批")}</button>}
      </div>;

  if (idx >= questions.length) {
    if (pendingFinalize > 0) return (
      <div className="mt-24 text-center text-slate-400 space-y-3">
        <div className="shimmer mx-auto h-10 w-10 rounded-full" />
        <p>{t("正在结算…应用讨论改判中")}</p>
      </div>
    );
    const doneVals = Object.values(done); const right = doneVals.filter(Boolean).length;
    return (
      <div className="mt-16 text-center space-y-4">
        <div className="text-5xl">{right === doneVals.length ? "🎉" : "💪"}</div>
        <h1 className="text-2xl font-bold">{t("本轮完成:")}{right} / {doneVals.length}</h1>
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

  const bugModal = bugOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !bugBusy && setBugOpen(false)}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">🐞 {t("反馈bug(题目设计/功能问题)")}</h3>
        <p className="text-xs text-slate-500 mt-1">{t("用于题目设计或功能问题——比如无法录音、题目与选项对不上、显示错乱、按钮无效等。(如果是题目本身出错/答案不对/歧义,请用「题目有问题」。)提交后会把这道题的完整信息和你的作答/草稿/追问一起发给开发者。")}</p>
        {bugDone ? (
          <div className="mt-3">
            <p className="text-sm text-emerald-700">✓ {t("已提交,谢谢!开发者会看到,并可能给你回信。")}</p>
            <button className="btn w-full py-2 mt-3" onClick={() => setBugOpen(false)}>{t("完成")}</button>
          </div>
        ) : (
          <>
            <textarea className="input mt-2" rows={3} value={bugNote} onChange={(e) => setBugNote(e.target.value)} placeholder={t("说说遇到的问题(可选):是什么坏了?怎么复现?")} />
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1 py-2" onClick={() => setBugOpen(false)} disabled={bugBusy}>{t("取消")}</button>
              <button className="btn flex-1 py-2" onClick={submitBug} disabled={bugBusy}>{bugBusy ? t("提交中…") : t("提交bug")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;
  if (q.qtype === "perform") {
    return (
      <div className="space-y-3 pb-28">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{idx + 1} / {questions.length} · {t("表演任务")}</span>
          {mode !== "quiz" && <span className="flex items-center gap-2"><button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={reroll} title={t("清掉这批,重新出题")}>🔄 {t("换一批")}</button><span className="badge-model">🤖 {t("AI出题")}</span></span>}
        </div>
        <PerformTask key={q.id} q={q} onNext={next} onRecorded={(blob) => { performBlobRef.current = blob; }} onGraded={(d) => { performGradeRef.current = d; }} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={() => (mode === "quiz" ? setQuizFixOpen(true) : setReportOpen(true))}>⚠️ {t("题目有问题")}</button>
          <button className="btn-ghost text-xs" onClick={() => { setBugDone(false); setBugOpen(true); }}>🐞 {t("反馈bug")}</button>
        </div>
        {bugModal}
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
    <div className="space-y-3 pb-28">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{mode === "review" ? t("🔁 错题重练 · ") : ""}{idx + 1} / {questions.length} · {t(QTYPE[q.qtype])}</span>
        <span className="flex items-center gap-1.5">
          {mode !== "quiz" && <button type="button" className="btn-ghost px-2 py-0.5 text-xs mr-2" onClick={reroll} title={t("清掉这批,重新出题")}>🔄 {t("换一批")}</button>}
          {mode !== "quiz" && (q.is_real ? <span className="badge-material">📜 {t("真题")}</span> : q.origin === "online" ? <span className="badge-model">🤖 {t("原创仿真")}</span> : <span className="badge-model">🤖 {t("AI出题")}</span>)}
          <SourceBadge sourceType={q.source_type} refs={q.source_refs} />
        </span>
      </div>
      <div className="card">
        <MD className="font-medium prose-zh">{q.body.stem}</MD>
        {q.body.audioId && <div className="mt-3"><div className="mb-1 text-xs text-slate-500">🎧 {t("先听录音,再作答(可反复播放)")}</div><audio controls preload="metadata" className="w-full" src={`/api/materials/raw?id=${q.body.audioId}`} /></div>}
        {q.body.listenScript && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="mb-2 text-xs text-slate-500">🎧 {t("听力题:点播放、听完再作答(AI 合成的原创听力,可反复播放)")}</div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => playScript(q.body.listenScript, q.body.ttsLang)}>▶️ {t("播放录音")}</button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { try { window.speechSynthesis?.cancel(); } catch {} }}>■ {t("停止")}</button>
            </div>
            {!!result && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">{t("查看听力原文")}</summary><p className="mt-1 whitespace-pre-line">{q.body.listenScript}</p></details>}
          </div>
        )}
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setDraftOpen((v) => !v)}>✏️ {draftOpen ? t("收起草稿纸") : t("草稿纸(手写演算,不计入作答)")}</button>
          {draftOpen && <HandwritePad key={"draft-" + q.id} ref={draftRef} initial={drafts[q.id]} onChange={(url) => setDrafts((d) => ({ ...d, [q.id]: url }))} />}
        </div>
        {isChoice && (
          <div className="mt-3 space-y-2">
            {q.qtype === "multi" && <p className="text-sm font-semibold text-amber-700">🔵 {t("多选题 · 可选多个正确答案")}</p>}
            {options.map((op, i) => {
              const v = optValue(i); const active = sel.includes(v);
              return (
                <button key={i} disabled={!!result} onClick={() => setSel(q.qtype === "multi" ? (active ? sel.filter((x) => x !== v) : [...sel, v]) : [v])}
                  className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  {q.qtype !== "judge" && <b className="mr-2">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : <MD inline>{stripLabel(op, i)}</MD>}
                </button>
              );
            })}
          </div>
        )}
        {q.qtype === "fill" && <textarea className="input mt-3" rows={2} placeholder={t("填写答案")} value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} />}
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
      </div>

      {result && (
        <div className={`card ${result.correct ? "border-amber-400 bg-amber-50" : (result.score >= 40 ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50")}`}>
          <p className="font-bold">
            {result.dontKnow ? t("🤷 不会做 · 看看答案") : q.qtype === "short" ? `${result.score} ${t("分")}` : (result.correct ? t("✓ 答对了") : t("✗ 不对"))}
          </p>
          <p className="text-sm mt-1"><b>{t("参考答案:")}</b>{q.qtype === "judge" ? t(result.answer) : <MD inline>{result.answer}</MD>}</p>
          {result.feedback && <div className="text-sm mt-1"><b>{t("点评:")}</b><MD inline>{result.feedback}</MD></div>}
          <div className="text-sm mt-1 text-slate-600"><b>{t("解析:")}</b><MD inline>{result.explanation}</MD></div>
          {result.revisedNote && <p className="text-sm mt-1 text-amber-700">↺ <MD inline>{result.revisedNote}</MD></p>}
          {result.masteryNote && <p className="text-sm mt-1 text-emerald-700">📊 <MD inline>{result.masteryNote}</MD></p>}
          {!result.dontKnow && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200/60 pt-2">
              <span className="text-xs text-slate-500">{t("这次其实是?")}</span>
              {!result.correct && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => tagAttempt("careless")}>😅 {t("粗心,我会的")}</button>}
              {result.correct && q.qtype !== "short" && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => tagAttempt("guessed")}>🎲 {t("刚才是猜的")}</button>}
              {result.correct && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => tagAttempt("slow")}>🐢 {t("懂但慢")}</button>}
            </div>
          )}
          {tagNote && <p className="text-xs text-emerald-700 mt-1">✓ {tagNote}</p>}
          {result.discussTagNote && <p className="text-xs text-emerald-700 mt-1">✓ {result.discussTagNote}</p>}
          {result.discussLabels?.length > 0 && <p className="text-xs text-emerald-700 mt-1">🏷️ {t("已加标记:")}{result.discussLabels.map((l) => (typeof l === "string" ? l : l.name + (l.effect === "down" ? " ↓" : l.effect === "up" ? " ↑" : ""))).join("、")}</p>}
          <p className="text-xs text-slate-400 mt-2">
            {mode === "quiz" ? t("题目:来自你上传的文件") : q.is_real ? t("题目:历年真题") : q.origin === "online" ? t("题目:AI 原创(参考真实题型,非官方真题原文——避免版权)") : t("题目:AI 生成")}
            {" · "}{mode === "quiz" ? (result.answer_origin === "provided" ? t("标准答案:来自你上传的文件") : t("标准答案:AI 解出")) : result.answer_origin === "provided" ? t("标准答案:来自网上") : t("标准答案:AI 给出")}
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
          <DropZone onFiles={(fs) => setDFiles((p) => [...p, ...fs])} className="mt-2 space-y-2">
            <textarea className="input w-full" rows={2} value={dInput} onChange={(e) => setDInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDiscuss(); } }} placeholder={t("例如:我觉得我这样答也对,因为…")} />
            <div className="flex gap-2">
              <button type="button" className="btn-ghost px-3 whitespace-nowrap text-sm" title={t("把你在草稿纸上手写的内容发给 AI")} onClick={() => { const h = draftRef.current && draftRef.current.getImage(); if (h) { const f = b64ToFile(h); if (f) setDFiles((p) => [...p, f]); } else { setDraftOpen(true); } }}>📝 {t("发草稿纸")}</button>
              <label className="btn-ghost cursor-pointer px-3 flex items-center" title={t("上传文件/图片(可拖拽或粘贴)")}>📎<input type="file" multiple hidden accept="image/*,.pdf,.txt" onChange={(e) => setDFiles([...e.target.files])} /></label>
              <button className="btn px-5 ml-auto" onClick={sendDiscuss} disabled={dBusy || (!dInput.trim() && !dFiles.length)}>{t("发送")}</button>
            </div>
          </DropZone>
        </div>
      )}

      {gradeErr && <p className="text-sm text-red-600">{gradeErr}</p>}
      <div className="flex flex-wrap gap-2">
        {!result ? (
          <>
            <button className="btn flex-1" onClick={() => submit(false)} disabled={busy || (isChoice ? !sel.length : !text.trim() && q.qtype !== "short")}>{busy ? t("批改中…") : t("提交答案")}</button>
            <button className="btn-ghost px-3" onClick={() => submit(true)} disabled={busy} title={t("直接看答案和解析,本题计为不会")}>🤷 {t("不会做")}</button>
          </>
        ) : (
          <>
            {discuss === null && <button className="btn-ghost text-sm" onClick={() => setDiscuss([])}>💬 {t("有疑问?追问/争论")}</button>}
            <button className="btn flex-1" onClick={next}>{t("下一题 →")}</button>
          </>
        )}
        {result && <button className="btn-ghost text-xs" onClick={() => { setNoteOpen((v) => !v); }}>📝 {noteSaved ? t("已记入笔记本 · 再记") : t("记笔记")}</button>}
        <button className="btn-ghost text-xs" onClick={() => (mode === "quiz" ? setQuizFixOpen(true) : setReportOpen(true))}>⚠️ {t("题目有问题")}</button>
        <button className="btn-ghost text-xs" onClick={() => { setBugDone(false); setBugOpen(true); }}>🐞 {t("反馈bug")}</button>
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

      {quizFixOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !reportBusy && setQuizFixOpen(false)}>
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">⚠️ {t("这道题识别得不对?")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("这些题是从你上传的文件识别来的。如果识别/切题有问题,可以让系统重新识别原来那份文件,或换一份重新上传。")}</p>
            <div className="mt-3 flex flex-col gap-2">
              <button className="btn py-2" disabled={reportBusy || !quizSid} onClick={reRecognize}>{reportBusy ? t("重新识别中…") : t("重新识别上传的文件")}</button>
              <button className="btn-ghost py-2" disabled={reportBusy} onClick={() => { window.location.href = "/upload-quiz"; }}>{t("重新上传文件")}</button>
              <button className="btn-ghost py-2 text-sm text-slate-500" onClick={() => setQuizFixOpen(false)} disabled={reportBusy}>{t("取消")}</button>
            </div>
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

  {bugModal}
    </div>
  );
}

export default function Practice() {
  const t = useT();
  return <Suspense fallback={<p className="mt-16 text-center text-slate-400">{t("加载中…")}</p>}><PracticeInner /></Suspense>;
}
