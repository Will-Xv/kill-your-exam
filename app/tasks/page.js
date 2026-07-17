"use client";
import { useT } from "@/components/I18n";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAiFetch } from "@/components/AiErrorDialog";
import MD from "@/components/MD";
import CodeEditor from "@/components/CodeEditor";
import { filesToAttachments } from "@/lib/attach";

export default function TasksPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [list, setList] = useState(null);
  const [judge0, setJudge0] = useState(false);
  const [pmode, setPmode] = useState(false);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [task, setTask] = useState(null);

  const load = () => fetch("/api/tasks").then((r) => r.json()).then((d) => { setList(d.tasks || []); setJudge0(!!d.judge0); setPmode(!!d.practicalMode); }).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const openTask = (id) => { setOpenId(id); setTask(null); fetch("/api/tasks/detail?id=" + id).then((r) => r.json()).then((d) => { setTask(d.task); setJudge0(!!d.judge0); }).catch(() => {}); };
  const sp = useSearchParams();
  useEffect(() => { const tid = sp.get("task"); if (tid) openTask(Number(tid)); }, []); // 首页“子考试样式”的实践作业条目点进来,直接打开这条任务

  async function del(id, e) {
    e.stopPropagation();
    if (!confirm(t("删除这个实践作业?"))) return;
    try { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delete: id }) }); load(); } catch {}
  }
  async function togglePmode() {
    const nv = !pmode; setPmode(nv);
    try { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setMode: nv }) }); } catch {}
  }
  async function assign() {
    setBusy(true);
    try { const r = await aiFetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) }); setTopic(""); await load(); if (r.taskId) openTask(r.taskId); } catch {}
    setBusy(false);
  }

  if (openId && task) return <TaskDetail task={task} judge0={judge0} onBack={() => { setOpenId(null); setTask(null); load(); }} onGraded={() => openTask(openId)} />;
  if (openId && !task) return <div className="p-4 text-sm text-stone-400">{t("加载中…")}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">🛠️ {t("实践作业")}</h1>
        <p className="text-sm text-stone-500">{t("真去动手做——写代码、做实验。AI 拆成里程碑,能跑的代码自动判,重型的交成果+AI审阅。")}</p>
      </div>
      {!judge0 && <div className="card border-amber-300 bg-amber-50/60 text-xs text-amber-800">{t("提示:代码运行判分需要管理员在「设置」里配置 Judge0 密钥;未配置时代码里程碑无法自动运行,但证据类里程碑仍可提交、AI 审阅。")}</div>}
      <label className="card flex items-center justify-between cursor-pointer">
        <span className="text-sm"><span className="font-medium">{t("复习时自动布置实践作业")}</span><span className="block text-xs text-stone-500">{t("开启后,首页今日任务会带出下一个未完成里程碑;没有进行中任务时自动给你出一个。")}</span></span>
        <input type="checkbox" checked={pmode} onChange={togglePmode} className="h-5 w-5 accent-teal-600" />
      </label>
      <div className="card">
        <label className="text-sm font-medium">{t("布置一个实践作业")}</label>
        <div className="mt-1 flex gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && assign()} placeholder={t("主题,如 用 Python 实现快排 / 训练一个小语言模型观察过拟合")} className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
          <button onClick={assign} disabled={busy} className="btn px-4">{busy ? t("生成中…") : t("布置")}</button>
        </div>
      </div>
      {list && list.length === 0 && <div className="card text-sm text-stone-500">{t("还没有实践作业。上面填个主题让 AI 给你布置一个。")}</div>}
      <div className="space-y-2">
        {(list || []).map((tk) => (
          <div key={tk.id} className="card hover:ring-2 hover:ring-indigo-300">
            <div className="flex items-start justify-between gap-2">
              <button onClick={() => openTask(tk.id)} className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{tk.title}</span>
                  <span className="text-xs text-stone-400">{tk.done}/{tk.milestoneCount} {t("里程碑")}</span>
                </div>
                <div className="mt-0.5 text-xs text-stone-500 line-clamp-2"><MD inline>{tk.brief}</MD></div>
                {tk.dueDate && <p className="mt-0.5 text-xs font-medium text-amber-700">⏳ {t("截止")}: {tk.dueDate}</p>}
                {tk.language && <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{tk.language}</span>}
              </button>
              <button onClick={(e) => del(tk.id, e)} title={t("删除")} className="shrink-0 text-xs text-stone-400 hover:text-rose-500">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskDetail({ task, judge0, onBack, onGraded }) {
  const t = useT();
  const aiFetch = useAiFetch();
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-stone-500">← {t("返回任务列表")}</button>
      <div className="card">
        <h1 className="text-xl font-black">{task.title}</h1>
        <MD className="mt-1 text-sm text-stone-600 prose-zh">{task.brief}</MD>
      </div>
      {task.milestones.map((ms, i) => (
        <Milestone key={i} task={task} idx={i} ms={ms} judge0={judge0} prog={task.progress[i]} onGraded={onGraded} aiFetch={aiFetch} t={t} />
      ))}
      <TaskChat task={task} />
    </div>
  );
}

function TaskChat({ task }) {
  const t = useT();
  const aiFetch = useAiFetch();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => { fetch(`/api/tasks/chat?taskId=${task.id}`).then((r) => r.json()).then((d) => setMsgs(d.messages || [])).catch(() => {}); }, [task.id]);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs, busy]);
  async function send() {
    const m = text.trim(); if (!m || busy) return;
    setMsgs((x) => [...x, { role: "user", content: m }]); setText(""); setBusy(true);
    // 把【当前正在做的代码 + 最新运行结果】(各里程碑草稿,未提交也算)一并发给助教,让它看得到我的运行/测试结果。
    const live = (task.milestones || []).map((_, i) => { try { const d = JSON.parse(localStorage.getItem(`kye_task:${task.id}:${i}`) || "null"); return d ? { idx: i, code: d.code, evi: d.evi, runOut: d.runOut, runInput: d.runInput } : null; } catch { return null; } }).filter(Boolean);
    try { const r = await aiFetch("/api/tasks/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, message: m, live }) }); setMsgs((x) => [...x, { role: "assistant", content: r.reply || "…" }]); } catch {}
    setBusy(false);
  }
  return (
    <div className="card">
      <p className="text-sm font-medium">💬 {t("做题问答(卡住就问,帮你把作业做出来)")}</p>
      <p className="mt-0.5 text-xs text-stone-400">{t("这段问答会在你完成整个作业后自动清空;你在这儿体现的理解/误区会记进掌握度。")}</p>
      <div ref={boxRef} className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={"inline-block max-w-[85%] rounded-2xl px-3 py-1.5 text-left text-sm " + (m.role === "user" ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-700")}>
              {m.role === "user" ? m.content : <MD>{m.content}</MD>}
            </div>
          </div>
        ))}
        {busy && <div className="animate-pulse text-xs text-stone-400">{t("思考中…")}</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={t("问点什么…(Enter 发送)")} className="flex-1 resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
        <button className="btn px-4" disabled={busy} onClick={send}>{t("发送")}</button>
      </div>
    </div>
  );
}

function Milestone({ task, idx, ms, judge0, prog, onGraded, aiFetch, t }) {
  const isRun = ms.check === "run";
  const [code, setCode] = useState((prog && prog.submission) || ms.starter || "");
  const [evi, setEvi] = useState((prog && prog.submission) || "");
  const [eviAtts, setEviAtts] = useState([]);
  const [runInput, setRunInput] = useState("");
  const [runOut, setRunOut] = useState(null);
  const [busy, setBusy] = useState("");
  const lang = ms.language || task.language || "python";
  const invalid = (task.appeals && task.appeals[idx]) || {};
  const [appealing, setAppealing] = useState(-1);
  // 刷新保留:把【还没提交】的代码/证据作答存进 localStorage,重进/刷新时恢复(已提交的另由服务端 prog.submission 兜底)。
  const draftKey = `kye_task:${task.id}:${idx}`;
  const hydrated = useRef(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(draftKey); if (raw) { const d = JSON.parse(raw); if (typeof d.code === "string" && d.code) setCode(d.code); if (typeof d.evi === "string" && d.evi) setEvi(d.evi); if (Array.isArray(d.eviAtts)) setEviAtts(d.eviAtts); if (d.runOut) setRunOut(d.runOut); if (typeof d.runInput === "string") setRunInput(d.runInput); } } catch {}
    hydrated.current = true;
  }, []); // eslint-disable-line
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const attsSize = eviAtts.reduce((a, x) => a + (x.data ? x.data.length : 0), 0);
      localStorage.setItem(draftKey, JSON.stringify({ code, evi, eviAtts: attsSize < 2500000 ? eviAtts : [], runOut, runInput, ts: Date.now() }));
    } catch {}
  }, [code, evi, eviAtts, runOut, runInput]); // eslint-disable-line
  async function appeal(ti) {
    setAppealing(ti);
    try {
      const note = prompt(t("(可选)说说你觉得这个用例哪里不对:")) || "";
      const r = await aiFetch("/api/tasks/appeal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, idx, testIndex: ti, note }) });
      if (r.verdict === "invalid") alert(t("申诉成立:该用例已判无效,不再计入判分。") + (r.note ? "\n" + r.note : ""));
      else alert(t("复核后认为该用例是对的。") + (r.note ? "\n" + r.note : ""));
      onGraded();
    } catch {}
    setAppealing(-1);
  }

  async function runProgram() {
    setBusy("prog"); setRunOut(null);
    try { const r = await aiFetch("/api/tasks/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: code, language: lang, stdin: runInput }) }); setRunOut(r); } catch {}
    setBusy("");
  }
  async function run() {
    setBusy("run"); setRunOut(null);
    try { const r = await aiFetch("/api/tasks/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: code, language: lang, tests: ms.tests || [] }) }); setRunOut(r); } catch {}
    setBusy("");
  }
  async function submit() {
    setBusy("submit");
    try { const r = await aiFetch("/api/tasks/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, idx, submission: isRun ? code : evi, language: lang, attachments: isRun ? undefined : eviAtts }) }); if (r.needKey) alert(t("需要管理员在设置里配置 Judge0 密钥才能运行判分。")); else onGraded(); } catch {}
    setBusy("");
  }

  const statusBadge = prog ? (prog.status === "passed" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">✓ {t("通过")} {prog.score}</span> : prog.status === "reviewed" ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">{t("已评")} {prog.score}</span> : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{t("未过")} {prog.score}</span>) : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{idx + 1}. <MD inline>{ms.title}</MD> <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{isRun ? t("代码·自动判") : t("证据·AI审阅")}</span></h2>
        {statusBadge}
      </div>
      <MD className="mt-1 text-sm text-stone-600 prose-zh">{ms.desc}</MD>
      {isRun ? (
        <>
          <div className="mt-2 text-xs text-stone-400">{t("语言")}: {lang}{ms.tests?.length ? ` · ${ms.tests.length} ${t("个测试用例")}` : ""}</div>
          <div className="mt-1"><CodeEditor value={code} onChange={setCode} language={lang} rows={12} placeholder={t("在这里写代码…")} /></div>
          {runOut && (runOut.notConfigured ? <p className="mt-1 text-xs text-amber-700">{t("未配置 Judge0,无法运行。")}</p> : runOut.error ? <p className="mt-1 text-xs text-rose-700">{t("运行出错")}: {runOut.error}{runOut.detail ? " · " + String(runOut.detail).slice(0, 120) : ""}</p> : runOut.results ? (
            <div className="mt-2 space-y-1">
              {runOut.results.map((r, ri) => (
                <div key={ri} className={`rounded-lg px-2 py-1 text-xs ${invalid[ri] && invalid[ri].verdict === "invalid" ? "bg-stone-100 text-stone-400 line-through" : r.passed ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                  <span>{invalid[ri] && invalid[ri].verdict === "invalid" ? "⊘" : r.passed ? "✓" : "✗"} {t("用例")} {ri + 1}{r.stdin ? ` · in: ${r.stdin.slice(0, 30)}` : ""} {!r.passed && r.expected != null ? `· ${t("期望")} ${String(r.expected).slice(0, 40)} / ${t("实际")} ${String(r.stdout).slice(0, 40)}` : ""}{r.stderr ? ` · ${r.stderr.slice(0, 60)}` : ""}</span>
                  {!r.passed && !invalid[ri] && <button onClick={() => appeal(ri)} disabled={appealing === ri} className="ml-2 rounded bg-white px-1.5 py-0.5 text-[10px] text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">{appealing === ri ? t("复核中…") : t("申诉此用例")}</button>}
                </div>
              ))}
              <div className="text-xs font-semibold">{t("通过")} {runOut.passedCount}/{runOut.total}</div>
            </div>
          ) : <p className="mt-1 text-xs text-stone-500">{runOut.stdout || runOut.stderr || runOut.compile_output || t("(无输出)")}</p>)}
          <textarea value={runInput} onChange={(e) => setRunInput(e.target.value)} rows={1} placeholder={t("(可选)运行程序时喂给它的输入(stdin)…")} className="mt-2 w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-mono text-xs" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={runProgram} disabled={busy === "prog" || !judge0} className="btn-ghost px-3 py-1.5 text-sm">{busy === "prog" ? t("运行中…") : "▶ " + t("运行程序")}</button>
            <button onClick={run} disabled={busy === "run" || !judge0} className="btn-ghost px-3 py-1.5 text-sm">{busy === "run" ? t("测试中…") : "🧪 " + t("测试")}</button>
            <button onClick={submit} disabled={busy === "submit"} className="btn px-3 py-1.5 text-sm">{busy === "submit" ? t("判分中…") : t("提交判分")}</button>
          </div>
          {!judge0 && <p className="mt-1 text-[11px] text-amber-700">{t("未配置 Judge0,运行/判分不可用(可先在设置里配置)。")}</p>}
        </>
      ) : (
        <>
          {ms.evidenceHint && <p className="mt-1 text-xs text-stone-500">📎 {t("要交的证据")}: {ms.evidenceHint}</p>}
          <textarea value={evi} onChange={(e) => setEvi(e.target.value)} rows={6} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder={t("贴上你的成果/发现/输出/截图说明…")} />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label className="btn-ghost cursor-pointer px-3 py-1.5 text-sm" title={t("上传图片/文件/拍照作答")}>📎 {t("拍照/上传文件")}
              <input type="file" multiple hidden accept="image/*,.pdf,.txt,.md,.docx" onChange={async (e) => { try { const a = await filesToAttachments(Array.from(e.target.files || [])); setEviAtts((x) => [...x, ...a].slice(0, 4)); } catch {} e.target.value = ""; }} />
            </label>
            {eviAtts.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">📄 {a.name || "file"}<button onClick={() => setEviAtts((x) => x.filter((_, j) => j !== i))} className="text-rose-500">✕</button></span>
            ))}
          </div>
          <button onClick={submit} disabled={busy === "submit"} className="btn mt-2 px-3 py-1.5 text-sm">{busy === "submit" ? t("审阅中…") : t("提交成果")}</button>
        </>
      )}
      {prog && prog.feedback && <div className="mt-2 rounded-lg bg-stone-50 px-3 py-1.5 text-xs text-stone-600">{prog.feedback}</div>}
    </div>
  );
}
