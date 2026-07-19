"use client";
import { confirmDialog } from "@/components/ui/dialog";
import { useEffect, useState } from "react";

// 开发者:按题目 id 检查/修复一道题(看/改原始 JSON、标记问题、删除)。/bugs 里可用 ?q=<id> 直达。
export default function QuestionTool({ t }) {
  const [id, setId] = useState("");
  const [q, setQ] = useState(null);
  const [body, setBody] = useState("");
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(qid) {
    const useId = qid || id; if (!useId) return;
    setBusy(true); setMsg(""); setQ(null);
    try {
      const r = await fetch(`/api/dev/question?id=${Number(useId)}`);
      if (!r.ok) { setMsg(t("没找到这道题(id 不对或已删除)")); setBusy(false); return; }
      const d = await r.json(); setQ(d.question);
      try { setBody(JSON.stringify(JSON.parse(d.question.body), null, 2)); } catch { setBody(d.question.body); }
      try { setAnswer(JSON.stringify(JSON.parse(d.question.answer), null, 2)); } catch { setAnswer(d.question.answer); }
    } catch { setMsg(t("加载失败")); }
    setBusy(false);
  }
  useEffect(() => {
    try { const p = new URLSearchParams(location.search).get("q"); if (p) { setId(p); load(p); } } catch {}
  }, []); // eslint-disable-line

  async function act(action) {
    if (!q) return;
    if (action === "delete" && !await confirmDialog(t("确定永久删除这道题?(做过它的记录会保留,但题目消失)"))) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/dev/question", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, action, body, answer }) });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || t("操作失败")); } else { setMsg(action === "delete" ? t("已删除") : t("已保存")); if (action !== "delete") load(q.id); else setQ(null); }
    } catch { setMsg(t("操作失败")); }
    setBusy(false);
  }

  return (
    <div className="card">
      <h2 className="font-bold mb-2">🔧 {t("题目检查 / 修复")}</h2>
      <p className="text-xs text-slate-400 mb-2">{t("输入题目 id(在 Bug 反馈里能看到),可查看并直接改原始 JSON、标记问题、或删除。")}</p>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="question id" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn px-4" onClick={() => load()} disabled={busy}>{t("加载")}</button>
      </div>
      {msg && <p className="text-sm mt-2 text-amber-700">{msg}</p>}
      {q && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-xs text-slate-500">id {q.id} · exam {q.exam_id} · kp {q.kpTitle || q.kp_id} · {q.qtype} · {q.origin}{q.is_real ? " · 真题" : ""} · {t("已做")} {q.attempts} · {q.flagged ? "🚩 已标记问题" : "正常"}</p>
          <div><p className="text-xs text-slate-500 mb-1">body (JSON)</p><textarea className="input font-mono text-xs" rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div><p className="text-xs text-slate-500 mb-1">answer (JSON)</p><textarea className="input font-mono text-xs" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn px-4 py-1" onClick={() => act("save")} disabled={busy}>💾 {t("保存修改")}</button>
            {q.flagged ? <button className="btn-ghost px-3 py-1" onClick={() => act("unflag")} disabled={busy}>{t("取消标记")}</button> : <button className="btn-ghost px-3 py-1" onClick={() => act("flag")} disabled={busy}>🚩 {t("标记为有问题(从练习/模拟中隐藏)")}</button>}
            <button className="btn-ghost px-3 py-1 text-red-600" onClick={() => act("delete")} disabled={busy}>🗑 {t("删除这道题")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
