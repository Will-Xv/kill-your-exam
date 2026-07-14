"use client";
import { useT } from "@/components/I18n";
import { useState, useEffect } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";

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

  async function del(id, e) {
    e.stopPropagation();
    if (!confirm(t("删除这个实践任务?"))) return;
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
        <h1 className="text-2xl font-black">🛠️ {t("实践任务")}</h1>
        <p className="text-sm text-stone-500">{t("真去动手做——写代码、做实验。AI 拆成里程碑,能跑的代码自动判,重型的交成果+AI审阅。")}</p>
      </div>
      {!judge0 && <div className="card border-amber-300 bg-amber-50/60 text-xs text-amber-800">{t("提示:代码运行判分需要管理员在「设置」里配置 Judge0 密钥;未配置时代码里程碑无法自动运行,但证据类里程碑仍可提交、AI 审阅。")}</div>}
      <label className="card flex items-center justify-between cursor-pointer">
        <span className="text-sm"><span className="font-medium">{t("复习时自动布置实践任务")}</span><span className="block text-xs text-stone-500">{t("开启后,首页今日任务会带出下一个未完成里程碑;没有进行中任务时自动给你出一个。")}</span></span>
        <input type="checkbox" checked={pmode} onChange={togglePmode} className="h-5 w-5 accent-teal-600" />
      </label>
      <div className="card">
        <label className="text-sm font-medium">{t("布置一个实践任务")}</label>
        <div className="mt-1 flex gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && assign()} placeholder={t("主题,如 用 Python 实现快排 / 训练一个小语言模型观察过拟合")} className="flex-1 rounded-lg border border-stone-300 px-2 py-1.5 text-sm" />
          <button onClick={assign} disabled={busy} className="btn px-4">{busy ? t("生成中…") : t("布置")}</button>
        </div>
      </div>
      {list && list.length === 0 && <div className="card text-sm text-stone-500">{t("还没有实践任务。上面填个主题让 AI 给你布置一个。")}</div>}
      <div className="space-y-2">
        {(list || []).map((tk) => (
          <div key={tk.id} className="card hover:ring-2 hover:ring-indigo-300">
            <div className="flex items-start justify-between gap-2">
              <button onClick={() => openTask(tk.id)} className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{tk.title}</span>
                  <span className="text-xs text-stone-400">{tk.done}/{tk.milestoneCount} {t("里程碑")}</span>
                </div>
                <p className="mt-0.5 text-xs text-stone-500 line-clamp-2">{tk.brief}</p>
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
        <p className="mt-1 text-sm text-stone-600">{task.brief}</p>
      </div>
      {task.milestones.map((ms, i) => (
        <Milestone key={i} task={task} idx={i} ms={ms} judge0={judge0} prog={task.progress[i]} onGraded={onGraded} aiFetch={aiFetch} t={t} />
      ))}
    </div>
  );
}

function Milestone({ task, idx, ms, judge0, prog, onGraded, aiFetch, t }) {
  const isRun = ms.check === "run";
  const [code, setCode] = useState((prog && prog.submission) || ms.starter || "");
  const [evi, setEvi] = useState((prog && prog.submission) || "");
  const [runOut, setRunOut] = useState(null);
  const [busy, setBusy] = useState("");
  const lang = ms.language || task.language || "python";

  async function run() {
    setBusy("run"); setRunOut(null);
    try { const r = await aiFetch("/api/tasks/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: code, language: lang, tests: ms.tests || [] }) }); setRunOut(r); } catch {}
    setBusy("");
  }
  async function submit() {
    setBusy("submit");
    try { const r = await aiFetch("/api/tasks/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, idx, submission: isRun ? code : evi, language: lang }) }); if (r.needKey) alert(t("需要管理员在设置里配置 Judge0 密钥才能运行判分。")); else onGraded(); } catch {}
    setBusy("");
  }

  const statusBadge = prog ? (prog.status === "passed" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">✓ {t("通过")} {prog.score}</span> : prog.status === "reviewed" ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">{t("已评")} {prog.score}</span> : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{t("未过")} {prog.score}</span>) : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{idx + 1}. {ms.title} <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{isRun ? t("代码·自动判") : t("证据·AI审阅")}</span></h2>
        {statusBadge}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{ms.desc}</p>
      {isRun ? (
        <>
          <div className="mt-2 text-xs text-stone-400">{t("语言")}: {lang}{ms.tests?.length ? ` · ${ms.tests.length} ${t("个测试用例")}` : ""}</div>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} rows={10} className="mt-1 w-full rounded-lg border border-stone-300 bg-stone-900 px-3 py-2 font-mono text-xs text-stone-100" placeholder={t("在这里写代码…")} />
          {runOut && (runOut.notConfigured ? <p className="mt-1 text-xs text-amber-700">{t("未配置 Judge0,无法运行。")}</p> : runOut.error ? <p className="mt-1 text-xs text-rose-700">{t("运行出错")}: {runOut.error}{runOut.detail ? " · " + String(runOut.detail).slice(0, 120) : ""}</p> : runOut.results ? (
            <div className="mt-2 space-y-1">
              {runOut.results.map((r, ri) => (
                <div key={ri} className={`rounded-lg px-2 py-1 text-xs ${r.passed ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                  {r.passed ? "✓" : "✗"} {t("用例")} {ri + 1}{r.stdin ? ` · in: ${r.stdin.slice(0, 30)}` : ""} {!r.passed && r.expected != null ? `· ${t("期望")} ${String(r.expected).slice(0, 40)} / ${t("实际")} ${String(r.stdout).slice(0, 40)}` : ""}{r.stderr ? ` · ${r.stderr.slice(0, 60)}` : ""}
                </div>
              ))}
              <div className="text-xs font-semibold">{t("通过")} {runOut.passedCount}/{runOut.total}</div>
            </div>
          ) : <p className="mt-1 text-xs text-stone-500">{runOut.stdout || runOut.stderr || runOut.compile_output || t("(无输出)")}</p>)}
          <div className="mt-2 flex gap-2">
            <button onClick={run} disabled={busy === "run" || !judge0} className="btn-ghost px-3 py-1.5 text-sm">{busy === "run" ? t("运行中…") : "▶ " + t("运行")}</button>
            <button onClick={submit} disabled={busy === "submit"} className="btn px-3 py-1.5 text-sm">{busy === "submit" ? t("判分中…") : t("提交判分")}</button>
          </div>
          {!judge0 && <p className="mt-1 text-[11px] text-amber-700">{t("未配置 Judge0,运行/判分不可用(可先在设置里配置)。")}</p>}
        </>
      ) : (
        <>
          {ms.evidenceHint && <p className="mt-1 text-xs text-stone-500">📎 {t("要交的证据")}: {ms.evidenceHint}</p>}
          <textarea value={evi} onChange={(e) => setEvi(e.target.value)} rows={6} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder={t("贴上你的成果/发现/输出/截图说明…")} />
          <button onClick={submit} disabled={busy === "submit"} className="btn mt-2 px-3 py-1.5 text-sm">{busy === "submit" ? t("审阅中…") : t("提交成果")}</button>
        </>
      )}
      {prog && prog.feedback && <div className="mt-2 rounded-lg bg-stone-50 px-3 py-1.5 text-xs text-stone-600">{prog.feedback}</div>}
    </div>
  );
}
