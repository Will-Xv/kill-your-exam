"use client";
import { useState, useEffect, useRef } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";
import HandwritePad from "@/components/HandwritePad";
import DropZone from "@/components/DropZone";
import { filesToAttachments } from "@/lib/attach";
import { idbGet, idbSet, idbDel } from "@/lib/idb";

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };
const KEY = "mock";

// 与练习一致的作答区:草稿纸(不计入作答) → 手写 → 打字 → 传文件。附件(手写/上传)可跨刷新恢复。
function WrittenBlock({ q, t, value, onText, onAttach, initialAtts }) {
  const initList = initialAtts || [];
  const initHand = initList.find((a) => a.name === "handwriting.png");
  const initHandURL = initHand ? `data:${initHand.mime || "image/png"};base64,${initHand.data}` : null;
  const initFiles = initList.filter((a) => a.name !== "handwriting.png");

  const [draftOpen, setDraftOpen] = useState(false);
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

  const isShort = q.qtype === "short";
  const attCount = restoredFileAtts.length + files.length;
  return (
    <div>
      {q.qtype === "fill" && <textarea className="input mt-2" rows={2} placeholder={t("填写答案")} value={value || ""} onChange={(e) => onText(e.target.value)} />}

      <div className="mt-2 border-t border-slate-100 pt-2">
        <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={() => setDraftOpen((v) => !v)}>✏️ {draftOpen ? t("收起草稿纸") : t("草稿纸(手写演算,不计入作答)")}</button>
        {draftOpen && <HandwritePad key={"draft-" + q.id} />}
      </div>

      {isShort && (
        <>
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
        </>
      )}
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
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(null);
  const [started, setStarted] = useState(0);
  const hydrated = useRef(false);
  const saveTimer = useRef(null);

  // 刷新后恢复:题目 + 打字作答 + 手写/上传附件(未压缩,存 IndexedDB)
  useEffect(() => {
    (async () => {
      const s = await idbGet(KEY);
      if (s && s.stage === "running" && Array.isArray(s.qs) && s.qs.length && Date.now() - (s.ts || 0) < 3 * 24 * 3600 * 1000) {
        restoredAtts.current = s.atts || {};
        attachRef.current = { ...(s.atts || {}) };
        setMockId(s.mockId); setQs(s.qs); setAnswers(s.answers || {}); setStarted(s.started || 0); setStage("running");
      }
      hydrated.current = true;
    })();
  }, []);

  function persist() {
    if (!hydrated.current) return;
    if (stage === "running" && qs.length) idbSet(KEY, { stage, mockId, qs, answers, started, atts: attachRef.current, ts: Date.now() });
    else idbDel(KEY);
  }
  // 题目/打字作答变化即存
  useEffect(() => { persist(); }, [stage, mockId, qs, answers, started]); // eslint-disable-line
  // 附件变化时防抖存(附件较大)
  function scheduleAttSave() {
    if (!hydrated.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 600);
  }

  async function start(realOnly = false) {
    setBusy(true);
    try {
      const d = await aiFetch("/api/mock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 20, realOnly }) });
      attachRef.current = {}; restoredAtts.current = {}; setAnswers({}); setMockId(d.mockId); setQs(d.questions); setStage("running"); setStarted(Date.now());
    } catch {}
    setBusy(false);
  }
  async function submit() {
    if (!confirm(t("确定交卷?"))) return;
    setBusy(true);
    try {
      const d = await aiFetch("/api/mock/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mockId, answers, attachments: attachRef.current }) });
      setScore(d.score); setStage("done"); idbDel(KEY);
    } catch {}
    setBusy(false);
  }
  const letters = ["A", "B", "C", "D", "E", "F"];
  const setA = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const setAttach = (id, atts) => { attachRef.current = { ...attachRef.current, [id]: atts }; scheduleAttSave(); };

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
          <button className="btn flex-1" onClick={() => { setStage("intro"); setScore(null); setAnswers({}); attachRef.current = {}; restoredAtts.current = {}; }}>{t("再考一次")}</button>
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
              <WrittenBlock q={q} t={t} value={cur} onText={(v) => setA(q.id, v)} onAttach={setAttach} initialAtts={restoredAtts.current[q.id]} />
            )}
          </div>
        );
      })}
      <button className="btn w-full" onClick={submit} disabled={busy}>{busy ? t("批改中…") : t("交卷")}</button>
    </div>
  );
}
