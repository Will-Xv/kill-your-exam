"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import MD from "@/components/MD";
import DropZone from "@/components/DropZone";
import { filesToAttachments } from "@/lib/attach";
import { useAiFetch } from "@/components/AiErrorDialog";

export default function ProfilePage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [data, setData] = useState(null);
  const [doc, setDoc] = useState("");
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [instr, setInstr] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/profile/overall").then((r) => r.json()).then((d) => { setData(d); setDoc(d.doc || ""); });
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try { await fetch("/api/profile/overall", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }) }); setEdit(false); }
    catch {}
    setSaving(false);
  }
  async function runAI() {
    setBusy(true);
    try {
      const attachments = await filesToAttachments(files);
      const d = await aiFetch("/api/profile/overall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: instr.trim(), attachments }) });
      if (d.doc) { setDoc(d.doc); setEdit(false); setAiOpen(false); setInstr(""); setFiles([]); }
    } catch {}
    setBusy(false);
  }

  if (!data) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;

  return (
    <div className="space-y-4 md:mt-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🧭 {t("你的全部杀技")}</h1>
        <div className="flex gap-2">
          {!edit && <button className="btn-ghost text-sm py-2" onClick={() => setEdit(true)}>✏️ {t("编辑")}</button>}
          <button className="btn text-sm py-2" onClick={() => setAiOpen((v) => !v)}>✨ {t("让 AI 更新")}</button>
        </div>
      </div>
      <p className="text-xs text-stone-400">{t("这是一份长期、跨所有考试的你的档案。你的每一个考试都会读它,从而了解你的整体情况。可以直接看、直接改,或让 AI 更新。")}</p>

      {aiOpen && (
        <DropZone onFiles={(fs) => setFiles((p) => [...p, ...fs])} className="card space-y-2">
          <p className="text-sm font-medium">✨ {t("让 AI 更新你的全部杀技")}</p>
          <p className="text-xs text-stone-400">{t("可以只说要求(比如「我更擅长逻辑推理,请体现」),也可以拖拽/粘贴/上传文件让 AI 参考。留空则只根据最新做题数据刷新。")}</p>
          <textarea className="input" rows={3} placeholder={t("给 AI 的补充或修改要求(可留空)…")} value={instr} onChange={(e) => setInstr(e.target.value)} />
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <label className="btn-ghost cursor-pointer px-3 py-1">📎 {t("上传文件")}<input type="file" multiple hidden accept="image/*,.pdf,.txt" onChange={(e) => setFiles([...e.target.files])} /></label>
            {files.length > 0 && <span>{files.length} {t("个文件")} <button className="underline" onClick={() => setFiles([])}>{t("清除")}</button></span>}
            <span className="text-xs text-stone-300">{t("也可拖拽或粘贴")}</span>
          </div>
          <button className="btn text-sm py-2" onClick={runAI} disabled={busy}>{busy ? t("AI 更新中…") : t("开始更新")}</button>
        </DropZone>
      )}

      {edit ? (
        <div className="card space-y-2">
          <textarea className="input font-mono text-sm" rows={18} value={doc} onChange={(e) => setDoc(e.target.value)} placeholder={t("还没有内容。可以自己写,或点「让 AI 更新」。")} />
          <div className="flex gap-2">
            <button className="btn text-sm py-2" onClick={save} disabled={saving}>{saving ? t("保存中…") : t("保存")}</button>
            <button className="btn-ghost text-sm py-2" onClick={() => { setDoc(data.doc || ""); setEdit(false); }}>{t("取消")}</button>
          </div>
        </div>
      ) : (
        <div className="card">
          {doc ? <MD>{doc}</MD> : <p className="text-center text-stone-400 py-6">{t("这套杀技档案还是空的。点「让 AI 更新」根据你的做题情况自动生成,或点「编辑」自己写。")}</p>}
          {data.updatedAt && <p className="mt-3 text-[10px] text-stone-300">{t("更新于")} {data.updatedAt.slice(0, 16).replace("T", " ")}</p>}
        </div>
      )}

      {data.exams.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.exams.map((e) => (
            <div key={e.id} className="card">
              <p className="font-bold">{e.name} {e.type && <span className="badge-material">{e.type}</span>}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                <div><b>{e.done}</b><div className="text-xs text-stone-400">{t("做题")}</div></div>
                <div><b>{e.accuracy}%</b><div className="text-xs text-stone-400">{t("正确率")}</div></div>
                <div><b>{e.activeDays}</b><div className="text-xs text-stone-400">{t("活跃天数")}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.overlap.length > 0 && (
        <div className="card">
          <p className="font-semibold">🔗 {t("跨考试重叠的能力")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.overlap.map((o, i) => (
              <span key={i} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700" title={o.exams.join(" · ")}>{o.title}</span>
            ))}
          </div>
        </div>
      )}

      <MemorySection t={t} />
    </div>
  );
}

function MemorySection({ t }) {
  const [mem, setMem] = useState(null);
  const [showForgotten, setShowForgotten] = useState(false);
  const load = () => fetch("/api/memory").then((r) => (r.ok ? r.json() : null)).then(setMem).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!mem) return null; // 非开发者(403)或加载中:不显示
  const act = async (action, id) => { await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) }); load(); };
  // 记忆时间线(类12):同一主题随时间出现【不同 valence】的,展示它对你的了解如何变化(不覆盖旧记录)。
  const bySubj = {};
  for (const r of mem.active) { (bySubj[r.subject] = bySubj[r.subject] || []).push(r); }
  const timelines = Object.entries(bySubj)
    .filter(([, arr]) => arr.length > 1 && new Set(arr.map((x) => x.valence || "")).size > 1)
    .map(([subj, arr]) => ({ subj, entries: arr.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }));
  const vColor = (v) => v === "strong" || v === "mastered" ? "text-emerald-700" : v === "weak" ? "text-rose-600" : "text-stone-500";
  const global = mem.active.filter((r) => r.scope === "global" || r.scope == null);
  const perExam = mem.active.filter((r) => r.scope === "exam");
  const Row = ({ r }) => (
    <div className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <span className="font-medium">{r.subject}</span>:<span> {r.claim}</span>
        <span className="ml-2 text-[10px] text-stone-400">{t("权重")}{r.recency}{r.valence ? "·" + r.valence : ""}{r.exam_id ? "·#" + r.exam_id : ""}</span>
      </div>
      <button className="text-stone-400 hover:text-red-500" title={t("忘掉(可恢复)")} onClick={() => act("forget", r.id)}>🗑</button>
    </div>
  );
  return (
    <div className="card space-y-2">
      <p className="font-semibold">🧠 {t("杀手记得你什么")}</p>
      <p className="text-xs text-stone-400">{t("这是杀手对你的长期记忆——它据此更懂你。任何一条你都可以删(软删、随时恢复)。")}</p>
      {timelines.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-stone-500">🕒 {t("它对你的了解随时间的变化")}</p>
          <div className="space-y-1.5">
            {timelines.map((tl) => (
              <div key={tl.subj} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <span className="font-medium">{tl.subj}</span>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                  {tl.entries.map((e, i) => (
                    <span key={e.id} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-stone-300">→</span>}
                      <span className={vColor(e.valence)}>{e.valence || t("中性")}</span>
                      <span className="text-stone-400">{(e.created_at || "").slice(0, 10)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {global.length > 0 && <div><p className="mb-1 text-xs font-semibold text-stone-500">{t("全局记忆")}</p><div className="space-y-1">{global.map((r) => <Row key={r.id} r={r} />)}</div></div>}
      {perExam.length > 0 && <div><p className="mb-1 mt-2 text-xs font-semibold text-stone-500">{t("按考试的记忆")}</p><div className="space-y-1">{perExam.map((r) => <Row key={r.id} r={r} />)}</div></div>}
      {mem.active.length === 0 && <p className="text-xs text-stone-400">{t("还没有记忆条目。")}</p>}
      {mem.forgotten.length > 0 && (
        <div className="pt-1">
          <button className="text-xs text-stone-400 underline" onClick={() => setShowForgotten((v) => !v)}>{showForgotten ? t("收起") : t("已忘记的") + " (" + mem.forgotten.length + ")"}</button>
          {showForgotten && <div className="mt-1 space-y-1">{mem.forgotten.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-1.5 text-xs text-stone-400 line-through">
              <span className="min-w-0 flex-1 truncate">{r.subject}: {r.claim}</span>
              <button className="text-emerald-600 no-underline hover:underline" onClick={() => act("restore", r.id)}>↩ {t("恢复")}</button>
            </div>))}</div>}
        </div>
      )}
    </div>
  );
}
