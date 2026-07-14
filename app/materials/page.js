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
  const [resBusy, setResBusy] = useState(null);
  const [resOut, setResOut] = useState({});
  async function resolveRefs(id) {
    setResBusy(id); setResOut((o) => ({ ...o, [id]: null }));
    try {
      const r = await fetch("/api/bank/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId: id }) }).then((x) => x.json());
      setResOut((o) => ({ ...o, [id]: r }));
    } catch { setResOut((o) => ({ ...o, [id]: { error: 1 } })); }
    setResBusy(null);
  }

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
    setOpenId(m.id); setOpenContent("");
    if (m.stored && (m.kind === "image" || m.kind === "audio" || m.kind === "pdf")) return; // 有原文件,直接看
    setOpenBusy(true);
    try { const d = await fetch(`/api/materials/content?id=${m.id}`).then((r) => r.json()); setOpenContent((d.content || "").trim() || t("(这个文件没有可显示的文本内容)")); }
    catch { setOpenContent(t("加载失败")); }
    setOpenBusy(false);
  }
  async function del(id) {
    if (!confirm(t("确定删除这份资料?相关检索内容也会移除。"))) return;
    await fetch("/api/materials/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  const [smap, setSmap] = useState(null);
  const [smapBusy, setSmapBusy] = useState(false);
  async function runStudyMap() {
    setSmapBusy(true); setSmap(null);
    try { const d = await fetch("/api/study-map").then((r) => r.json()); setSmap(d); } catch { setSmap({ err: 1 }); }
    setSmapBusy(false);
  }
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("补充资料")}</h1>
      {list.length >= 2 && (
        <div className="card">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-sm">🗺️ {t("学习地图")}</h2>
              <p className="text-xs text-stone-400">{t("把这些资料理一理:哪些重复、哪些互补、缺什么、先学哪份。")}</p>
            </div>
            {!smap?.map && <button className="btn-ghost py-2 text-xs shrink-0" onClick={runStudyMap} disabled={smapBusy}>{smapBusy ? t("整理中…") : t("生成学习地图")}</button>}
          </div>
          {smap && (smap.map || smap.err || smap.reason) && (
            smap.err ? <p className="mt-2 text-xs text-stone-400">{t("生成失败,稍后再试。")}</p>
            : !smap.map ? <p className="mt-2 text-xs text-stone-400">{t("至少要2份资料才能生成地图。")}</p>
            : (<div className="mt-3 space-y-3 text-sm">
                {smap.map.summary && <div className="rounded-xl bg-amber-50 px-3 py-2 font-semibold text-[#5a2d0c]">{smap.map.summary}</div>}
                {smap.map.order?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">{t("建议学习顺序")}</div><ol className="mt-1 list-decimal pl-5 text-stone-700">{smap.map.order.map((o, i) => <li key={i}><span className="font-medium">{o.material}</span>{o.why ? <span className="text-stone-500"> — {o.why}</span> : ""}</li>)}</ol></div>}
                {smap.map.redundant?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-rose-700">{t("重复(留一份就够)")}</div>{smap.map.redundant.map((r, i) => <div key={i} className="mt-1 rounded-xl bg-rose-50 px-3 py-1.5 text-xs">{(r.materials || []).join(" · ")}{r.note ? <span className="text-stone-500"> — {r.note}</span> : ""}</div>)}</div>}
                {smap.map.complementary?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-sky-700">{t("互补搭配")}</div>{smap.map.complementary.map((r, i) => <div key={i} className="mt-1 rounded-xl bg-sky-50 px-3 py-1.5 text-xs">{(r.materials || []).join(" + ")}{r.note ? <span className="text-stone-500"> — {r.note}</span> : ""}</div>)}</div>}
                {smap.map.groups?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-stone-500">{t("按主题分组")}</div>{smap.map.groups.map((g, i) => <div key={i} className="mt-1 rounded-xl bg-stone-50 px-3 py-1.5 text-xs"><span className="font-medium">{g.topic}</span>：{(g.materials || []).join("、")}</div>)}</div>}
                {smap.map.gaps?.length > 0 && <div><div className="text-xs font-bold uppercase tracking-wide text-amber-700">{t("还缺资料的主题")}</div><ul className="mt-1 list-disc pl-5 text-stone-600">{smap.map.gaps.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              </div>)
          )}
        </div>
      )}
      <div className="card space-y-2">
        <input type="file" multiple className="input" onChange={(e) => setFiles([...e.target.files])} accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.ogg,.aac,image/*,audio/*" />
        {files.length > 0 && <button className="btn w-full" onClick={upload} disabled={busy}>{t("上传")} {files.length} {t("个文件")}</button>}
        {log && <p className="text-sm text-amber-700 animate-pulse">{log}</p>}
        <p className="text-xs text-stone-400">{t("支持 PDF、Word、文本、图片(手机拍照即可)。扫描版 PDF 请转成图片上传。")}</p>
        <p className="text-[11px] text-stone-400">{t("请确保你有权使用所上传的资料,仅用于个人备考。")}</p>
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">{t("资料库")}（{list.length}）<span className="ml-1 text-xs font-normal text-stone-400">— {t("已上传的资料,点删除可移除")}</span></h2>
        {list.map((m) => (
          <div key={m.id} className="card py-3">
            <div className="flex items-center justify-between gap-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => view(m)}>
                <p className="font-medium text-sm truncate">{openId === m.id ? "▾ " : "▸ "}{m.filename}{m.shared && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-normal text-sky-700 align-middle">🔗 {t("共享自")} {m.fromExamName}</span>}</p>
                <p className="text-xs text-stone-500">
                  {m.status === "ready" && `${m.chunk_count ? `${t("✓ 已入库")} (${m.chunk_count})` : t("✓ 已保存")} · ${t("点开查看")}`}
                  {m.status === "processing" && t("⏳ 处理中")}
                  {m.status === "failed" && <span className="text-red-600">✗ {m.error}</span>}
                </p>
                {m.offtopic ? <p className="mt-0.5 text-xs text-rose-600">⚠️ {t("这份资料似乎跟本考试主题不符")}{m.offtopic_reason ? "：" + m.offtopic_reason : ""}</p> : null}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {m.status === "ready" && m.kind !== "image" && m.kind !== "audio" && (
                  <button className="text-amber-700 hover:text-amber-900 text-xs underline" disabled={resBusy === m.id} onClick={() => resolveRefs(m.id)}>{resBusy === m.id ? t("解析中…") : "📎 " + t("解析成真题")}</button>
                )}
                {!m.shared && <button className="text-stone-400 hover:text-red-600 text-sm" onClick={() => del(m.id)}>{t("删除")}</button>}
              </div>
            </div>
            {resOut[m.id] && (
              <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-stone-700 ring-1 ring-amber-200">
                {resOut[m.id].error ? t("解析失败,稍后再试。")
                 : resOut[m.id].reason === "not_pointer_list" ? t("这份资料看起来不是「教材第X页第Y题」那种指针清单,没解析出可入库的真题。")
                 : resOut[m.id].reason === "no_source" ? t("这份资料没有可读文本(可能是扫描图/未入库)。")
                 : <>
                    <div className="font-semibold text-amber-800">{t("已把定位到的真题入库")}：{resOut[m.id].added}/{resOut[m.id].total}</div>
                    {(resOut[m.id].misses || []).length > 0 && <div className="mt-0.5 text-stone-500">{t("没找到(不编题)")}：{(resOut[m.id].misses || []).slice(0, 6).join("；")}{(resOut[m.id].misses || []).length > 6 ? "…" : ""}</div>}
                    {(resOut[m.id].needImages || []).length > 0 && <div className="mt-0.5 text-stone-500">{t("这些在扫描图里,需你把那几页拍清楚给杀手看")}：{(resOut[m.id].needImages || []).slice(0, 6).join("；")}</div>}
                    {resOut[m.id].added > 0 && <a href="/practice?fresh=1" className="mt-1 inline-block font-semibold text-amber-700 underline">{t("去练这些真题")} →</a>}
                   </>}
              </div>
            )}
            {openId === m.id && (
              <div className="mt-2 border-t border-stone-200 pt-2">
                {m.stored && m.kind === "image" ? (
                  <img src={`/api/materials/raw?id=${m.id}`} alt={m.filename} className="max-h-96 w-auto rounded-xl border border-stone-200" />
                ) : m.stored && m.kind === "audio" ? (
                  <audio controls src={`/api/materials/raw?id=${m.id}`} className="w-full" />
                ) : m.stored && m.kind === "pdf" ? (
                  <iframe src={`/api/materials/raw?id=${m.id}`} className="h-96 w-full rounded-xl border border-stone-200" title={m.filename} />
                ) : openBusy ? (
                  <p className="text-sm text-stone-400 animate-pulse">{t("加载中…")}</p>
                ) : (
                  <div className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/[0.03] p-3 text-xs leading-relaxed text-stone-700">{openContent}</div>
                )}
                {m.stored ? <a href={`/api/materials/raw?id=${m.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-amber-700 underline">{t("在新标签打开 / 下载原文件")}</a> : <p className="mt-1 text-[11px] text-stone-400">{t("原文件未保存(在启用「保存原件」前上传的),以上为已提取文字;重新上传可查看/播放原件。")}</p>}
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
