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
  const [other, setOther] = useState("");
  const OTHER = "其他文件或说明";
  const [openId, setOpenId] = useState(null);
  const [openContent, setOpenContent] = useState("");
  const [openBusy, setOpenBusy] = useState(false);

  const load = () => fetch("/api/materials").then((r) => r.json()).then((d) => { setList(d.materials); const cl = d.checklist || []; setChecklist(cl); const o = cl.find((c) => c.item === OTHER); setOther(o?.answer || ""); });
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
  async function saveOther() {
    const cl = checklist.filter((c) => c.item !== OTHER);
    if (other.trim()) cl.push({ kind: "qa", item: OTHER, why: "", priority: "opt", fixed: true, answer: other, done: true });
    setChecklist(cl);
    await fetch("/api/materials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist: cl }) });
  }
  async function view(m) {
    if (openId === m.id) { setOpenId(null); return; }
    setOpenId(m.id); setOpenContent(""); setOpenBusy(true);
    try { const d = await fetch(`/api/materials/content?id=${m.id}`).then((r) => r.json()); setOpenContent((d.content || "").trim() || t("(这个文件没有可显示的文本内容)")); }
    catch { setOpenContent(t("加载失败")); }
    setOpenBusy(false);
  }
  async function del(id) {
    if (!confirm(t("确定删除这份资料?相关检索内容也会移除。"))) return;
    await fetch("/api/materials/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("补充资料")}</h1>
      <div className="card space-y-2">
        <input type="file" multiple className="input" onChange={(e) => setFiles([...e.target.files])} accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" />
        {files.length > 0 && <button className="btn w-full" onClick={upload} disabled={busy}>{t("上传")} {files.length} {t("个文件")}</button>}
        {log && <p className="text-sm text-amber-700 animate-pulse">{log}</p>}
        <p className="text-xs text-stone-400">{t("支持 PDF、Word、文本、图片(手机拍照即可)。扫描版 PDF 请转成图片上传。")}</p>
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">{t("资料库")}（{list.length}）<span className="ml-1 text-xs font-normal text-stone-400">— {t("已上传的资料,点删除可移除")}</span></h2>
        {list.map((m) => (
          <div key={m.id} className="card py-3">
            <div className="flex items-center justify-between gap-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => view(m)}>
                <p className="font-medium text-sm truncate">{openId === m.id ? "▾ " : "▸ "}{m.filename}</p>
                <p className="text-xs text-stone-500">
                  {m.status === "ready" && `${t("✓ 已入库")} (${m.chunk_count}) · ${t("点开查看")}`}
                  {m.status === "processing" && t("⏳ 处理中")}
                  {m.status === "failed" && <span className="text-red-600">✗ {m.error}</span>}
                </p>
              </button>
              <button className="shrink-0 text-stone-400 hover:text-red-600 text-sm" onClick={() => del(m.id)}>{t("删除")}</button>
            </div>
            {openId === m.id && (
              <div className="mt-2 border-t border-stone-200 pt-2">
                {openBusy ? <p className="text-sm text-stone-400 animate-pulse">{t("加载中…")}</p> : (
                  <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/[0.03] p-3 text-xs leading-relaxed text-stone-700">{openContent}</div>
                )}
                <p className="mt-1 text-[11px] text-stone-400">{t("这是 AI 从该文件读取到的文本(原始文件不保存)。")}</p>
              </div>
            )}
          </div>
        ))}
        {!list.length && <p className="text-center text-stone-400 text-sm py-4">{t("还没有资料。上面上传后会显示在这里,可随时删除。")}</p>}
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold text-sm">{t("其他文件或说明")}</h2>
        <p className="text-xs text-stone-400">{t("有资料没法上传(纸质书、老师口头强调、目标分数等),或想直接告诉 AI 的补充说明,写在这里。")}</p>
        <textarea className="input" rows={3} value={other} onChange={(e) => setOther(e.target.value)} onBlur={saveOther} placeholder={t("例如:我有纸质《XX》第 3 章;老师说重点考案例分析;目标 80 分…")} />
      </div>
      {checklist.filter((c) => c.item !== OTHER).length > 0 && (
        <div className="card space-y-1">
          <h2 className="font-semibold text-sm mb-1">{t("资料收集清单")}({done}/{checklist.length})</h2>
          {checklist.map((c, i) => c.item === OTHER ? null : c.kind === "qa" ? (
            <div key={i} className="py-1.5 border-b border-slate-100 last:border-0">
              <p className="text-sm">{c.priority === "must" ? "🔴 " : ""}{c.item} <span className="text-xs text-slate-400">— {t("直接回答")}</span></p>
              <div className="mt-1 flex gap-2">
                <input className="input py-2 text-sm" value={c.answer || ""} onChange={(e) => setAnswer(i, e.target.value)} onBlur={() => saveAnswer(i)} placeholder={c.why} />
                {c.done && <span className="text-amber-600 text-sm self-center">✓</span>}
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
    </div>
  );
}
