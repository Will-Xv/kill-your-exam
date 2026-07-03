"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAiFetch } from "@/components/AiErrorDialog";

export default function Chat() {
  const aiFetch = useAiFetch();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  useEffect(() => { fetch("/api/chat").then((r) => r.json()).then((d) => setMessages(d.messages || [])); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function send(textOverride) {
    const text = (textOverride || input).trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const d = await aiFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const notes = d.toolNotes?.length ? d.toolNotes.map((n) => ({ role: "tool_note", content: n })) : [];
      setMessages((m) => [...m, ...notes, { role: "model", content: d.reply }]);
    } catch {
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    }
    setBusy(false);
  }

  const suggestions = ["帮我看看我现在学得怎么样", "我觉得有一章我已经很熟了,想少花时间", "帮我搜一下这门考试最新的公告"];
  return (
    <div className="flex flex-col md:mt-14" style={{ height: "calc(100dvh - 130px)" }}>
      <h1 className="text-2xl font-bold mb-2">聊天</h1>
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {!messages.length && (
          <div className="text-center text-stone-400 text-sm mt-10 space-y-2">
            <p>有任何想法、疑问、调整需求,直接说就行。</p>
            {suggestions.map((s, i) => (
              <button key={i} className="block mx-auto rounded-full border border-stone-300 px-4 py-1.5 text-stone-600 hover:bg-stone-100" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "tool_note" ? (
            <p key={i} className="text-center text-xs text-emerald-700">⚙️ {m.content}</p>
          ) : (
            <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "ml-auto bg-emerald-600 text-white" : "bg-white border border-stone-200"}`}>
              {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <div className="prose-zh"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
            </div>
          )
        )}
        {busy && <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-white border border-stone-200 text-stone-400 animate-pulse">正在思考(可能需要查资料/改文档,请稍候)…</div>}
        <div ref={bottom} />
      </div>
      <div className="flex gap-2 pt-2">
        <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="说说你的想法…" />
        <button className="btn" onClick={() => send()} disabled={busy || !input.trim()}>发送</button>
      </div>
    </div>
  );
}
