"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import PerformTask from "@/components/PerformTask";

const QT = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答", perform: "表演" };
function fmt(ts) { if (!ts) return ""; try { return new Date(ts.replace(" ", "T") + "Z").toLocaleString(); } catch { return ts; } }

function BugCard({ b, t, reload }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(b.adminNote || "");
  const [lt, setLt] = useState(""); const [lb, setLb] = useState(""); const [busy, setBusy] = useState(false); const [tryOpen, setTryOpen] = useState(false);
  const s = b.snapshot || {};
  async function act(action, extra = {}) { setBusy(true); try { await fetch("/api/admin/bugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, action, ...extra }) }); await reload(); } catch {} setBusy(false); }
  const imgs = (s.attMeta || []).map((a, i) => ({ ...a, i })).filter((a) => (a.mime || "").startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(a.name || ""));
  const files = (s.attMeta || []).map((a, i) => ({ ...a, i })).filter((a) => !imgs.find((x) => x.i === a.i));
  return (
    <div className={`card ${b.deletedAt ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-stone-400">#{b.id} · {b.examName} · {t(QT[b.qtype] || b.qtype)} · {b.username} · {fmt(b.createdAt)}</p>
          <p className="font-medium text-sm mt-0.5 line-clamp-2"><MD inline>{s.stem || ""}</MD></p>
          {b.userNote && <p className="text-sm text-amber-800 mt-1">🗣️ {b.userNote}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${b.deletedAt ? "bg-stone-200 text-stone-500" : b.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{b.deletedAt ? t("已删除") : b.status === "done" ? t("已完成") : t("待处理")}</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center mt-2"><button className="btn-ghost text-xs" onClick={() => setOpen((v) => !v)}>{open ? t("收起详情") : t("查看完整题目与作答")}</button><a className="btn-ghost text-xs" href={`/dev?q=${b.questionId}`}>🔧 {t("在开发者工具里修这道题")}</a></div>
      {open && (
        <div className="mt-2 space-y-2 text-sm border-t border-stone-100 pt-2">
          {!!(s.options || []).length && <div>{s.options.map((o, i) => <div key={i} className="text-stone-600">{"ABCDEF"[i]}. <MD inline>{o}</MD></div>)}</div>}
          {s.perform && <p className="text-stone-600">🎭 {t("作答方式")}:{s.perform.captureType === "video" ? t("录像") : t("录音")} · {s.perform.analyzeAudio} · rubric: {(s.perform.rubric || []).join(" | ")}<br/>{s.perform.instructions}</p>}
          {s.perform?.mediaMaterialId ? <div><p className="text-xs text-stone-500">🎵 {t("题目给定音乐(用户听到的)")}</p><audio controls preload="metadata" className="w-full" src={`/api/admin/bug-media?bug=${b.id}&mid=${s.perform.mediaMaterialId}`} /></div> : null}
          {s.audioId ? <div><p className="text-xs text-stone-500">🎧 {t("题目音频(用户听到的)")}</p><audio controls preload="metadata" className="w-full" src={`/api/admin/bug-media?bug=${b.id}&mid=${s.audioId}`} /></div> : null}
          {!!(s.examMedia || []).length && (
            <div>
              <p className="text-xs text-stone-500 mb-1">🖼️ {t("这门考试的图片/音频素材(题目可能用到)")}</p>
              <div className="space-y-1">
                {s.examMedia.map((m) => m.kind === "image"
                  ? <div key={m.id}><p className="text-[11px] text-stone-400">{m.filename}</p><img src={`/api/admin/bug-media?bug=${b.id}&mid=${m.id}`} alt={m.filename} className="max-h-48 rounded border border-stone-200 bg-white" /></div>
                  : <div key={m.id}><p className="text-[11px] text-stone-400">🎧 {m.filename}</p><audio controls preload="none" className="w-full" src={`/api/admin/bug-media?bug=${b.id}&mid=${m.id}`} /></div>)}
              </div>
            </div>
          )}
          <p><b>{t("参考答案:")}</b><MD inline>{s.answer || ""}</MD></p>
          {s.explanation && <p className="text-stone-600"><b>{t("解析:")}</b><MD inline>{s.explanation}</MD></p>}
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-stone-500 text-xs mb-1">{t("用户作答")}</p>
            {s.userAnswer ? <MD className="prose-zh">{s.userAnswer}</MD> : <span className="text-stone-400">{t("(无文字作答)")}</span>}
            {!!(s.selected || []).length && <p className="text-xs text-stone-500">{t("选择")}: {(s.selected || []).join(", ")}</p>}
            {s.grade && <p className="text-xs mt-1">{t("AI判分")}: {s.grade.correct ? "✓" : "✗"} {s.grade.score != null ? s.grade.score : ""} {s.grade.feedback ? "· " + s.grade.feedback : ""}</p>}
          </div>
          {imgs.map((a) => <div key={a.i}><p className="text-xs text-stone-500">{a.name}</p><img src={`/api/admin/bug-att?bug=${b.id}&i=${a.i}`} alt={a.name} className="w-full rounded-lg border border-stone-200 bg-white" /></div>)}
          {files.map((a) => <a key={a.i} href={`/api/admin/bug-att?bug=${b.id}&i=${a.i}`} target="_blank" rel="noreferrer" className="block text-xs text-amber-700 underline">📎 {a.name}</a>)}
          {s.diag && (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-stone-600">
              <p className="text-stone-500 mb-1">🩺 {t("环境诊断")}</p>
              <p>{t("麦克风权限")}: <b>{s.diag.micPermission}</b> · {t("支持录音")}: {String(s.diag.mediaSupported)} · {t("安全上下文")}: {String(s.diag.secure)}{s.diag.inApp ? " · ⚠️ " + t("内置浏览器(微信/QQ等,常不支持录音)") : ""}</p>
              <p className="break-all">{s.diag.screen} · {s.diag.platform} · {s.diag.lang}</p>
              <p className="break-all text-stone-400">{s.diag.ua}</p>
            </div>
          )}
          {b.hasRecording && (
            <div>
              <p className="text-xs text-stone-500 mb-1">🎥 {t("用户本人的作答录制(原始记录)")}</p>
              {(b.recMime || "").startsWith("video") ? <video controls preload="metadata" className="w-full rounded-lg border border-stone-200 bg-black" src={`/api/admin/bug-recording?bug=${b.id}`} /> : <audio controls preload="metadata" className="w-full" src={`/api/admin/bug-recording?bug=${b.id}`} />}
            </div>
          )}
          {s.qtype === "perform" && s.perform && (
            <div className="rounded-lg bg-amber-50/60 p-2">
              <button className="btn-ghost text-xs" onClick={() => setTryOpen((v) => !v)}>🎬 {tryOpen ? t("收起") : t("亲自试做这道题(像用户一样录音/录像复现)")}</button>
              <p className="text-[11px] text-stone-400 mt-1">{t("只判分、不写入用户记录;用户原本的作答不受影响。")}</p>
              {tryOpen && (
                <div className="mt-2">
                  <PerformTask
                    q={{ id: b.questionId, body: { stem: s.stem, captureType: s.perform.captureType, mediaMaterialId: s.perform.mediaMaterialId || 0, analyzeAudio: s.perform.analyzeAudio, countdownSec: 3, autoStopAfterMediaSec: 7, maxDurationSec: 300, rubric: s.perform.rubric || [], instructions: s.perform.instructions || "" } }}
                    mediaSrcOverride={s.perform.mediaMaterialId ? `/api/admin/bug-media?bug=${b.id}&mid=${s.perform.mediaMaterialId}` : null}
                    gradeUrl="/api/perform/grade"
                    dry
                  />
                </div>
              )}
            </div>
          )}
          {!!(s.discuss || []).length && (
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-stone-500 text-xs mb-1">💬 {t("追问/争论记录")}</p>
              {s.discuss.map((m, i) => <div key={i} className="text-xs mb-1"><b>{m.role === "user" ? t("用户") : "AI"}:</b> {m.content}</div>)}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 border-t border-stone-100 pt-2 space-y-2">
        <div className="flex gap-2 items-start">
          <textarea className="input flex-1 text-sm" rows={2} placeholder={t("开发者注释(所有管理员/开发者共享)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-ghost text-xs" onClick={() => act("note", { note })} disabled={busy}>{t("保存注释")}</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {b.status !== "done" ? <button className="btn-ghost text-xs" onClick={() => act("done")} disabled={busy}>✓ {t("标记已完成")}</button> : <button className="btn-ghost text-xs" onClick={() => act("open")} disabled={busy}>↩ {t("重新打开")}</button>}
          {!b.deletedAt ? <button className="btn-ghost text-xs text-red-600" onClick={() => act("delete")} disabled={busy}>🗑 {t("删除(30天后彻底清除)")}</button> : <button className="btn-ghost text-xs" onClick={() => act("restore")} disabled={busy}>♻️ {t("恢复")}</button>}
        </div>
        <details>
          <summary className="text-xs text-amber-700 cursor-pointer">📩 {t("给反馈者发信件")}</summary>
          <input className="input mt-1 text-sm" placeholder={t("信件标题")} value={lt} onChange={(e) => setLt(e.target.value)} />
          <textarea className="input mt-1 text-sm" rows={3} placeholder={t("信件内容(会进对方收件箱,并按其设置发提醒)")} value={lb} onChange={(e) => setLb(e.target.value)} />
          <button className="btn text-xs mt-1 py-1" onClick={() => { act("letter", { letterTitle: lt, letterBody: lb }); setLt(""); setLb(""); }} disabled={busy || !lb.trim()}>{t("发送信件")}</button>
        </details>
      </div>
    </div>
  );
}

export default function Bugs() {
  const t = useT();
  const [bugs, setBugs] = useState(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState("open");
  const reload = () => fetch("/api/admin/bugs").then(async (r) => { if (r.status === 403 || r.status === 401) { setDenied(true); return; } const d = await r.json(); setBugs(d.bugs || []); });
  useEffect(() => { reload(); }, []); // eslint-disable-line

  if (denied) return <p className="mt-16 text-center text-stone-400">{t("仅管理员/开发者可见")}</p>;
  const list = (bugs || []).filter((b) => filter === "all" ? true : filter === "deleted" ? b.deletedAt : filter === "done" ? (b.status === "done" && !b.deletedAt) : (b.status !== "done" && !b.deletedAt));
  const counts = { open: (bugs || []).filter((b) => b.status !== "done" && !b.deletedAt).length, done: (bugs || []).filter((b) => b.status === "done" && !b.deletedAt).length, deleted: (bugs || []).filter((b) => b.deletedAt).length };
  return (
    <div className="space-y-3 md:mt-14 pb-4">
      <h1 className="text-2xl font-bold">🐞 {t("Bug 反馈")}</h1>
      <div className="flex gap-2 text-sm">
        {[["open", t("待处理") + ` (${counts.open})`], ["done", t("已完成") + ` (${counts.done})`], ["deleted", t("已删除") + ` (${counts.deleted})`], ["all", t("全部")]].map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 ${filter === k ? "border-amber-600 bg-amber-50 text-amber-700" : "border-stone-300 text-stone-600"}`}>{label}</button>
        ))}
      </div>
      {bugs === null && <p className="text-stone-400 text-sm">{t("加载中…")}</p>}
      {bugs && !list.length && <p className="text-center text-stone-400 py-10">{t("没有反馈。")}</p>}
      {list.map((b) => <BugCard key={b.id} b={b} t={t} reload={reload} />)}
    </div>
  );
}
