"use client";
import { useT } from "@/components/I18n";
import { useEffect, useRef, useState } from "react";
import MD from "@/components/MD";
import { filesToAttachments } from "@/lib/attach";
import DropZone from "@/components/DropZone";
import { useAiFetch } from "@/components/AiErrorDialog";

export default function Chat() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { token, actions, approve:{idx:bool} }
  const [bjobs, setBjobs] = useState([]);
  const bottom = useRef(null);

  useEffect(() => { fetch("/api/chat").then((r) => r.json()).then((d) => setMessages(d.messages || [])); }, []);
  useEffect(() => {
    const load = () => fetch("/api/browser/status").then((r) => r.json()).then((d) => setBjobs(d.jobs || [])).catch(() => {});
    load(); const iv = setInterval(load, 4000); return () => clearInterval(iv);
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, pending]);

  function applyResult(d) {
    const notes = d.toolNotes?.length ? d.toolNotes.map((n) => ({ role: "tool_note", content: n })) : [];
    if (d.pending) {
      setMessages((m) => [...m, ...notes]);
      const approve = {}; d.actions.forEach((a) => (approve[a.idx] = true));
      setPending({ token: d.token, actions: d.actions, approve });
    } else {
      setMessages((m) => [...m, ...notes, { role: "model", content: d.reply }]);
      setPending(null);
    }
  }

  async function send(textOverride) {
    const text = (textOverride || input).trim();
    if ((!text && !files.length) || busy || pending) return;
    const attachments = await filesToAttachments(files);
    setInput(""); setFiles([]);
    setMessages((m) => [...m, { role: "user", content: text + (attachments.length ? " 📎" + attachments.length : "") }]);
    setBusy(true);
    try { applyResult(await aiFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text || "(见附件)", attachments }) })); }
    catch { setMessages((m) => m.slice(0, -1)); setInput(text); }
    setBusy(false);
  }

  async function resolvePending(approveAll) {
    if (!pending) return;
    const approvals = {};
    pending.actions.forEach((a) => (approvals[a.idx] = approveAll === false ? false : pending.approve[a.idx]));
    setBusy(true); setPending(null);
    try { applyResult(await aiFetch("/api/chat/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: pending.token, approvals }) })); }
    catch {}
    setBusy(false);
  }

  const suggestions = [t("帮我看看我现在学得怎么样"), t("帮我把这门考试的资料和练习准备好"), t("🧲 去某学习网站帮我把某一章采集进资料库(需装采集扩展)"), t("我觉得有一章我已经很熟了,想少花时间")];
  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 130px)" }}>
      <h1 className="text-2xl font-black mb-2">{t("问问杀手")}</h1>
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {!messages.length && !pending && (
          <div className="text-center text-slate-400 text-sm mt-10 space-y-2">
            <p>{t("有任何想法、疑问、调整需求,直接说就行。也可以问我这个网站怎么用,或让我去某个已登录的学习网站采集资料。")}</p>
            {suggestions.map((s, i) => (
              <button key={i} className="block mx-auto rounded-full border border-slate-300 px-4 py-1.5 text-slate-600 hover:bg-slate-100" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "tool_note" ? (
            <p key={i} className="text-center text-xs text-emerald-700">⚙️ {m.content}</p>
          ) : (
            <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "ml-auto bg-emerald-600 text-white" : "bg-white border border-slate-200"}`}>
              {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <MD className="prose-zh">{m.content}</MD>}
            </div>
          )
        )}
        {bjobs.filter((j) => j.status === "pending" || j.status === "running").map((j) => (
          <div key={j.id} className="card border-sky-200 bg-sky-50/70 text-sm">
            <p className="font-semibold text-sky-900">🌐 {t("浏览器采集")}:{j.goal}</p>
            <p className="text-xs text-sky-700 mt-0.5">{j.status === "pending" ? t("等待扩展执行(请确保已安装并打开扩展,已登录目标网站)…") : t("扩展执行中…")} · {t("已采集")} {j.collected}</p>
            {j.log && <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-slate-500">{j.log.split("\n").slice(-6).join("\n")}</pre>}
          </div>
        ))}
        {bjobs.filter((j) => j.status === "done").slice(0, 1).map((j) => (
          <p key={j.id} className="text-center text-xs text-emerald-700">🌐 {t("采集完成")}:{j.goal}({t("共")} {j.collected} {t("页")})</p>
        ))}
        {pending && (
          <div className="card border-amber-300 bg-amber-50/70">
            <p className="text-sm font-semibold text-amber-900">🔐 {t("AI 想做以下改动,需要你确认:")}</p>
            <div className="mt-2 space-y-1.5">
              {pending.actions.map((a) => (
                <label key={a.idx} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={pending.approve[a.idx]} onChange={(e) => setPending((p) => ({ ...p, approve: { ...p.approve, [a.idx]: e.target.checked } }))} className="mt-1" />
                  <span>{a.desc}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn flex-1 py-2 text-sm" onClick={() => resolvePending()}>{t("允许所选")}</button>
              <button className="btn-ghost py-2 text-sm" onClick={() => resolvePending(false)}>{t("全部拒绝")}</button>
            </div>
          </div>
        )}
        {busy && <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-white border border-slate-200 text-slate-400 animate-pulse">{t("正在思考(可能需要查资料/改文档,请稍候)…")}</div>}
        <div ref={bottom} />
      </div>
      {files.length > 0 && <p className="text-xs text-slate-500 pt-1">📎 {files.length} {t("个文件")} <button className="underline" onClick={() => setFiles([])}>{t("清除")}</button></p>}
      <DropZone onFiles={(fs) => setFiles((p) => [...p, ...fs])} className="flex gap-2 pt-2">
        <label className="btn-ghost cursor-pointer px-3" title={t("上传文件/图片(可拖拽或粘贴)")}>📎<input type="file" multiple hidden onChange={(e) => setFiles([...e.target.files])} accept="image/*,.pdf,.txt" /></label>
        <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={pending ? t("请先处理上面的确认…") : t("说说你的想法…(可拖拽/粘贴文件)")} disabled={!!pending} />
        <button className="btn" onClick={() => send()} disabled={busy || (!input.trim() && !files.length) || !!pending}>{t("发送")}</button>
      </DropZone>
    </div>
  );
}
