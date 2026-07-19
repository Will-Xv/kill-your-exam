"use client";
import { useT } from "@/components/I18n";
import { useEffect, useRef, useState, memo } from "react";
import MD from "@/components/MD";
import { filesToAttachments } from "@/lib/attach";
import DropZone from "@/components/DropZone";
import PlanSetup from "@/components/PlanSetup";
import DynamicForm from "@/components/DynamicForm";
import { useAiFetch } from "@/components/AiErrorDialog";
import * as placement from "@/lib/uilab/placement";
import * as lab from "@/lib/uilab/store";

// 记忆化消息气泡:内容没变就不重渲染——避免每次在输入框打字都重新解析所有 Markdown/KaTeX,导致输入卡顿。
const ChatMsg = memo(function ChatMsg({ role, content }) {
  if (role === "tool_note") return <p className="text-center text-xs text-amber-700">⚙️ {content}</p>;
  return (
    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${role === "user" ? "ml-auto bg-amber-600 text-white" : "bg-[#f5eed6] border border-[#e4d5af] text-[#2f2413]"}`}>
      {role === "user" ? <p className="whitespace-pre-wrap break-words">{content}</p> : <MD className="prose-zh break-words">{content}</MD>}
    </div>
  );
});

export default function KillerChat({ embedded = false }) {
  const t = useT();
  const descLabel = (d) => { if (d && typeof d === "object" && d.t) { let str = t(d.t); const p = d.p || {}; return str.replace(/\{(\w+)\}/g, (_, k) => (p[k] != null ? String(p[k]) : "")); } return t(d || ""); };
  const aiFetch = useAiFetch();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(null); // { token, kind, plan, actions, approve:{idx:bool} }
  const [planFeedback, setPlanFeedback] = useState("");
  const [bjobs, setBjobs] = useState([]);
  const [genExams, setGenExams] = useState([]);
  const [steps, setSteps] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [me, setMe] = useState(null);
  const pollRef = useRef(null);
  const elapsedBaseRef = useRef({ serverSec: 0, at: Date.now() }); // 计时基准来自服务端 run 实际开始时间,刷新页面也不清零
  const bottom = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { fetch("/api/chat").then((r) => r.json()).then((d) => setMessages(d.messages || [])); }, []);
  useEffect(() => { fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => setMe(d?.user)).catch(() => {}); }, []);
  useEffect(() => { if (!busy) { setElapsed(0); return; } const tick = () => { const b = elapsedBaseRef.current; setElapsed(Math.max(0, Math.round(b.serverSec + (Date.now() - b.at) / 1000))); }; tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv); }, [busy]);
  useEffect(() => {
    // 断线重连:若后台还有一次未完成的运行,继续跟它的进度(离线期间它照跑)
    fetch("/api/chat/run").then((r) => r.json()).then((d) => { if (d.run && (d.run.status === "running" || d.run.status === "pending")) startPolling(d.run.id); }).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line
  useEffect(() => {
    const load = () => fetch("/api/browser/status").then((r) => r.json()).then((d) => setBjobs(d.jobs || [])).catch(() => {});
    load(); const iv = setInterval(load, 4000); return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    const load = () => fetch("/api/exam/list").then((r) => r.ok ? r.json() : null).then((d) => setGenExams((d?.exams || []).filter((e) => e.setup_state === "generating"))).catch(() => {});
    load(); const iv = setInterval(load, 4000); return () => clearInterval(iv);
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, pending]);

  const planSeenRef = useRef(false);
  const [planSetup, setPlanSetup] = useState(null);
  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }
  async function pollOnce(runId) {
    try {
      const d = await fetch(`/api/chat/run?id=${runId}`).then((r) => r.json());
      const run = d.run; if (!run) return;
      setSteps(run.steps || []);
      try { const ps = (run.steps || []).find((x) => x.kind === "plan_setup"); if (ps && !planSeenRef.current) { planSeenRef.current = true; let def = {}; try { def = JSON.parse(ps.detail || "{}"); } catch {} setPlanSetup(def || {}); } } catch {}
      // 计时基准:只在【合理范围】内用服务端 elapsedSec(供刷新后接续);过大多半是遗留/等确认很久的 run,用本地计时避免显示成 1000s+
      if ((run.status === "running" || run.status === "pending") && typeof run.elapsedSec === "number" && run.elapsedSec < 300) elapsedBaseRef.current = { serverSec: run.elapsedSec, at: Date.now() };
      if (run.status === "done") { stopPoll(); setBusy(false); setSteps([]); if (run.reply) setMessages((m) => [...m, { role: "model", content: run.reply }]); try { placement.refreshServer(); } catch {} try { lab.refreshLayoutServer(); } catch {} try { window.dispatchEvent(new CustomEvent("kye:data-changed")); } catch {} } // 杀手改完 UI 后即时刷新(导航栏/放置表/首页布局)
      else if (run.status === "pending") { stopPoll(); setBusy(false); setSteps([]); const approve = {}; (run.actions || []).forEach((a) => (approve[a.idx] = true)); setPending({ token: run.token, kind: run.pendingKind, plan: run.plan, form: run.form, actions: run.actions || [], approve }); }
      else if (run.status === "error") { stopPoll(); setBusy(false); setSteps([]); setMessages((m) => [...m, { role: "model", content: run.reply || "(出错了,请重试)" }]); }
    } catch {}
  }
  function startPolling(runId) { setBusy(true); planSeenRef.current = false; elapsedBaseRef.current = { serverSec: 0, at: Date.now() }; stopPoll(); pollOnce(runId); pollRef.current = setInterval(() => pollOnce(runId), 1200); }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    const w = typeof window !== "undefined" ? window.innerWidth : 1024;
    const maxRows = w < 640 ? 5 : w < 1024 ? 7 : 10;   // 手机/平板/电脑不同上限
    const max = maxRows * 24 + 16;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }
  async function send(textOverride) {
    const text = (textOverride || input).trim();
    if ((!text && !files.length) || busy || pending) return;
    const attachments = await filesToAttachments(files);
    setInput(""); setFiles([]);
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.overflowY = "hidden"; }
    setMessages((m) => [...m, { role: "user", content: text + (attachments.length ? " 📎" + attachments.length : "") }]);
    setBusy(true); setSteps([]);
    try {
      const d = await aiFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text || "(见附件)", attachments, page: (typeof window !== "undefined" ? (window.location.pathname + window.location.search) : "") }) });
      if (d.runId) startPolling(d.runId);
      else { setBusy(false); setMessages((m) => [...m, { role: "tool_note", content: t("没能开始:") + (d.error || t("未知原因")) }]); }
    } catch (e) {
      setMessages((m) => m.slice(0, -1)); setInput(text); setBusy(false);
      const msg = String((e && e.message) || e || "");
      if (msg !== "ai-error" && msg !== "network") setMessages((m) => [...m, { role: "tool_note", content: t("发送失败:") + msg }]);
    }
  }

  async function clearChat() {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; } // 应用内两步确认,不用浏览器弹窗
    setConfirmClear(false);
    try { await fetch("/api/chat", { method: "DELETE" }); } catch {}
    stopPoll(); setMessages([]); setPending(null); setSteps([]); setBusy(false); setPlanFeedback("");
  }

  async function resolvePlan(action) {
    if (!pending) return;
    const p = pending; const fb = planFeedback.trim();
    setPending(null); setPlanFeedback(""); setBusy(true); setSteps([]);
    try { const d = await aiFetch("/api/chat/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: p.token, action, feedback: fb }) }); if (d.runId) startPolling(d.runId); else setBusy(false); }
    catch { setBusy(false); }
  }
  async function submitForm(values) {
    const p = pending; if (!p) return; setPending(null); setBusy(true); setSteps([]);
    try { const d = await aiFetch("/api/chat/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: p.token, formValues: values }) }); if (d.runId) startPolling(d.runId); else setBusy(false); } catch { setBusy(false); }
  }
  async function resolvePending(approveAll) {
    if (!pending) return;
    const approvals = {};
    pending.actions.forEach((a) => (approvals[a.idx] = approveAll === false ? false : pending.approve[a.idx]));
    const p = pending; setPending(null); setBusy(true); setSteps([]);
    try { const d = await aiFetch("/api/chat/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: p.token, approvals }) }); if (d.runId) startPolling(d.runId); else setBusy(false); }
    catch { setBusy(false); }
  }

  const suggestions = [t("我要准备一门新考试,帮我从零建起来"), t("帮我看看我现在学得怎么样"), t("帮我把这门考试的资料和练习准备好"), t("🧲 去某学习网站帮我把某一章采集进资料库(需装采集扩展)"), t("我觉得有一章我已经很熟了,想少花时间")];
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="mb-2 flex items-center justify-between gap-2">
        {!embedded && <h1 className="text-2xl font-black text-[#2f2413]">{t("问问杀手")}</h1>}
        {messages.length > 0 && me?.isDeveloper && <button className={"btn-ghost shrink-0 text-xs " + (confirmClear ? "bg-rose-500 text-white" : "text-rose-500")} onClick={clearChat}>🗑️ {confirmClear ? t("确认清空?") : t("清空对话")}</button>}
      </div>
      <div className="nice-scroll flex-1 overflow-y-auto overflow-x-hidden overscroll-contain space-y-3 pb-3 min-w-0">
        {!messages.length && !pending && (
          <div className="text-center text-[#6b4a25] text-sm mt-10 space-y-2">
            <p>{t("有任何想法、疑问、调整需求,直接说就行。也可以问我这个网站怎么用,或让我去某个已登录的学习网站采集资料。")}</p>
            {suggestions.map((s, i) => (
              <button key={i} className="block mx-auto rounded-full border border-[#b58a3c]/60 px-4 py-1.5 text-[#5b431f] hover:bg-[#3d2b10]/[0.07] transition" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => <ChatMsg key={i} role={m.role} content={m.content} />)}
        {bjobs.filter((j) => j.status === "pending" || j.status === "running").map((j) => (
          <div key={j.id} className="card border-sky-200 bg-sky-50/70 text-sm">
            <p className="font-semibold text-sky-900">🌐 {t("浏览器采集")}:{j.goal}</p>
            <p className="text-xs text-sky-700 mt-0.5">{j.status === "pending" ? t("等待扩展执行(请确保已安装并打开扩展,已登录目标网站)…") : t("扩展执行中…")} · {t("已采集")} {j.collected}</p>
            {j.log && <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-slate-500">{j.log.split("\n").slice(-6).join("\n")}</pre>}
          </div>
        ))}
        {bjobs.filter((j) => j.status === "done").slice(0, 1).map((j) => (
          <p key={j.id} className="text-center text-xs text-amber-700">🌐 {t("采集完成")}:{j.goal}({t("共")} {j.collected} {t("页")})</p>
        ))}
        {genExams.map((e) => (
          <div key={"gen" + e.id} className="card border-amber-200 bg-amber-50/70 text-sm">
            <p className="font-semibold text-amber-900">🛠️ {t("正在后台创建考试")}:{e.name}</p>
            <p className="text-xs text-amber-700 mt-0.5 animate-pulse">{e.setup_progress ? t(e.setup_progress) : t("生成中…")}</p>
          </div>
        ))}
        {pending && pending.kind === "plan" && (
          <div className="card border-amber-300 bg-amber-50/70">
            <p className="text-sm font-semibold text-amber-900">📋 {t("杀手拟好了执行计划,同意就开始,或说说要改哪里:")}</p>
            {pending.plan?.summary && <p className="text-sm text-amber-800 mt-1">{pending.plan.summary}</p>}
            <ol className="mt-2 space-y-1 text-sm list-decimal list-inside">
              {(pending.plan?.steps || []).map((st, i) => <li key={i}><b>{st.title}</b>{st.detail ? " — " + st.detail : ""}</li>)}
            </ol>
            <textarea className="input mt-3" rows={2} value={planFeedback} onChange={(e) => setPlanFeedback(e.target.value)} placeholder={t("想改动的地方(可留空直接同意)…例如:不要删记录、第 2 步和第 3 步对调")} />
            <div className="mt-2 flex gap-2">
              <button className="btn flex-1 py-2 text-sm" onClick={() => resolvePlan("approve")}>✅ {t("同意,开始")}</button>
              <button className="btn-ghost py-2 text-sm" disabled={!planFeedback.trim()} onClick={() => resolvePlan("revise")}>✏️ {t("按意见改计划")}</button>
            </div>
          </div>
        )}
        {planSetup && (
          <PlanSetup inline open defaults={planSetup} onClose={() => setPlanSetup(null)} onDone={() => setPlanSetup(null)} />
        )}
        {pending && pending.kind === "form" && (
          <DynamicForm title={pending.form?.title} fields={pending.form?.fields || []} busy={busy}
            onSubmit={(values) => submitForm(values)} onCancel={() => { setPending(null); }} />
        )}
        {pending && pending.kind !== "plan" && pending.kind !== "form" && (
          <div className="card border-amber-300 bg-amber-50/70">
            <p className="text-sm font-semibold text-amber-900">🔐 {t("AI 想做以下改动,需要你确认:")}</p>
            <div className="mt-2 space-y-1.5">
              {pending.actions.map((a) => (
                <label key={a.idx} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={pending.approve[a.idx]} onChange={(e) => setPending((p) => ({ ...p, approve: { ...p.approve, [a.idx]: e.target.checked } }))} className="mt-1" />
                  <span>{descLabel(a.desc)}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn flex-1 py-2 text-sm" onClick={() => resolvePending()}>{t("允许所选")}</button>
              <button className="btn-ghost py-2 text-sm" onClick={() => resolvePending(false)}>{t("全部拒绝")}</button>
            </div>
          </div>
        )}
        {busy && (() => {
          let plan = null;
          const pstep = [...steps].reverse().find((x) => x.kind === "plan");
          if (pstep) { try { plan = JSON.parse(pstep.detail); } catch {} }
          const vis = steps.filter((x) => x.kind !== "done" && x.kind !== "plan" && x.kind !== "pending"); // pending 是残留步骤:真要确认时会显示确认卡、不该混在"思考中"进程里(否则像"等你决定却没选项")
          const label = (x) => x.kind === "think" ? "💭 " + t("思考中…")
            : x.kind === "tool" ? "🔧 " + t(x.detail || "")
            : x.kind === "result" ? "✅ " + t(x.detail || "")
            : x.kind === "pending" ? "⏸ " + t("等待你确认…")
            : x.kind === "error" ? "⚠️ " + t("出错了") : t(x.detail || "");
          return (
            <div className="max-w-[90%] rounded-2xl px-4 py-2.5 text-sm bg-white border border-slate-200 text-slate-500 space-y-2">
              {plan && (
                <div className="rounded-xl bg-amber-50 p-2 ring-1 ring-amber-200">
                  <p className="text-xs font-bold text-amber-800">📋 {t("执行计划")}</p>
                  {plan.summary && <p className="text-xs text-amber-700 mt-0.5">{plan.summary}</p>}
                  <ol className="mt-1 space-y-0.5 text-xs text-slate-600 list-decimal list-inside">
                    {(plan.steps || []).map((st, i) => <li key={i}><b>{st.title}</b>{st.detail ? " — " + st.detail : ""}</li>)}
                  </ol>
                </div>
              )}
              {vis.length === 0 && !plan
                ? <span className="animate-pulse">{t("正在思考(可能需要查资料/改文档,请稍候)…")}</span>
                : <div className="space-y-1">{vis.slice(-10).map((x, i, a) => (
                    <div key={i} className={i === a.length - 1 ? "text-slate-700 animate-pulse" : "opacity-60"}>{label(x)}</div>
                  ))}</div>}
              {elapsed > 2 && <div className="text-[11px] text-slate-400 pt-0.5">{t("已用")} {elapsed}s{elapsed > 40 ? " · " + t("大改动/查资料可能较久,别急") : ""}</div>}
            </div>
          );
        })()}
        <div ref={bottom} />
      </div>
      {files.length > 0 && <p className="text-xs text-slate-500 pt-1">📎 {files.length} {t("个文件")} <button className="underline" onClick={() => setFiles([])}>{t("清除")}</button></p>}
      <DropZone onFiles={(fs) => setFiles((p) => [...p, ...fs])} className="flex gap-2 pt-2">
        <label className="btn-ghost cursor-pointer px-3" title={t("上传文件/图片(可拖拽或粘贴)")}>📎<input type="file" multiple hidden onChange={(e) => setFiles([...e.target.files])} accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx,audio/*" /></label>
        <textarea ref={taRef} rows={1} className="input flex-1 resize-none leading-6" style={{ maxHeight: "260px" }} value={input} onChange={(e) => { setInput(e.target.value); autoGrow(e.target); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); } }} placeholder={pending ? t("请先处理上面的确认…") : t("说说你的想法…(Enter 发送,Shift+Enter 换行)")} disabled={!!pending} />
        <button className="btn" onClick={() => send()} disabled={busy || (!input.trim() && !files.length) || !!pending}>{t("发送")}</button>
      </DropZone>
    </div>
  );
}
