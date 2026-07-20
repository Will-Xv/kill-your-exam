"use client";
import { confirmDialog } from "@/components/ui/dialog";
import { useState, useEffect, useRef } from "react";
import { useT } from "@/components/I18n";
import SourceConfidence from "@/components/SourceConfidence";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";
import HandwritePad from "@/components/HandwritePad";
import DropZone from "@/components/DropZone";
import { filesToAttachments } from "@/lib/attach";
import Discuss from "@/components/Discuss";
import { idbGet, idbSet, idbDel } from "@/lib/idb";

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答", perform: "表演" };
const KEY = "mock";

// 草稿纸(所有题都有,含选择题):手写演算,不计入作答、AI 看不到。
function DraftPad({ q, t, initial, onDraft }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setOpen((v) => !v)}>✏️ {open ? t("收起草稿纸") : t("草稿纸(手写演算,不计入作答)")}</button>
      {open && <HandwritePad key={"draft-" + q.id} initial={initial} onChange={(url) => onDraft(q.id, url)} />}
    </div>
  );
}

function WrittenBlock({ q, t, value, onText, onAttach, initialAtts }) {
  const initList = initialAtts || [];
  const initHand = initList.find((a) => a.name === "handwriting.png");
  const initHandURL = initHand ? `data:${initHand.mime || "image/png"};base64,${initHand.data}` : null;
  const initFiles = initList.filter((a) => a.name !== "handwriting.png");

  const [handOpen, setHandOpen] = useState(!!initHand);
  const [typeOpen, setTypeOpen] = useState(true);
  const [handURL, setHandURL] = useState(initHandURL);
  const [files, setFiles] = useState([]);
  const [restoredFileAtts, setRestoredFileAtts] = useState(initFiles);

  useEffect(() => {
    let live = true;
    (async () => {
      const fresh = await filesToAttachments(files);
      let atts = [...restoredFileAtts, ...fresh];
      if (handURL) { const b64 = handURL.split(",")[1]; if (b64) atts = [...atts, { name: "handwriting.png", mime: "image/png", data: b64 }]; }
      if (live) onAttach(q.id, atts.slice(0, 4));
    })();
    return () => { live = false; };
  }, [handURL, files, restoredFileAtts]); // eslint-disable-line

  const attCount = restoredFileAtts.length + files.length;
  return (
    <div>
      <div className="mt-2">
            <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setHandOpen((v) => !v)}>✍️ {handOpen ? t("收起手写") : t("手写作答(触控笔/手写板)")}</button>
            {handOpen && <HandwritePad key={"hand-" + q.id} initial={initHandURL} onChange={(url) => setHandURL(url || null)} />}
          </div>
          <div className="mt-2">
            <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setTypeOpen((v) => !v)}>⌨️ {typeOpen ? t("收起打字框") : t("打字作答")}</button>
            {typeOpen && <textarea className="input mt-2" rows={4} placeholder={t("写下你的回答(口语化也行)")} value={value || ""} onChange={(e) => onText(e.target.value)} />}
          </div>
          <DropZone onFiles={(fs) => setFiles((p) => [...p, ...fs])} className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <label className="btn-ghost cursor-pointer px-3 py-1" title={t("上传图片/文件作答(可拖拽或粘贴)")}>📎 {t("拍照/上传作答")}<input type="file" multiple hidden accept="image/*,.pdf" onChange={(e) => setFiles([...e.target.files])} /></label>
            {attCount > 0 && <span>{attCount} {t("个文件")} <button className="underline" onClick={() => { setFiles([]); setRestoredFileAtts([]); }}>{t("清除")}</button></span>}
          </DropZone>
    </div>
  );
}

// 交卷后:每道题的作答回顾(只读)
function ReviewBlock({ q, t, idx, ua, atts, res, letters, onRevised }) {
  const isChoice = ["single", "multi", "judge"].includes(q.qtype);
  const options = q.qtype === "judge" ? ["对", "错"] : q.body.options || [];
  const hand = (atts || []).find((a) => a.name === "handwriting.png");
  const handURL = hand ? `data:${hand.mime || "image/png"};base64,${hand.data}` : null;
  const files = (atts || []).filter((a) => a.name !== "handwriting.png");
  return (
    <div className={`card ${res ? (res.correct ? "border-amber-400 bg-amber-50" : "border-red-300 bg-red-50") : ""}`}>
      <p className="text-xs text-stone-400 mb-1">{idx + 1} · {t(QTYPE[q.qtype])}{res?.marks != null && <span> · {res.earned != null ? res.earned : (res.correct ? res.marks : 0)}/{res.marks} {t("分")}</span>} {res && <span className={res.correct ? "text-amber-700" : "text-red-600"}>· {res.correct ? t("✓ 答对了") : t("✗ 不对")}</span>}</p>
      <MD className="font-medium prose-zh">{q.body.stem}</MD>
      {isChoice ? (
        <div className="mt-2 space-y-1.5">
          {options.map((op, i) => {
            const v = q.qtype === "judge" ? op : letters[i];
            const chosen = q.qtype === "multi" ? (ua || "").includes(v) : ua === v;
            return <div key={i} className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${chosen ? "border-amber-500 bg-amber-100" : "border-stone-200"}`}>
              {q.qtype !== "judge" && <b className="mr-1">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : <MD inline>{stripLabel(op, i)}</MD>}{chosen ? " ←" : ""}</div>;
          })}
        </div>
      ) : (
        <div className="mt-2 text-sm">
          <p className="text-slate-500">{t("你的作答:")}</p>
          {ua ? <div className="mt-1"><MD className="prose-zh">{ua}</MD></div> : (!handURL && !files.length && <p className="mt-1 text-slate-400">{t("(未答)")}</p>)}
          {handURL && <div className="mt-1"><p className="text-xs text-slate-500">✍️ {t("手写作答")}</p><img src={handURL} alt="handwriting" className="w-full rounded-xl border border-slate-200 bg-white" /></div>}
          {files.length > 0 && <p className="mt-1 text-xs text-slate-500">📎 {files.length} {t("个文件")}</p>}
        </div>
      )}
      {res && (
        <div className="mt-2 border-t border-stone-100 pt-2 text-sm">
          <p><b>{t("参考答案:")}</b>{q.qtype === "judge" ? t(res.answer) : <MD inline>{res.answer}</MD>}</p>
          {res.explanation && <div className="mt-1 text-slate-600"><b>{t("解析:")}</b><MD inline>{res.explanation}</MD></div>}
        </div>
      )}
      {res?.attemptId && <Discuss questionId={q.id} attemptId={res.attemptId} userAnswer={ua} onApplied={onRevised} />}
    </div>
  );
}

export default function Mock() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [stage, setStage] = useState("intro");
  const [mockId, setMockId] = useState(null);
  const [qs, setQs] = useState([]);
  const [answers, setAnswers] = useState({});
  const attachRef = useRef({});
  const restoredAtts = useRef({});
  const draftsRef = useRef({});
  const restoredDrafts = useRef({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [score, setScore] = useState(null);
  const [results, setResults] = useState(null);
  const [mockDiag, setMockDiag] = useState(null);
  const [mockRoot, setMockRoot] = useState(null);
  const [gradeErr, setGradeErr] = useState(false);
  const [started, setStarted] = useState(0);
  const hydrated = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await idbGet(KEY);
      if (s && (s.stage === "running" || s.stage === "done" || s.stage === "grading") && Array.isArray(s.qs) && s.qs.length && Date.now() - (s.ts || 0) < 7 * 24 * 3600 * 1000) {
        restoredAtts.current = s.atts || {};
        attachRef.current = { ...(s.atts || {}) };
        restoredDrafts.current = s.drafts || {};
        draftsRef.current = { ...(s.drafts || {}) };
        setMockId(s.mockId); setQs(s.qs); setAnswers(s.answers || {}); setStarted(s.started || 0);
        if (s.stage === "done") { setScore(s.score || null); setResults(s.results || null); }
        setStage(s.stage);
        if (s.stage === "grading") pollGrading(s.mockId);   // 关掉页面又回来:继续轮询判题结果
      }
      hydrated.current = true;
    })();
  }, []);

  function persist() {
    if (!hydrated.current) return;
    if ((stage === "running" || stage === "done" || stage === "grading") && qs.length) idbSet(KEY, { stage, mockId, qs, answers, started, atts: attachRef.current, drafts: draftsRef.current, score, results, ts: Date.now() });
    else idbDel(KEY);
  }
  useEffect(() => { persist(); }, [stage, mockId, qs, answers, started, score, results]); // eslint-disable-line
  useEffect(() => {
    if (stage !== "done") return;
    fetch("/api/diagnostic").then((r) => (r.ok ? r.json() : null)).then(setMockDiag).catch(() => {});
    let tries = 0;
    const poll = () => fetch("/api/diagnose").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && d.diagnosis) setMockRoot(d.diagnosis);
      else if (tries++ < 6) setTimeout(poll, 2500);
    }).catch(() => {});
    const tm = setTimeout(poll, 2500);
    return () => clearTimeout(tm);
  }, [stage]); // eslint-disable-line
  const [bpPeek, setBpPeek] = useState(null);
  useEffect(() => { fetch("/api/mock/blueprint?peek=1").then((r) => r.json()).then((d) => setBpPeek(d.blueprint || null)).catch(() => {}); }, []);
  const [bank, setBank] = useState(null);
  useEffect(() => { fetch("/api/mock/bank").then((r) => r.json()).then((d) => setBank(d)).catch(() => {}); }, []);
  function scheduleAttSave() {
    if (!hydrated.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 600);
  }

  async function start(realOnly = false) {
    setBusy(true); setErr("");
    try {
      const d = await aiFetch("/api/mock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 20, realOnly }) });
      if (!d || !Array.isArray(d.questions) || !d.questions.length) throw new Error(d && d.error ? d.error : t("组卷失败:没有拿到题目"));
      attachRef.current = {}; restoredAtts.current = {}; draftsRef.current = {}; restoredDrafts.current = {}; setAnswers({}); setScore(null); setResults(null); setMockId(d.mockId); setQs(d.questions); setStage("running"); setStarted(Date.now());
    } catch (e) {
      let msg = String((e && e.message) || e || "");
      try { const j = JSON.parse(msg); if (j && j.error) msg = j.error; } catch {}
      if (msg === "ai-error" || msg === "network") msg = "";  // 这些已由全局弹窗提示
      setErr(msg || t("组卷失败,请稍后再试。"));
    }
    setBusy(false);
  }
  async function submit() {
    if (!await confirmDialog(t("确定交卷?"))) return;
    setBusy(true);
    try {
      const d = await aiFetch("/api/mock/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mockId, answers, attachments: attachRef.current }) });
      if (d.status === "done" && d.score) { setScore(d.score); setResults(d.results || null); setStage("done"); }
      else { setStage("grading"); pollGrading(); }   // 判题放后台,进入等待页(可离开)
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    } catch {}
    setBusy(false);
  }
  const pollRef = useRef(null);
  useEffect(() => () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []); // 卸载时清掉轮询,避免在已卸载组件上 setState
  function pollGrading(id) {
    const mid = id || mockId;
    if (pollRef.current) return;
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries++;
      try {
        const r = await fetch("/api/mock/status?mockId=" + mid, { cache: "no-store" });
        const d = await r.json();
        if (d.status === "done" && d.score) {
          clearInterval(pollRef.current); pollRef.current = null;
          setScore(d.score); setResults(d.results || null); setStage("done");
        } else if (d.status === "failed") {
          clearInterval(pollRef.current); pollRef.current = null; setGradeErr(true);
        }
      } catch {}
      if (tries > 150 && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 2000);
  }
  // 争论改判后:权威重算这场模拟考的成绩,刷新显示(并回写到历史记录)
  async function rescoreMock() {
    if (!mockId) return;
    try {
      const d = await aiFetch("/api/mock/rescore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mockId }) });
      if (d.score) setScore(d.score);
      if (d.results) setResults(d.results);
    } catch {}
  }
  function restart() { idbDel(KEY); attachRef.current = {}; restoredAtts.current = {}; draftsRef.current = {}; restoredDrafts.current = {}; setStage("intro"); setScore(null); setResults(null); setAnswers({}); setQs([]); }

  const letters = ["A", "B", "C", "D", "E", "F"];
function stripLabel(op, i) {
  const L = ["A", "B", "C", "D", "E", "F"][i] || "";
  return String(op == null ? "" : op).replace(new RegExp("^\\s*" + L + "[.．)、,]\\s*", "i"), "");
}
  const setA = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const setAttach = (id, atts) => { attachRef.current = { ...attachRef.current, [id]: atts }; scheduleAttSave(); };
  const setDraft = (id, url) => { draftsRef.current = { ...draftsRef.current, [id]: url }; scheduleAttSave(); };
  const resMap = {}; (results || []).forEach((r) => { resMap[r.id] = r; });

  if (stage === "intro") return (
    <div className="mt-16 text-center space-y-4 md:mt-24">
      <div className="text-5xl">📝</div>
      <h1 className="text-2xl font-bold">{t("模拟考")}</h1>
      {bpPeek && bpPeek.totalQuestions ? (
        <div className="text-stone-500 space-y-2">
          <p>{t("本次按「考试蓝图」组卷,共 {n} 道题,一次做完再看结果。").replace("{n}", bpPeek.totalQuestions)}</p>
          <div className="flex justify-center"><SourceConfidence level={bpPeek.sourceLevel} note={bpPeek.sourceNote} t={t} /></div>
        </div>
      ) : (
        <p className="text-stone-500">{t("按考试蓝图组卷,一次做完再看结果,更接近真实考试。")}</p>
      )}
      {bank && bank.closedBank ? (
        <p className="text-sm text-amber-700">🔒 {t("封闭题库:只从你提供的 {n} 道题里出题(练习也一样)。").replace("{n}", (bank.questions || []).length)}</p>
      ) : bank && (bank.questions || []).some((q) => q.must) ? (
        <p className="text-sm text-amber-700">📌 {t("有 {n} 道必考原题每次必出。").replace("{n}", (bank.questions || []).filter((q) => q.must).length)}</p>
      ) : null}
      <div className="flex flex-col gap-2 items-center">
        <button className="btn" onClick={() => start(false)} disabled={busy}>{busy ? t("组卷中…") : t("开始模拟考")}</button>
        <button className="btn-ghost text-sm" onClick={() => start(true)} disabled={busy}>📜 {t("做真题(只用你提供的资料组卷)")}</button>
        <a className="btn-ghost text-sm" href="/mock/blueprint">📋 {t("考试蓝图(结构/分值/时长)")}</a>
        <a className="btn-ghost text-sm" href="/mock/history">📚 {t("历史模拟考")}</a>
      </div>
      {busy && <p className="mx-auto max-w-md rounded-lg bg-amber-100/80 px-3 py-2 text-xs text-amber-800">⏳ {t("正在组卷…题库不够会即时生成,可能要等一会儿。退出之后后台会继续生成,可以过一会回来看看。")}</p>}
      {err && (
        <div className="mx-auto max-w-md rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">
          <p className="font-semibold">⚠️ {t("开始失败")}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs">{err}</p>
        </div>
      )}
      <p className="text-xs text-stone-400 max-w-md mx-auto">{t("现在按「考试蓝图」组卷:先规划这门正式考试该考什么、各知识点出几道、总分多少,再据此组卷(题库不够会即时生成,所以组卷可能稍慢)。")}</p>
    </div>
  );

  if (stage === "grading") {
    return (
      <div className="space-y-4 md:mt-14 pb-4">
        <div className="card text-center">
          {gradeErr ? (
            <>
              <p className="text-3xl mb-2">⚠️</p>
              <h2 className="font-bold text-lg">{t("判题出了点问题")}</h2>
              <p className="text-sm text-stone-500 mt-1">{t("成绩没能算出来,可以稍后重试。")}</p>
              <button className="btn mt-3" onClick={async () => { setGradeErr(false); setStage("grading"); try { const d = await aiFetch("/api/mock/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mockId, answers, attachments: attachRef.current }) }); if (d.status === "done" && d.score) { setScore(d.score); setResults(d.results || null); setStage("done"); return; } } catch {} pollGrading(); }}>{t("重试")}</button>
            </>
          ) : (
            <>
              <div className="mx-auto my-2 h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
              <h2 className="font-bold text-lg">{t("正在判题…")}</h2>
              <p className="text-sm text-stone-500 mt-1">{t("含主观题AI阅卷,可能要一会儿。你可以先去干别的,判完自动出成绩。")}</p>
            </>
          )}
        </div>
        <a href="/" className="btn-ghost block text-center">{t("先回首页")}</a>
      </div>
    );
  }
  if (stage === "done") {
    return (
      <div className="space-y-3 md:mt-14 pb-4">
        {score && (
          <div className="card text-center bg-gradient-to-br from-amber-600 to-amber-700 text-white border-0">
            <p className="text-sm text-amber-100">{t("模拟考成绩")}</p>
            <p className="text-5xl font-bold my-2">{score.pct}%</p>
            {score.totalMarks ? <p className="text-amber-100 text-lg font-semibold">{score.gotMarks} / {score.totalMarks} {t("分")}</p> : null}
            <p className="text-amber-100 text-sm">{score.got} / {score.total} {t("题")}</p>
          </div>
        )}
        {score && (
          <div className="card">
            <h2 className="font-bold mb-2">{t("各章得分")}</h2>
            {Object.entries(score.byChapter).map(([ch, s]) => (
              <div key={ch} className="mb-2">
                <div className="flex justify-between text-sm"><span>{ch}</span><span>{s.got}/{s.total}</span></div>
                <div className="h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${(s.got / s.total) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        {mockDiag && mockDiag.mode === "advise" && (mockDiag.start?.length > 0 || mockDiag.firstAction) && (
          <div className="card border-emerald-300 bg-emerald-50/50">
            <h2 className="font-bold text-[#14532d]">📊 {t("这次之后:该从哪补")}</h2>
            {mockDiag.solid?.length > 0 && <div className="mt-1 text-xs text-stone-600">✅ {t("已经比较稳(可略过/只巩固):")}<span className="font-medium">{mockDiag.solid.join("、")}</span></div>}
            {mockDiag.start?.length > 0 && <div className="mt-1 space-y-1">{mockDiag.start.map((c, i) => <div key={i} className="rounded-xl bg-white/70 px-3 py-1.5 text-xs"><span className="font-medium">{c.chapter}</span>{c.acc != null ? ` · ${t("正确率")}${c.acc}%` : ""} · {t("薄弱/未学")}{c.weak + c.unlearned}</div>)}</div>}
            {mockDiag.firstAction && <a href={`/practice?kp=${mockDiag.firstAction.kpId}`} className="mt-2 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">▶ {t("第一步:")}{mockDiag.firstAction.title.slice(0, 30)}</a>}
          </div>
        )}
        {mockRoot && (
          <div className="card border-rose-300 bg-rose-50">
            <h2 className="font-bold text-rose-800">🔍 {t("根因诊断")}</h2>
            {mockRoot.summary && <p className="mt-1 text-sm font-semibold text-[#5a2d0c]">{mockRoot.summary}</p>}
            {mockRoot.rootCauses?.length > 0 && <div className="mt-2 space-y-1">{mockRoot.rootCauses.map((r, i) => <div key={i} className="rounded-xl bg-white/70 px-3 py-1.5 text-xs"><span className="font-medium">{(r.title || "").slice(0, 40)}</span>{r.why ? <span className="text-stone-500"> — {r.why.slice(0, 80)}</span> : ""}</div>)}</div>}
            {mockRoot.avoidance?.avoiding && <div className="mt-2 rounded-xl bg-stone-100 px-3 py-1.5 text-xs text-stone-600">{mockRoot.avoidance.detail}</div>}
            <a href="/study" className="mt-2 inline-block text-xs font-semibold text-rose-700 underline">{t("去看根因知识点")} →</a>
          </div>
        )}
        <h2 className="font-bold px-1 pt-2">{t("作答回顾")}</h2>
        {qs.map((q, idx) => (
          <ReviewBlock key={q.id} q={q} t={t} idx={idx} ua={answers[q.id]} atts={attachRef.current[q.id]} res={resMap[q.id]} letters={letters} onRevised={rescoreMock} />
        ))}
        <div className="flex gap-2 pt-2">
          <button className="btn flex-1" onClick={restart}>{t("再考一次")}</button>
          <a className="btn-ghost" href="/">{t("回首页")}</a>
        </div>
      </div>
    );
  }

  const answered = new Set([...Object.keys(answers).filter((k) => answers[k]), ...Object.keys(attachRef.current).filter((k) => (attachRef.current[k] || []).length)]).size;
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
            {q.body.audioId && <div className="mt-3"><audio controls preload="metadata" className="w-full" src={`/api/materials/raw?id=${q.body.audioId}`} /></div>}
            {/* 草稿纸最上面(所有题,含选择题) */}
            <DraftPad q={q} t={t} initial={restoredDrafts.current[q.id]} onDraft={setDraft} />
            {isChoice && (
              <div className="mt-2 space-y-1.5">
                {q.qtype === "multi" && <p className="text-sm font-semibold text-amber-700">🔵 {t("多选题 · 可选多个正确答案")}</p>}
                {options.map((op, i) => {
                  const v = q.qtype === "judge" ? op : letters[i];
                  const active = q.qtype === "multi" ? (cur || "").includes(v) : cur === v;
                  return <button key={i} onClick={() => setA(q.id, q.qtype === "multi" ? (active ? (cur || "").replace(v, "") : (cur || "") + v) : v)}
                    className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${active ? "border-amber-500 bg-amber-50" : "border-stone-200"}`}>
                    {q.qtype !== "judge" && <b className="mr-1">{letters[i]}.</b>}{q.qtype === "judge" ? t(op) : <MD inline>{stripLabel(op, i)}</MD>}</button>;
                })}
              </div>
            )}
            {q.qtype === "fill" && <textarea className="input mt-2" rows={2} placeholder={t("填写答案")} value={cur || ""} onChange={(e) => setA(q.id, e.target.value)} />}
            {q.qtype === "short" && <WrittenBlock q={q} t={t} value={cur} onText={(v) => setA(q.id, v)} onAttach={setAttach} initialAtts={restoredAtts.current[q.id]} />}
          </div>
        );
      })}
      <button className="btn w-full" onClick={submit} disabled={busy}>{busy ? t("批改中…") : t("交卷")}</button>
    </div>
  );
}
