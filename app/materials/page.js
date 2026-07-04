"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";

export default function Materials() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [list, setList] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  const load = () => fetch("/api/materials").then((r) => r.json()).then((d) => { setList(d.materials); setChecklist(d.checklist || []); });
  useEffect(() => { load(); }, []);

  async function upload() {
    setBusy(true);
    for (const f of files) {
      setLog(`${t("正在解析")} ${f.name}…`);
      const fd = new FormData(); fd.append("file", f);
      try { await aiFetch("/api/materials/upload", { method: "POST", body: fd }); } catch {}
    }
    setFiles([]); setLog(""); setBusy(false); load();
  }
  async function toggleCheck(i) {
    const next = checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c));
    setChecklist(next);
    await fetch("/api/materials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist: next }) });
  }
  function setAnswer(i, v) { setChecklist(checklist.map((c, j) => (j === i ? { ...c, answer: v } : c))); }
  async function saveAnswer(i) {
    const next = checklist.map((c, j) => (j === i ? { ...c, done: !!(c.answer && c.answer.trim()) } : c));
    setChecklist(next);
    await fetch("/api/materials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist: next }) });
  }
  async function del(id) {
    if (!confirm(t("确定删除这份资料?相关检索内容也会移除。"))) return;
    await fetch("/api/materials/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("资料库")}</h1>
      <div className="card space-y-2">
        <input type="file" multiple className="input" onChange={(e) => setFiles([...e.target.files])} accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" />
        {files.length > 0 && <button className="btn w-full" onClick={upload} disabled={busy}>{t("上传")} {files.length} {t("个文件")}</button>}
        {log && <p className="text-sm text-emerald-700 animate-pulse">{log}</p>}
        <p className="text-xs text-stone-400">{t("支持 PDF、Word、文本、图片(手机拍照即可)。扫描版 PDF 请转成图片上传。")}</p>
      </div>
      {checklist.length > 0 && (
        <div className="card space-y-1">
          <h2 className="font-semibold text-sm mb-1">{t("资料收集清单")}({done}/{checklist.length})</h2>
          {checklist.map((c, i) => c.kind === "qa" ? (
            <div key={i} className="py-1.5 border-b border-slate-100 last:border-0">
              <p className="text-sm">{c.priority === "must" ? "🔴 " : ""}{c.item} <span className="text-xs text-slate-400">— {t("直接回答")}</span></p>
              <div className="mt-1 flex gap-2">
                <input className="input py-2 text-sm" value={c.answer || ""} onChange={(e) => setAnswer(i, e.target.value)} onBlur={() => saveAnswer(i)} placeholder={c.why} />
                {c.done && <span className="text-emerald-600 text-sm self-center">✓</span>}
              </div>
            </div>
          ) : (
            <label key={i} className="flex items-start gap-2 text-sm py-1.5 cursor-pointer border-b border-slate-100 last:border-0">
              <input type="checkbox" checked={!!c.done} onChange={() => toggleCheck(i)} className="mt-1" />
              <span className={c.done ? "line-through text-slate-400" : ""}>{c.priority === "must" ? "🔴 " : ""}{c.item} <span className="text-xs text-slate-400">({t("上传文件")})</span></span>
            </label>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {list.map((m) => (
          <div key={m.id} className="card flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-sm">{m.filename}</p>
              <p className="text-xs text-stone-500">
                {m.status === "ready" && `${t("✓ 已入库")} (${m.chunk_count})`}
                {m.status === "processing" && t("⏳ 处理中")}
                {m.status === "failed" && <span className="text-red-600">✗ {m.error}</span>}
              </p>
            </div>
            <button className="text-stone-400 hover:text-red-600 text-sm" onClick={() => del(m.id)}>{t("删除")}</button>
          </div>
        ))}
        {!list.length && <p className="text-center text-stone-400 text-sm py-6">{t("还没有资料。资料是 AI 讲对、出对题的地基。")}</p>}
      </div>
    </div>
  );
}
